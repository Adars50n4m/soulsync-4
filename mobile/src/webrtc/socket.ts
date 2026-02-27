import { io, Socket } from 'socket.io-client';

// Replace localhost with EXPO_PUBLIC_SIGNALING_URL or default to Mac's USB/WiFi IP
// '192.0.0.2' is typically the Mac's IP when an iPhone is connected via USB.
const ENV_SIGNALING_URL = process.env.EXPO_PUBLIC_SIGNALING_URL;
const SIGNALING_URL = (ENV_SIGNALING_URL && typeof ENV_SIGNALING_URL === 'string' && ENV_SIGNALING_URL.trim().length > 0)
    ? ENV_SIGNALING_URL
    : 'http://192.0.0.2:3001';

export let socket: Socket | null = null;

export const getSocket = (): Socket => {
    if (!socket) {
        socket = io(SIGNALING_URL, {
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });
    }
    return socket;
};

export const connectSocket = (): Socket => {
    const s = getSocket();
    if (!s.connected) {
        s.connect();
    }
    return s;
};

export const disconnectSocket = (): void => {
    if (socket?.connected) {
        socket.disconnect();
    }
};
