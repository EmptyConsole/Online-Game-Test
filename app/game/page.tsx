'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
// FIREBASE CODE COMMENTED OUT - keeping for backup
// import { db } from '@/lib/firebase';
// import {
//   collection,
//   doc,
//   setDoc,
//   onSnapshot,
//   deleteDoc,
// } from 'firebase/firestore';
import { useSearchParams } from 'next/navigation';
import { io, Socket } from 'socket.io-client';

interface Player {
  id: string;
  x: number;
  y: number;
  color: string;
  emoji: string;
  lastDirection: 'left' | 'right';
  health?: number;
  isDead?: boolean;
}

interface InterpolatedPlayer extends Player {
  targetX: number;
  targetY: number;
  renderX: number;
  renderY: number;
}

interface Bullet {
  id: string;
  x: number;
  y: number;
  direction: 'left' | 'right';
  ownerId: string;
  createdAt: number;
}

interface Platform {
  x: number;
  y: number;
  width: number;
  height: number;
}

const EMOJIS = ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯'];
const COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#FFA07A',
  '#98D8C8',
  '#F7DC6F',
  '#BB8FCE',
  '#85C1E2',
  '#F8B739',
  '#52B788',
];

// Game constants
const GRAVITY = 0.6;
const JUMP_STRENGTH = -15;
const MOVE_SPEED = 5;
const PLAYER_SIZE = 40;
const MAP_WIDTH = 2400;
const MAP_HEIGHT = 1200;
const VIEWPORT_WIDTH = 800;
const VIEWPORT_HEIGHT = 600;
const INTERPOLATION_SPEED = 0.2;
const BULLET_SPEED = 10;
const BULLET_SIZE = 8;
const BULLET_LIFETIME = 5000; // 5 seconds
const MAX_HEALTH = 3;
const RESPAWN_TIME = 5000; // 5 seconds

// Platforms - bigger map with more platforms
const PLATFORMS: Platform[] = [
  // Ground sections
  { x: 0, y: 1150, width: 400, height: 50 },
  { x: 500, y: 1150, width: 400, height: 50 },
  { x: 1000, y: 1150, width: 400, height: 50 },
  { x: 1500, y: 1150, width: 400, height: 50 },
  { x: 2000, y: 1150, width: 400, height: 50 },

  // Lower platforms
  { x: 200, y: 1000, width: 150, height: 20 },
  { x: 450, y: 950, width: 150, height: 20 },
  { x: 700, y: 1000, width: 150, height: 20 },
  { x: 1000, y: 950, width: 200, height: 20 },
  { x: 1300, y: 1000, width: 150, height: 20 },
  { x: 1600, y: 950, width: 150, height: 20 },
  { x: 1900, y: 1000, width: 150, height: 20 },
  { x: 2150, y: 950, width: 150, height: 20 },

  // Middle platforms
  { x: 100, y: 800, width: 120, height: 20 },
  { x: 350, y: 750, width: 150, height: 20 },
  { x: 600, y: 800, width: 120, height: 20 },
  { x: 850, y: 700, width: 150, height: 20 },
  { x: 1150, y: 750, width: 200, height: 20 },
  { x: 1450, y: 800, width: 120, height: 20 },
  { x: 1700, y: 750, width: 150, height: 20 },
  { x: 1950, y: 800, width: 120, height: 20 },
  { x: 2200, y: 750, width: 150, height: 20 },

  // Upper platforms
  { x: 250, y: 550, width: 150, height: 20 },
  { x: 550, y: 500, width: 120, height: 20 },
  { x: 800, y: 450, width: 150, height: 20 },
  { x: 1100, y: 500, width: 200, height: 20 },
  { x: 1400, y: 550, width: 120, height: 20 },
  { x: 1700, y: 500, width: 150, height: 20 },
  { x: 2000, y: 550, width: 150, height: 20 },

  // Top platforms
  { x: 400, y: 300, width: 150, height: 20 },
  { x: 750, y: 250, width: 120, height: 20 },
  { x: 1050, y: 200, width: 150, height: 20 },
  { x: 1350, y: 250, width: 200, height: 20 },
  { x: 1700, y: 300, width: 150, height: 20 },
  { x: 2050, y: 250, width: 120, height: 20 },

  // Floating islands
  { x: 50, y: 350, width: 100, height: 20 },
  { x: 2250, y: 350, width: 100, height: 20 },
];

function GameContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('room') || 'default-room';

  const [players, setPlayers] = useState<Record<string, InterpolatedPlayer>>({});
  const [bullets, setBullets] = useState<Record<string, Bullet>>({});
  const [isClient, setIsClient] = useState(false);
  const [health, setHealth] = useState(MAX_HEALTH);
  const [isDead, setIsDead] = useState(false);
  const [respawnTimer, setRespawnTimer] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const playerIdRef = useRef<string>('');
  const playerEmojiRef = useRef<string>('');
  const playerColorRef = useRef<string>('');

  const playerRef = useRef({
    x: 200,
    y: 900,
    velocityY: 0,
    isOnGround: false,
    lastDirection: 'right' as 'left' | 'right',
  });

  const cameraRef = useRef({
    x: 0,
    y: 0,
  });

  const keysPressed = useRef({
    left: false,
    right: false,
    jump: false,
    shoot: false,
  });

  const gameLoopRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(Date.now());
  const lastSocketUpdateRef = useRef<number>(Date.now());
  const lastSentPosition = useRef({ x: 200, y: 900 });
  const lastShotTime = useRef<number>(0);
  const respawnTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      playerEmojiRef.current = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      playerColorRef.current = COLORS[Math.floor(Math.random() * COLORS.length)];
      setIsClient(true);
    }
  }, []);

  // Respawn timer countdown
  useEffect(() => {
    if (!isDead || respawnTimer <= 0) return;

    const interval = setInterval(() => {
      setRespawnTimer((prev) => {
        if (prev <= 1) {
          // Respawn player
          if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('respawn', { roomId });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isDead, respawnTimer, roomId]);

  // Socket.io connection
  useEffect(() => {
    if (!isClient) return;

    console.log('🔌 Connecting to Socket.io server...');

    // Use current hostname (works for both localhost and ngrok)
    const socket = io({
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('✅ Connected to server! Socket ID:', socket.id);
      playerIdRef.current = socket.id;

      // Join the room
      const playerData = {
        x: playerRef.current.x,
        y: playerRef.current.y,
        color: playerColorRef.current,
        emoji: playerEmojiRef.current,
        lastDirection: 'right' as const,
      };

      console.log('🚪 Joining room:', roomId);
      socket.emit('join-room', { roomId, playerData });
    });

    // Receive all players state when joining
    socket.on('players-state', (allPlayers: Record<string, Player>) => {
      console.log('🎮 Received all players:', Object.keys(allPlayers).length);
      const interpolatedPlayers: Record<string, InterpolatedPlayer> = {};

      Object.entries(allPlayers).forEach(([id, player]) => {
        interpolatedPlayers[id] = {
          ...player,
          targetX: player.x,
          targetY: player.y,
          renderX: player.x,
          renderY: player.y,
        };
      });

      setPlayers(interpolatedPlayers);
    });

    // New player joined
    socket.on('player-joined', (playerData: Player) => {
      console.log('👤 Player joined:', playerData.id, playerData.emoji);
      setPlayers((prev) => ({
        ...prev,
        [playerData.id]: {
          ...playerData,
          targetX: playerData.x,
          targetY: playerData.y,
          renderX: playerData.x,
          renderY: playerData.y,
        },
      }));
    });

    // Player position updated
    socket.on('player-updated', (playerData: Player) => {
      setPlayers((prev) => {
        const existing = prev[playerData.id];
        if (!existing) return prev;

        return {
          ...prev,
          [playerData.id]: {
            ...existing,
            ...playerData,
            targetX: playerData.x,
            targetY: playerData.y,
          },
        };
      });
    });

    // Player left
    socket.on('player-left', (playerId: string) => {
      console.log('👋 Player left:', playerId);
      setPlayers((prev) => {
        const newPlayers = { ...prev };
        delete newPlayers[playerId];
        return newPlayers;
      });
    });

    // Bullet events
    socket.on('bullet-fired', (bullet: Bullet) => {
      setBullets((prev) => ({
        ...prev,
        [bullet.id]: bullet,
      }));
    });

    socket.on('bullet-removed', (bulletId: string) => {
      setBullets((prev) => {
        const newBullets = { ...prev };
        delete newBullets[bulletId];
        return newBullets;
      });
    });

    // Player hit event
    socket.on('player-hit', ({ playerId, health }: { playerId: string; health: number }) => {
      if (playerId === socket.id) {
        setHealth(health);
        if (health <= 0) {
          setIsDead(true);
          setRespawnTimer(RESPAWN_TIME / 1000);
        }
      }
    });

    // Player respawned event
    socket.on('player-respawned', ({ playerId, x, y, health }: { playerId: string; x: number; y: number; health: number }) => {
      if (playerId === socket.id) {
        playerRef.current.x = x;
        playerRef.current.y = y;
        playerRef.current.velocityY = 0;
        setHealth(health);
        setIsDead(false);
        setRespawnTimer(0);
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Disconnected from server');
    });

    return () => {
      console.log('🔌 Cleaning up socket connection');
      socket.disconnect();
    };
  }, [isClient, roomId]);

  /* FIREBASE CODE COMMENTED OUT
  useEffect(() => {
    if (!isClient || !playerIdRef.current) return;

    const initializePlayer = async () => {
      try {
        await setDoc(
          doc(db, 'rooms', roomId, 'players', playerIdRef.current),
          {
            x: playerRef.current.x,
            y: playerRef.current.y,
            color: playerColorRef.current,
            emoji: playerEmojiRef.current,
            lastDirection: 'right',
          }
        );
        console.log('Player added to Firebase successfully');
      } catch (error) {
        console.error('Error adding player to Firebase:', error);
      }
    };

    initializePlayer();
  }, [isClient, roomId]);

  useEffect(() => {
    if (!isClient) return;

    const unsubscribe = onSnapshot(
      collection(db, 'rooms', roomId, 'players'),
      (snapshot) => {
        const playersData: Record<string, InterpolatedPlayer> = {};
        snapshot.forEach((doc) => {
          const data = doc.data() as Player;
          playersData[doc.id] = {
            ...data,
            id: doc.id,
            targetX: data.x,
            targetY: data.y,
            renderX: data.x,
            renderY: data.y,
          };
        });
        setPlayers(playersData);
      }
    );

    return () => unsubscribe();
  }, [roomId, isClient]);
  */

  const checkCollision = (x: number, y: number, velocityY: number): { collided: boolean; platform: Platform | null } => {
    for (const platform of PLATFORMS) {
      if (
        x < platform.x + platform.width &&
        x + PLAYER_SIZE > platform.x &&
        y + PLAYER_SIZE > platform.y &&
        y + PLAYER_SIZE <= platform.y + platform.height
      ) {
        if (velocityY >= 0) {
          return { collided: true, platform };
        }
      }
    }
    return { collided: false, platform: null };
  };

  const updatePlayerPosition = (x: number, y: number, lastDirection: 'left' | 'right') => {
    if (!socketRef.current || !socketRef.current.connected) return;

    socketRef.current.emit('player-update', {
      x,
      y,
      color: playerColorRef.current,
      emoji: playerEmojiRef.current,
      lastDirection,
    });
  };

  const shootBullet = () => {
    const now = Date.now();
    const timeSinceLastShot = now - lastShotTime.current;

    if (timeSinceLastShot < 500 && lastShotTime.current !== 0) {
      return; // Cooldown
    }

    if (isDead) {
      return; // Can't shoot when dead
    }

    lastShotTime.current = now;

    const bullet: Bullet = {
      id: `bullet-${playerIdRef.current}-${now}`,
      x: playerRef.current.x + (playerRef.current.lastDirection === 'right' ? PLAYER_SIZE : 0),
      y: playerRef.current.y + PLAYER_SIZE / 2 - BULLET_SIZE / 2,
      direction: playerRef.current.lastDirection,
      ownerId: playerIdRef.current,
      createdAt: now,
    };

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('shoot', { roomId, bullet });
    }
  };

  useEffect(() => {
    if (!isClient) return;

    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = now - lastUpdateRef.current;

      if (deltaTime < 16) {
        gameLoopRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      lastUpdateRef.current = now;

      let { x, y, velocityY, isOnGround, lastDirection } = playerRef.current;

      // Skip movement if dead
      if (!isDead) {
        // Horizontal movement
        if (keysPressed.current.left) {
          x -= MOVE_SPEED;
          lastDirection = 'left';
        }
        if (keysPressed.current.right) {
          x += MOVE_SPEED;
          lastDirection = 'right';
        }
      }

      x = Math.max(0, Math.min(MAP_WIDTH - PLAYER_SIZE, x));

      // Skip physics if dead
      if (!isDead) {
        // Apply gravity
        velocityY += GRAVITY;
        y += velocityY;

        // Collision detection
        const { collided, platform } = checkCollision(x, y, velocityY);

        if (collided && platform) {
          y = platform.y - PLAYER_SIZE;
          velocityY = 0;
          isOnGround = true;
        } else {
          isOnGround = false;
        }

        if (y > MAP_HEIGHT - PLAYER_SIZE) {
          y = MAP_HEIGHT - PLAYER_SIZE;
          velocityY = 0;
          isOnGround = true;
        }

        // Jump
        if (keysPressed.current.jump && isOnGround) {
          velocityY = JUMP_STRENGTH;
          isOnGround = false;
        }
      }

      playerRef.current = { x, y, velocityY, isOnGround, lastDirection };

      // Update camera
      cameraRef.current.x = Math.max(0, Math.min(MAP_WIDTH - VIEWPORT_WIDTH, x - VIEWPORT_WIDTH / 2 + PLAYER_SIZE / 2));
      cameraRef.current.y = Math.max(0, Math.min(MAP_HEIGHT - VIEWPORT_HEIGHT, y - VIEWPORT_HEIGHT / 2 + PLAYER_SIZE / 2));

      // Send position updates via Socket.io (every 100ms or significant movement)
      const distanceMoved = Math.sqrt(
        Math.pow(x - lastSentPosition.current.x, 2) +
        Math.pow(y - lastSentPosition.current.y, 2)
      );

      const shouldUpdate = (now - lastSocketUpdateRef.current >= 100) || (distanceMoved > 30);

      if (shouldUpdate) {
        updatePlayerPosition(x, y, lastDirection);
        lastSocketUpdateRef.current = now;
        lastSentPosition.current = { x, y };
      }

      // Interpolate other players
      setPlayers((prev) => {
        const updated = { ...prev };
        Object.keys(updated).forEach((id) => {
          if (id !== playerIdRef.current) {
            const player = updated[id];
            player.renderX += (player.targetX - player.renderX) * INTERPOLATION_SPEED;
            player.renderY += (player.targetY - player.renderY) * INTERPOLATION_SPEED;
          }
        });
        return updated;
      });

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [isClient, isDead]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysPressed.current.left = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysPressed.current.right = true;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        keysPressed.current.jump = true;
      }
      if (e.key === 'm' || e.key === 'M' || e.key === 'x' || e.key === 'X') {
        keysPressed.current.shoot = true;
        e.preventDefault(); // Prevent default browser behavior

        // Also trigger shoot immediately
        shootBullet();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysPressed.current.left = false;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysPressed.current.right = false;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        keysPressed.current.jump = false;
      }
      if (e.key === 'm' || e.key === 'M' || e.key === 'x' || e.key === 'X') {
        keysPressed.current.shoot = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  if (!isClient) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        Loading game...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-2xl font-bold">Multiplayer Platformer (Socket.io)</h1>
        <div className="mt-2 flex items-center gap-4">
          <p className="text-sm text-gray-400">
            Room: <span className="text-white font-mono">{roomId}</span>
          </p>
          <p className="text-sm text-gray-400">
            You: <span className="text-2xl">{playerEmojiRef.current}</span>
          </p>
          <p className="text-sm text-gray-400">
            Players online: <span className="text-white">{Object.keys(players).length}</span>
          </p>
          <p className="text-sm text-gray-400">
            Socket: <span className={socketRef.current?.connected ? 'text-green-400' : 'text-red-400'}>
              {socketRef.current?.connected ? '🟢 Connected' : '🔴 Disconnected'}
            </span>
          </p>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Controls: Arrow Keys/WASD to move, Space/W/Up to jump, M/X to shoot
        </p>
        <div className="mt-2 flex items-center gap-2">
          <span className="text-sm text-gray-400">Health:</span>
          <div className="flex gap-1">
            {[...Array(MAX_HEALTH)].map((_, i) => (
              <div
                key={i}
                className={`w-6 h-6 rounded ${
                  i < health ? 'bg-red-500' : 'bg-gray-600'
                }`}
              >
                {i < health ? '❤️' : ''}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <div
          className="relative bg-sky-400 overflow-hidden"
          style={{
            width: `${VIEWPORT_WIDTH}px`,
            height: `${VIEWPORT_HEIGHT}px`,
          }}
        >
          {/* Platforms */}
          {PLATFORMS.map((platform, index) => (
            <div
              key={index}
              className="absolute bg-green-700 border-2 border-green-900"
              style={{
                left: `${platform.x - cameraRef.current.x}px`,
                top: `${platform.y - cameraRef.current.y}px`,
                width: `${platform.width}px`,
                height: `${platform.height}px`,
              }}
            />
          ))}

          {/* Bullets */}
          {Object.entries(bullets).map(([id, bullet]) => {
            const now = Date.now();
            const age = now - bullet.createdAt;
            const distance = (age / 1000) * BULLET_SPEED * 60;
            const bulletX = bullet.direction === 'right' ? bullet.x + distance : bullet.x - distance;
            const bulletY = bullet.y;

            const screenX = bulletX - cameraRef.current.x;
            const screenY = bulletY - cameraRef.current.y;

            // Only render if in viewport
            if (screenX < -50 || screenX > VIEWPORT_WIDTH + 50 || screenY < -50 || screenY > VIEWPORT_HEIGHT + 50) {
              return null;
            }

            return (
              <div
                key={id}
                className="absolute bg-yellow-400 rounded-full border-2 border-yellow-600"
                style={{
                  left: `${screenX}px`,
                  top: `${screenY}px`,
                  width: `${BULLET_SIZE}px`,
                  height: `${BULLET_SIZE}px`,
                  zIndex: 15,
                }}
              />
            );
          })}

          {/* Players */}
          {Object.entries(players).map(([id, player]) => {
            const isCurrentPlayer = id === playerIdRef.current;

            let displayX, displayY;
            if (isCurrentPlayer) {
              displayX = playerRef.current.x;
              displayY = playerRef.current.y;
            } else {
              displayX = player.renderX;
              displayY = player.renderY;
            }

            const screenX = displayX - cameraRef.current.x;
            const screenY = displayY - cameraRef.current.y;

            return (
              <div
                key={id}
                className="absolute"
                style={{
                  left: `${screenX}px`,
                  top: `${screenY}px`,
                  width: `${PLAYER_SIZE}px`,
                  height: `${PLAYER_SIZE}px`,
                  transform: `scaleX(${player.lastDirection === 'left' ? -1 : 1})`,
                  zIndex: isCurrentPlayer ? 10 : 5,
                }}
              >
                <div
                  className={`w-full h-full rounded-lg flex items-center justify-center text-2xl shadow-lg ${
                    isCurrentPlayer ? 'border-4 border-yellow-400' : 'border-4 border-blue-600'
                  }`}
                  style={{ backgroundColor: player.color }}
                >
                  {player.emoji}
                </div>
                {/* Label */}
                <div className={`absolute -top-8 left-0 text-xs text-white px-1 rounded whitespace-nowrap ${
                  isCurrentPlayer ? 'bg-yellow-600' : 'bg-blue-600'
                }`}>
                  {isCurrentPlayer ? 'YOU' : 'OTHER'}: {player.emoji}
                </div>
              </div>
            );
          })}

          {/* Respawn Overlay */}
          {isDead && (
            <div className="absolute inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
              <div className="text-center">
                <h2 className="text-4xl font-bold text-red-500 mb-4">💀 You Died!</h2>
                <p className="text-2xl text-white">
                  Respawning in {respawnTimer} seconds...
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function GamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">Loading game...</div>}>
      <GameContent />
    </Suspense>
  );
}
