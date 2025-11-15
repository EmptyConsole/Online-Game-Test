const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require('socket.io');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Store rooms, players, and bullets in memory
const rooms = new Map();
const bullets = new Map(); // roomId -> Map of bulletId -> bullet
const playerHealth = new Map(); // socketId -> health
const collisionCheckIntervals = new Map(); // roomId -> interval

const MAX_HEALTH = 3;
const BULLET_LIFETIME = 5000;
const PLAYER_SIZE = 40;
const BULLET_SIZE = 8;
const BULLET_SPEED = 10;
const COLLISION_CHECK_INTERVAL = 50; // Check every 50ms

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

  // Helper function to check all bullet collisions in a room
  function checkAllBulletCollisions(roomId) {
    const room = rooms.get(roomId);
    const roomBullets = bullets.get(roomId);

    if (!room || !roomBullets || roomBullets.size === 0) return;

    const now = Date.now();
    const bulletsToRemove = [];

    roomBullets.forEach((bullet, bulletId) => {
      // Calculate current bullet position
      const age = now - bullet.createdAt;
      const distance = (age / 1000) * BULLET_SPEED * 60;
      const bulletX = bullet.direction === 'right' ? bullet.x + distance : bullet.x - distance;
      const bulletY = bullet.y;

      // Check collision with each player (except shooter)
      room.forEach((player, playerId) => {
        if (playerId === bullet.ownerId) return; // Can't hit yourself
        if (player.isDead) return; // Can't hit dead players

        // Simple AABB collision detection
        if (
          bulletX + BULLET_SIZE > player.x &&
          bulletX < player.x + PLAYER_SIZE &&
          bulletY + BULLET_SIZE > player.y &&
          bulletY < player.y + PLAYER_SIZE
        ) {
          // Hit detected!
          console.log('💥 HIT! Bullet', bullet.id, 'hit player', playerId);

          const currentHealth = (playerHealth.get(playerId) || MAX_HEALTH) - 1;
          playerHealth.set(playerId, currentHealth);

          // Mark bullet for removal
          bulletsToRemove.push(bulletId);

          // Notify player they got hit
          io.to(playerId).emit('player-hit', {
            playerId,
            health: currentHealth,
          });

          // Update player state
          player.health = currentHealth;
          if (currentHealth <= 0) {
            player.isDead = true;
            console.log('💀 Player', playerId, 'died!');
          }

          // Broadcast updated health to all players
          io.to(roomId).emit('player-updated', {
            id: playerId,
            ...player,
          });
        }
      });
    });

    // Remove bullets that hit
    bulletsToRemove.forEach(bulletId => {
      roomBullets.delete(bulletId);
      io.to(roomId).emit('bullet-removed', bulletId);
    });
  }

  // Start collision checking interval for a room
  function startCollisionChecking(roomId) {
    if (collisionCheckIntervals.has(roomId)) return; // Already running

    const interval = setInterval(() => {
      checkAllBulletCollisions(roomId);
    }, COLLISION_CHECK_INTERVAL);

    collisionCheckIntervals.set(roomId, interval);
    console.log('🎯 Started collision checking for room:', roomId);
  }

  // Stop collision checking interval for a room
  function stopCollisionChecking(roomId) {
    const interval = collisionCheckIntervals.get(roomId);
    if (interval) {
      clearInterval(interval);
      collisionCheckIntervals.delete(roomId);
      console.log('🛑 Stopped collision checking for room:', roomId);
    }
  }

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

      // Initialize bullets map for room
      if (!bullets.has(roomId)) {
        bullets.set(roomId, new Map());
      }

      // Initialize player health
      playerHealth.set(socket.id, MAX_HEALTH);

      const room = rooms.get(roomId);
      room.set(socket.id, { ...playerData, health: MAX_HEALTH, isDead: false });

      // Start collision checking for this room if not already started
      startCollisionChecking(roomId);

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
          const currentHealth = playerHealth.get(socket.id) || MAX_HEALTH;
          const isDead = currentHealth <= 0;
          room.set(socket.id, { ...playerData, health: currentHealth, isDead });

          // Broadcast to other players in the room
          socket.to(socket.roomId).emit('player-updated', {
            id: socket.id,
            ...playerData,
            health: currentHealth,
            isDead,
          });
        }
      }
    });

    // Shooting
    socket.on('shoot', (data) => {
      console.log('🎯 Shoot event received!', data);
      const { roomId, bullet } = data;
      console.log('💥 Bullet fired:', bullet?.id, 'in room:', roomId);

      const roomBullets = bullets.get(roomId);
      if (roomBullets) {
        roomBullets.set(bullet.id, bullet);

        // Broadcast bullet to all players in room
        io.to(roomId).emit('bullet-fired', bullet);

        // Auto-remove bullet after lifetime
        setTimeout(() => {
          if (roomBullets.has(bullet.id)) {
            roomBullets.delete(bullet.id);
            io.to(roomId).emit('bullet-removed', bullet.id);
            console.log('🗑️  Bullet expired:', bullet.id);
          }
        }, BULLET_LIFETIME);
      }
    });

    // Respawn
    socket.on('respawn', ({ roomId }) => {
      console.log('♻️  Player respawning:', socket.id);

      playerHealth.set(socket.id, MAX_HEALTH);

      const spawnX = 200;
      const spawnY = 900;

      const room = rooms.get(roomId);
      if (room) {
        const playerData = room.get(socket.id);
        if (playerData) {
          playerData.x = spawnX;
          playerData.y = spawnY;
          playerData.health = MAX_HEALTH;
          playerData.isDead = false;
          room.set(socket.id, playerData);
        }
      }

      // Tell the player they respawned
      socket.emit('player-respawned', {
        playerId: socket.id,
        x: spawnX,
        y: spawnY,
        health: MAX_HEALTH,
      });

      // Tell other players
      socket.to(roomId).emit('player-updated', {
        id: socket.id,
        x: spawnX,
        y: spawnY,
        health: MAX_HEALTH,
        isDead: false,
      });
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);

      if (socket.roomId) {
        const room = rooms.get(socket.roomId);
        if (room) {
          room.delete(socket.id);

          // Clean up player health
          playerHealth.delete(socket.id);

          // Tell other players this player left
          socket.to(socket.roomId).emit('player-left', socket.id);

          console.log(`👋 Room ${socket.roomId} now has ${room.size} players`);

          // Clean up empty rooms
          if (room.size === 0) {
            rooms.delete(socket.roomId);
            bullets.delete(socket.roomId); // Clean up bullets too
            stopCollisionChecking(socket.roomId); // Stop collision checking
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
