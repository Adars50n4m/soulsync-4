const { createServer } = require('http');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3001;

const httpServer = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SoulSync Signaling Server');
});

const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});

io.on('connection', (socket) => {
    console.log(`[Signaling] Client connected: ${socket.id}`);

    // Handle joining a call room
    socket.on('join-call', (roomId) => {
        socket.join(roomId);
        console.log(`User joined room: ${roomId}`);
        socket.to(roomId).emit('user-connected', socket.id);
    });

    // Handle user registration (mapping userId to socket)
    socket.on('register', (userId) => {
        socket.join(userId);
        console.log(`User registered: ${userId}`);
    });

    // Handle outgoing call request
    socket.on('call-request', (data) => {
        const { calleeId, callerId, callType, roomId } = data;
        console.log(`Call request from ${callerId} to ${calleeId}`);
        // Emit to the specific user (calleeId must be joined as a room via 'register')
        socket.to(calleeId).emit('incoming-call', {
            callerId,
            roomId,
            callType
        });
    });

    // Handle WebRTC signaling messages
    socket.on('offer', (data) => {
        const { roomId, offer } = data;
        console.log(`Broadcasting offer in room: ${roomId}`);
        socket.to(roomId).emit('offer', { offer });
    });

    socket.on('answer', ({ roomId, answer }) => {
        console.log(`Broadcasting answer in room: ${roomId}`);
        socket.to(roomId).emit('answer', { answer });
    });

    socket.on('ice-candidate', ({ roomId, candidate }) => {
        console.log(`Broadcasting ICE candidate in room: ${roomId}`);
        socket.to(roomId).emit('ice-candidate', { candidate });
    });

    // Simplified handlers to avoid duplication
    socket.on('end-call', (roomId) => {
        console.log(`[Signaling] ${socket.id} ended call in room ${roomId}`);
        socket.to(roomId).emit('call-ended', { peerId: socket.id });
        socket.leave(roomId);
        socket.data.roomId = null;
    });

    socket.on('disconnect', () => {
        console.log(`[Signaling] Client disconnected: ${socket.id}`);
        if (socket.data.roomId) {
            socket.to(socket.data.roomId).emit('call-ended', { peerId: socket.id });
        }
    });
});

httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`[Signaling] Server running on http://0.0.0.0:${PORT}`);
});

// Keep process alive
process.on('SIGINT', () => {
    console.log('[Signaling] Shutting down...');
    io.close();
    httpServer.close();
    process.exit(0);
});
