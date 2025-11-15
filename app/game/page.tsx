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
  velocityY: number;
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
const GRAVITY = 0.5;
const JUMP_STRENGTH = -12;
const MOVE_SPEED = 5;
const PLAYER_SIZE = 40;
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;

// Platforms
const PLATFORMS: Platform[] = [
  { x: 0, y: 550, width: 800, height: 50 }, // Ground
  { x: 100, y: 450, width: 150, height: 20 },
  { x: 350, y: 350, width: 150, height: 20 },
  { x: 600, y: 450, width: 150, height: 20 },
  { x: 200, y: 250, width: 120, height: 20 },
  { x: 480, y: 200, width: 120, height: 20 },
  { x: 0, y: 150, width: 100, height: 20 },
  { x: 700, y: 150, width: 100, height: 20 },
];

function GameContent() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('room') || 'default-room';

  const [players, setPlayers] = useState<Record<string, Player>>({});
  const [playerId] = useState(() => `player-${Math.random().toString(36).substr(2, 9)}`);
  const [playerEmoji] = useState(() => EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
  const [playerColor] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)]);

  const playerRef = useRef({
    x: 100,
    y: 400,
    velocityY: 0,
    isOnGround: false,
  });

  const keysPressed = useRef({
    left: false,
    right: false,
    up: false,
  });

  const gameLoopRef = useRef<number>();
  const lastUpdateRef = useRef<number>(Date.now());

  useEffect(() => {
    // Listen to real-time updates from Firebase
    const unsubscribe = onSnapshot(
      collection(db, 'rooms', roomId, 'players'),
      (snapshot) => {
        const playersData: Record<string, Player> = {};
        snapshot.forEach((doc) => {
          playersData[doc.id] = { id: doc.id, ...doc.data() } as Player;
        });
        setPlayers(playersData);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  // Collision detection
  const checkCollision = (x: number, y: number, velocityY: number): { collided: boolean; platform: Platform | null } => {
    for (const platform of PLATFORMS) {
      // Check if player is overlapping with platform
      if (
        x < platform.x + platform.width &&
        x + PLAYER_SIZE > platform.x &&
        y + PLAYER_SIZE > platform.y &&
        y + PLAYER_SIZE <= platform.y + platform.height
      ) {
        // Only collide if moving downward
        if (velocityY >= 0) {
          return { collided: true, platform };
        }
      }
    }
    return { collided: false, platform: null };
  };

  // Update player position in Firebase
  const updatePlayerPosition = async (x: number, y: number, velocityY: number) => {
    try {
      await setDoc(
        doc(db, 'rooms', roomId, 'players', playerId),
        {
          x,
          y,
          color: playerColor,
          emoji: playerEmoji,
          velocityY,
        }
      );
    } catch (error) {
      console.error('Error updating player position:', error);
    }
  };

  // Game loop
  useEffect(() => {
    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = now - lastUpdateRef.current;

      // Only update if enough time has passed (throttle to ~60 FPS)
      if (deltaTime < 16) {
        gameLoopRef.current = requestAnimationFrame(gameLoop);
        return;
      }

      lastUpdateRef.current = now;

      let { x, y, velocityY, isOnGround } = playerRef.current;

      // Horizontal movement
      if (keysPressed.current.left) {
        x -= MOVE_SPEED;
      }
      if (keysPressed.current.right) {
        x += MOVE_SPEED;
      }

      // Keep player in bounds horizontally
      x = Math.max(0, Math.min(GAME_WIDTH - PLAYER_SIZE, x));

      // Apply gravity
      velocityY += GRAVITY;

      // Update vertical position
      y += velocityY;

      // Check collision with platforms
      const { collided, platform } = checkCollision(x, y, velocityY);

      if (collided && platform) {
        // Land on platform
        y = platform.y - PLAYER_SIZE;
        velocityY = 0;
        isOnGround = true;
      } else {
        isOnGround = false;
      }

      // Keep player in bounds vertically
      if (y > GAME_HEIGHT - PLAYER_SIZE) {
        y = GAME_HEIGHT - PLAYER_SIZE;
        velocityY = 0;
        isOnGround = true;
      }

      // Jump
      if (keysPressed.current.up && isOnGround) {
        velocityY = JUMP_STRENGTH;
        isOnGround = false;
      }

      // Update ref
      playerRef.current = { x, y, velocityY, isOnGround };

      // Update Firebase (throttle to every 50ms)
      if (now % 50 < 20) {
        updatePlayerPosition(x, y, velocityY);
      }

      gameLoopRef.current = requestAnimationFrame(gameLoop);
    };

    gameLoopRef.current = requestAnimationFrame(gameLoop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, [roomId, playerId, playerColor, playerEmoji]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        keysPressed.current.left = true;
      }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        keysPressed.current.right = true;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        keysPressed.current.up = true;
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
        keysPressed.current.up = false;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Cleanup player on unmount
  useEffect(() => {
    return () => {
      deleteDoc(doc(db, 'rooms', roomId, 'players', playerId));
    };
  }, [roomId, playerId]);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-2xl font-bold">Multiplayer Platformer</h1>
        <div className="mt-2 flex items-center gap-4">
          <p className="text-sm text-gray-400">
            Room: <span className="text-white font-mono">{roomId}</span>
          </p>
          <p className="text-sm text-gray-400">
            You: <span className="text-2xl">{playerEmoji}</span>
          </p>
          <p className="text-sm text-gray-400">
            Players online: <span className="text-white">{Object.keys(players).length}</span>
          </p>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Controls: Arrow Keys or WASD to move, Space/W/Up to jump
        </p>
      </div>

      <div className="flex items-center justify-center p-8">
        <div
          className="relative bg-sky-300"
          style={{
            width: `${GAME_WIDTH}px`,
            height: `${GAME_HEIGHT}px`,
          }}
        >
          {/* Platforms */}
          {PLATFORMS.map((platform, index) => (
            <div
              key={index}
              className="absolute bg-green-700 border-2 border-green-900"
              style={{
                left: `${platform.x}px`,
                top: `${platform.y}px`,
                width: `${platform.width}px`,
                height: `${platform.height}px`,
              }}
            />
          ))}

          {/* Other players */}
          {Object.entries(players).map(([id, player]) => {
            if (id === playerId) return null; // Don't render current player from Firebase
            return (
              <div
                key={id}
                className="absolute transition-all duration-100"
                style={{
                  left: `${player.x}px`,
                  top: `${player.y}px`,
                  width: `${PLAYER_SIZE}px`,
                  height: `${PLAYER_SIZE}px`,
                }}
              >
                <div
                  className="w-full h-full rounded-lg flex items-center justify-center text-2xl shadow-lg border-2 border-gray-800"
                  style={{ backgroundColor: player.color }}
                >
                  {player.emoji}
                </div>
              </div>
            );
          })}

          {/* Current player (rendered from local state for smoothness) */}
          <div
            className="absolute"
            style={{
              left: `${playerRef.current.x}px`,
              top: `${playerRef.current.y}px`,
              width: `${PLAYER_SIZE}px`,
              height: `${PLAYER_SIZE}px`,
            }}
          >
            <div
              className="w-full h-full rounded-lg flex items-center justify-center text-2xl shadow-lg border-4 border-yellow-400"
              style={{ backgroundColor: playerColor }}
            >
              {playerEmoji}
            </div>
          </div>
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
