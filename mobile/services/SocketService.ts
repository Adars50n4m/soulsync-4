import { io, Socket } from 'socket.io-client';
import { SERVER_URL } from '../config/api';

export type SocketSignalHandler = (event: string, data: any) => void;

class SocketService {
    private static instance: SocketService;
    private socket: Socket | null = null;
    private userId: string | null = null;
    private listeners: Set<SocketSignalHandler> = new Set();
    private connectionListeners: Set<(connected: boolean) => void> = new Set();
    private isRegistering: boolean = false;

    static getInstance(): SocketService {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }

    /**
     * Initialize the socket connection
     * @param userId The ID of the authenticated user
     */
    initialize(userId: string): void {
        if (this.userId === userId && this.socket?.connected) {
            console.log('[SocketService] Already initialized and connected for', userId);
            return;
        }

        // Cleanup existing socket if any
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }

        this.userId = userId;
        console.log('[SocketService] Initializing socket connection for', userId);

        this.socket = io(SERVER_URL, {
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 10000,
        });

        this.setupListeners();
    }

    private setupListeners(): void {
        if (!this.socket) return;

        this.socket.on('connect', () => {
            console.log('[SocketService] Socket connected:', this.socket?.id);
            this.registerUser();
            this.notifyConnection(true);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[SocketService] Socket disconnected:', reason);
            this.notifyConnection(false);
        });

        this.socket.on('connect_error', (error) => {
            console.warn('[SocketService] Socket connection error:', error.message);
            this.notifyConnection(false);
        });

        // Listen for all events for the generic handlers
        this.socket.onAny((event, ...args) => {
            this.notifyListeners(event, args[0]);
        });
    }

    private registerUser(): void {
        if (!this.socket || !this.userId || this.isRegistering) return;
        
        console.log('[SocketService] Registering user:', this.userId);
        this.isRegistering = true;
        this.socket.emit('register', this.userId);
        
        // Brief delay to prevent rapid re-registration
        setTimeout(() => {
            this.isRegistering = false;
        }, 1000);
    }

    /**
     * Send an event via the socket
     */
    emit(event: string, data: any): void {
        if (this.socket?.connected) {
            this.socket.emit(event, data);
        } else {
            console.warn(`[SocketService] Cannot emit ${event}: socket not connected`);
        }
    }

    /**
     * Add a listener for socket events
     */
    addListener(handler: SocketSignalHandler): void {
        this.listeners.add(handler);
    }

    /**
     * Remove a listener
     */
    removeListener(handler: SocketSignalHandler): void {
        this.listeners.delete(handler);
    }

    /**
     * Add a listener for connection status changes
     */
    addConnectionListener(handler: (connected: boolean) => void): void {
        this.connectionListeners.add(handler);
        if (this.socket) {
            handler(this.socket.connected);
        }
    }

    /**
     * Remove a connection listener
     */
    removeConnectionListener(handler: (connected: boolean) => void): void {
        this.connectionListeners.delete(handler);
    }

    private notifyListeners(event: string, data: any): void {
        this.listeners.forEach(handler => handler(event, data));
    }

    private notifyConnection(connected: boolean): void {
        this.connectionListeners.forEach(handler => handler(connected));
    }

    /**
     * Disconnect the socket
     */
    disconnect(): void {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.userId = null;
        console.log('[SocketService] Socket disconnected manually');
    }

    /**
     * Get the underlying socket instance (internal use only)
     */
    getSocket(): Socket | null {
        return this.socket;
    }

    /**
     * Check if the socket is connected
     */
    isConnected(): boolean {
        return !!this.socket?.connected;
    }
}

export const socketService = SocketService.getInstance();
