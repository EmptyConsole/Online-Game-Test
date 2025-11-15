'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import { useSearchParams } from 'next/navigation';

interface Player {
  id: string;
  x: number;
  y: number;
  color: string;
  emoji: string;
  lastDirection: 'left' | 'right';
}

interface InterpolatedPlayer extends Player {
  targetX: number;
  targetY: number;
  renderX: number;
  renderY: number;
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
  const [isClient, setIsClient] = useState(false);

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
  });

  const gameLoopRef = useRef<number | undefined>(undefined);
  const lastUpdateRef = useRef<number>(Date.now());
  const lastFirebaseUpdateRef = useRef<number>(Date.now());
  const lastSentPosition = useRef({ x: 200, y: 900 });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      playerIdRef.current = `player-${Math.random().toString(36).substr(2, 9)}`;
      playerEmojiRef.current = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      playerColorRef.current = COLORS[Math.floor(Math.random() * COLORS.length)];
      setIsClient(true);
    }
  }, []);

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

    console.log('🎮 Setting up player listener for room:', roomId);
    console.log('🎮 My player ID:', playerIdRef.current);

    const unsubscribe = onSnapshot(
      collection(db, 'rooms', roomId, 'players'),
      (snapshot) => {
        console.log('🔥 Firebase snapshot received!');
        console.log('🔥 Total players in room:', snapshot.size);

        const playersData: Record<string, InterpolatedPlayer> = {};

        snapshot.forEach((doc) => {
          const data = doc.data() as Player;
          console.log('👤 Player found:', {
            id: doc.id,
            emoji: data.emoji,
            x: data.x,
            y: data.y,
            color: data.color
          });

          playersData[doc.id] = {
            ...data,
            id: doc.id,
            targetX: data.x,
            targetY: data.y,
            renderX: data.x,
            renderY: data.y,
          };
        });

        console.log('✅ Setting players state:', Object.keys(playersData).map(id => id.slice(0, 8)));
        console.log('✅ Total players being set:', Object.keys(playersData).length);
        setPlayers(playersData);
      },
      (error) => {
        console.error('❌ Firebase players error:', error);
      }
    );

    return () => {
      console.log('🔌 Disconnecting player listener');
      unsubscribe();
    };
  }, [roomId, isClient]);

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

  const updatePlayerPosition = async (x: number, y: number, lastDirection: 'left' | 'right') => {
    if (!playerIdRef.current) return;

    try {
      await setDoc(
        doc(db, 'rooms', roomId, 'players', playerIdRef.current),
        {
          x,
          y,
          color: playerColorRef.current,
          emoji: playerEmojiRef.current,
          lastDirection,
        }
      );
    } catch (error) {
      // Silently handle quota errors to avoid console spam
      if (!error.toString().includes('quota')) {
        console.error('Error updating player position:', error);
      }
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

      // Horizontal movement
      if (keysPressed.current.left) {
        x -= MOVE_SPEED;
        lastDirection = 'left';
      }
      if (keysPressed.current.right) {
        x += MOVE_SPEED;
        lastDirection = 'right';
      }

      x = Math.max(0, Math.min(MAP_WIDTH - PLAYER_SIZE, x));

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

      playerRef.current = { x, y, velocityY, isOnGround, lastDirection };

      // Update camera
      cameraRef.current.x = Math.max(0, Math.min(MAP_WIDTH - VIEWPORT_WIDTH, x - VIEWPORT_WIDTH / 2 + PLAYER_SIZE / 2));
      cameraRef.current.y = Math.max(0, Math.min(MAP_HEIGHT - VIEWPORT_HEIGHT, y - VIEWPORT_HEIGHT / 2 + PLAYER_SIZE / 2));

      // Only update Firebase if position changed significantly AND enough time passed
      const distanceMoved = Math.sqrt(
        Math.pow(x - lastSentPosition.current.x, 2) +
        Math.pow(y - lastSentPosition.current.y, 2)
      );

      // Update every 1 second OR if moved more than 50 pixels
      const shouldUpdate = (now - lastFirebaseUpdateRef.current >= 1000) || (distanceMoved > 50);

      if (shouldUpdate) {
        console.log('📤 Sending position update:', { x, y, lastDirection });
        updatePlayerPosition(x, y, lastDirection);
        lastFirebaseUpdateRef.current = now;
        lastSentPosition.current = { x, y };
      }

      // Interpolate other players (log less frequently)
      if (Math.random() < 0.01) { // Only log 1% of frames
        console.log('🔄 Players in state:', Object.keys(players).length);
      }

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
  }, [roomId, isClient]);

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
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (playerIdRef.current) {
        deleteDoc(doc(db, 'rooms', roomId, 'players', playerIdRef.current)).catch((e) => {
          console.error('Error cleaning up player:', e);
        });
      }
    };
  }, [roomId]);

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
        <h1 className="text-2xl font-bold">Multiplayer Platformer</h1>
        <div className="mt-2 flex items-center gap-4">
          <p className="text-sm text-gray-400">
            Room: <span className="text-white font-mono">{roomId}</span>
          </p>
          <p className="text-sm text-gray-400">
            You: <span className="text-2xl">{playerEmojiRef.current}</span> ({playerIdRef.current.slice(0, 8)})
          </p>
          <p className="text-sm text-gray-400">
            Players online: <span className="text-white">{Object.keys(players).length}</span>
          </p>
          <p className="text-sm text-gray-400">
            Position: <span className="text-white">({Math.round(playerRef.current.x)}, {Math.round(playerRef.current.y)})</span>
          </p>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          Players in state: {Object.keys(players).map(id => id.slice(0, 8)).join(', ') || 'NONE'}
        </div>
        <div className="mt-1 text-xs font-bold" style={{ color: Object.keys(players).length > 1 ? '#00ff00' : '#ff0000' }}>
          {Object.keys(players).length > 1 ? '✅ MULTIPLAYER WORKING!' : '⚠️ Only you in room (invite someone!)'}
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Controls: Arrow Keys/WASD to move, Space/W/Up to jump
        </p>
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

          {/* Players */}
          {Object.entries(players).length === 0 && (
            <div className="absolute top-4 left-4 text-white bg-red-600 px-3 py-2 rounded">
              ⚠️ No players in state!
            </div>
          )}
          {Object.entries(players).map(([id, player]) => {
            const isCurrentPlayer = id === playerIdRef.current;

            // Use local position for current player, interpolated for others
            let displayX, displayY;
            if (isCurrentPlayer) {
              displayX = playerRef.current.x;
              displayY = playerRef.current.y;
              console.log('🎯 Rendering current player at:', displayX, displayY);
            } else {
              displayX = player.renderX;
              displayY = player.renderY;
              console.log('👥 Rendering other player', id.slice(0, 8), 'at:', displayX, displayY);
            }

            const screenX = displayX - cameraRef.current.x;
            const screenY = displayY - cameraRef.current.y;

            console.log(`📍 Player ${id.slice(0, 8)} screen position:`, screenX, screenY, 'Camera:', cameraRef.current);

            // Don't filter by screen bounds during debugging
            // if (screenX < -100 || screenX > VIEWPORT_WIDTH + 100 ||
            //     screenY < -100 || screenY > VIEWPORT_HEIGHT + 100) {
            //   console.log(`🚫 Player ${id.slice(0, 8)} off screen, skipping render`);
            //   return null;
            // }

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
                    isCurrentPlayer ? 'border-4 border-yellow-400' : 'border-4 border-red-600'
                  }`}
                  style={{ backgroundColor: player.color }}
                >
                  {player.emoji}
                </div>
                {/* Debug label for ALL players */}
                <div className={`absolute -top-8 left-0 text-xs text-white px-1 rounded ${
                  isCurrentPlayer ? 'bg-yellow-600' : 'bg-red-600'
                }`}>
                  {isCurrentPlayer ? 'YOU' : 'OTHER'}: {player.emoji} ({Math.round(displayX)}, {Math.round(displayY)})
                </div>
              </div>
            );
          })}
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
