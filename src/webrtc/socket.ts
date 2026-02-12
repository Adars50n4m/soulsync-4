import { io, Socket } from 'socket.io-client';

const SIGNALING_URL = 'http://localhost:3001';

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
