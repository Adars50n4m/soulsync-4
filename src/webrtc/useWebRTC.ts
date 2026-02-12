import { useEffect, useRef, useState, useCallback } from 'react';
import { connectSocket, getSocket } from './socket';
import {
    createPeer,
    createOffer,
    createAnswer,
    setRemoteDescription,
    addIceCandidate,
    attachLocalStream,
    closePeer,
    getUserMedia,
    stopStream,
} from './peer';

interface UseWebRTCOptions {
    roomId: string;
    callType: 'audio' | 'video';
    isMuted: boolean;
    active: boolean;
}

interface UseWebRTCReturn {
    localStream: MediaStream | null;
    remoteStream: MediaStream | null;
    connectionState: RTCPeerConnectionState | 'new';
    cleanup: () => void;
}

// Module-level store so PiP overlay can access the active streams
let _activeLocalStream: MediaStream | null = null;
let _activeRemoteStream: MediaStream | null = null;
const _streamListeners: Set<() => void> = new Set();

export const getActiveStreams = () => ({
    local: _activeLocalStream,
    remote: _activeRemoteStream,
});

export const onStreamsChange = (listener: () => void) => {
    _streamListeners.add(listener);
    return () => { _streamListeners.delete(listener); };
};

const notifyStreamListeners = () => {
    _streamListeners.forEach((fn) => fn());
};

export const useWebRTC = ({ roomId, callType, isMuted, active }: UseWebRTCOptions): UseWebRTCReturn => {
    const [localStream, setLocalStream] = useState<MediaStream | null>(null);
    const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
    const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'new'>('new');

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const isInitiator = useRef(false);
    const hasJoined = useRef(false);
    const candidateQueue = useRef<RTCIceCandidateInit[]>([]);

    const cleanup = useCallback(() => {
        const socket = getSocket();
        if (roomId) {
            socket.emit('end-call', roomId);
        }

        closePeer(pcRef.current);
        pcRef.current = null;

        stopStream(localStreamRef.current);
        localStreamRef.current = null;

        remoteStreamRef.current = null;
        _activeLocalStream = null;
        _activeRemoteStream = null;
        notifyStreamListeners();

        setLocalStream(null);
        setRemoteStream(null);
        setConnectionState('new');
        hasJoined.current = false;
    }, [roomId]);

    // Mute/unmute local audio tracks reactively
    useEffect(() => {
        if (localStreamRef.current) {
            localStreamRef.current.getAudioTracks().forEach((track) => {
                track.enabled = !isMuted;
            });
        }
    }, [isMuted]);

    // Main WebRTC lifecycle
    useEffect(() => {
        if (!active || !roomId || hasJoined.current) return;

        const socket = connectSocket();
        let mounted = true;

        const init = async () => {
            try {
                // Get local media
                const stream = await getUserMedia(callType);
                if (!mounted) { stopStream(stream); return; }

                localStreamRef.current = stream;
                _activeLocalStream = stream;
                setLocalStream(stream);
                notifyStreamListeners();

                // Apply initial mute state
                stream.getAudioTracks().forEach((track) => {
                    track.enabled = !isMuted;
                });

                // Create peer connection
                const pc = createPeer(
                    // On ICE candidate
                    (candidate) => {
                        socket.emit('ice-candidate', { roomId, candidate: candidate.toJSON() });
                    },
                    // On remote track
                    (remoteStr) => {
                        remoteStreamRef.current = remoteStr;
                        _activeRemoteStream = remoteStr;
                        setRemoteStream(remoteStr);
                        notifyStreamListeners();
                    },
                    // On connection state change
                    (state) => {
                        if (mounted) setConnectionState(state);
                    }
                );

                pcRef.current = pc;
                attachLocalStream(pc, stream);

                // --- Socket event handlers ---

                // When a new peer joins our room, we are the initiator (create offer)
                const handlePeerJoined = async () => {
                    if (!pcRef.current) return;
                    console.log('[WebRTC] Peer joined (user-connected), creating offer...');
                    isInitiator.current = true;
                    try {
                        const offer = await createOffer(pcRef.current);
                        socket.emit('offer', { roomId, offer });
                    } catch (err) {
                        console.error('[WebRTC] Failed to create offer:', err);
                    }
                };

                // When we receive an offer, create an answer
                const handleOffer = async ({ offer }: { offer: RTCSessionDescriptionInit }) => {
                    if (!pcRef.current) return;
                    console.log('[WebRTC] Received offer, creating answer...');
                    try {
                        await setRemoteDescription(pcRef.current, offer);
                        // Flush queued ICE candidates
                        for (const c of candidateQueue.current) {
                            await addIceCandidate(pcRef.current, c);
                        }
                        candidateQueue.current = [];

                        const answer = await createAnswer(pcRef.current);
                        socket.emit('answer', { roomId, answer });
                    } catch (err) {
                        console.error('[WebRTC] Failed to handle offer:', err);
                    }
                };

                // When we receive an answer, set remote description
                const handleAnswer = async ({ answer }: { answer: RTCSessionDescriptionInit }) => {
                    if (!pcRef.current) return;
                    console.log('[WebRTC] Received answer');
                    try {
                        await setRemoteDescription(pcRef.current, answer);
                        // Flush queued ICE candidates
                        for (const c of candidateQueue.current) {
                            await addIceCandidate(pcRef.current, c);
                        }
                        candidateQueue.current = [];
                    } catch (err) {
                        console.error('[WebRTC] Failed to handle answer:', err);
                    }
                };

                // When we receive an ICE candidate
                const handleIceCandidate = async ({ candidate }: { candidate: RTCIceCandidateInit }) => {
                    if (!pcRef.current) return;
                    if (pcRef.current.remoteDescription) {
                        await addIceCandidate(pcRef.current, candidate);
                    } else {
                        // Queue candidate until remote description is set
                        candidateQueue.current.push(candidate);
                    }
                };

                // When the remote peer ends the call
                const handleCallEnded = () => {
                    if (mounted) {
                        cleanup();
                    }
                };

                socket.on('user-connected', handlePeerJoined);
                socket.on('offer', handleOffer);
                socket.on('answer', handleAnswer);
                socket.on('ice-candidate', handleIceCandidate);
                socket.on('call-ended', handleCallEnded);

                // Join the room
                console.log(`[WebRTC] Joining room: ${roomId}`);
                socket.emit('join-call', roomId);
                hasJoined.current = true;

                // Cleanup function stored for unmount
                return () => {
                    socket.off('user-connected', handlePeerJoined);
                    socket.off('offer', handleOffer);
                    socket.off('answer', handleAnswer);
                    socket.off('ice-candidate', handleIceCandidate);
                    socket.off('call-ended', handleCallEnded);
                };
            } catch (err) {
                console.error('[WebRTC] Failed to initialize:', err);
            }
        };

        let socketCleanup: (() => void) | undefined;
        init().then((cleanupFn) => {
            socketCleanup = cleanupFn;
        });

        return () => {
            mounted = false;
            socketCleanup?.();
            // NOTE: We do NOT cleanup streams here because minimize unmounts the component
            // but we want streams to survive. Cleanup is called explicitly via cleanup().
        };
    }, [active, roomId]); // eslint-disable-line react-hooks/exhaustive-deps

    return { localStream, remoteStream, connectionState, cleanup };
};
