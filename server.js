const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store rooms and players in memory
const rooms = new Map();

app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  const io = new Server(httpServer, {
    cors: {
      origin: '*',
    },
  });

  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // Join room
    socket.on('join-room', ({ roomId, playerData }) => {
      console.log('🚪 Player joining room:', roomId, playerData);

      socket.join(roomId);
      socket.roomId = roomId;
      socket.playerData = playerData;

      // Initialize room if it doesn't exist
      if (!rooms.has(roomId)) {
        rooms.set(roomId, new Map());
      }

      const room = rooms.get(roomId);
      room.set(socket.id, playerData);

      // Send current players to the new player
      const allPlayers = {};
      room.forEach((player, id) => {
        allPlayers[id] = player;
      });

      // Tell the new player about all existing players
      socket.emit('players-state', allPlayers);

      // Tell other players about the new player
      socket.to(roomId).emit('player-joined', {
        id: socket.id,
        ...playerData,
      });

      console.log(`✅ Room ${roomId} now has ${room.size} players`);
    });

    // Update player position
    socket.on('player-update', (playerData) => {
      if (socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (room) {
          room.set(socket.id, playerData);

          // Broadcast to other players in the room
          socket.to(socket.roomId).emit('player-updated', {
            id: socket.id,
            ...playerData,
          });
        }
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);

      if (socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (room) {
          room.delete(socket.id);

          // Tell other players this player left
          socket.to(socket.roomId).emit('player-left', socket.id);

          console.log(`👋 Room ${socket.roomId} now has ${room.size} players`);

          // Clean up empty rooms
          if (room.size === 0) {
            rooms.delete(socket.roomId);
            console.log(`🗑️  Room ${socket.roomId} deleted (empty)`);
          }
        }
      }
    });
  });

  httpServer
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
    });
});
