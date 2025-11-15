'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  deleteDoc,
} from 'firebase/firestore';
import { useSearchParams } from 'next/navigation';

interface Character {
  id: string;
  x: number;
  y: number;
  color: string;
  emoji: string;
  playerId: string;
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

export default function GamePage() {
  const searchParams = useSearchParams();
  const roomId = searchParams.get('room') || 'default-room';

  const [characters, setCharacters] = useState<Character[]>([]);
  const [playerId] = useState(() => `player-${Math.random().toString(36).substr(2, 9)}`);
  const [playerEmoji] = useState(() => EMOJIS[Math.floor(Math.random() * EMOJIS.length)]);
  const [playerColor] = useState(() => COLORS[Math.floor(Math.random() * COLORS.length)]);

  useEffect(() => {
    // Listen to real-time updates from Firebase
    const unsubscribe = onSnapshot(
      collection(db, 'rooms', roomId, 'characters'),
      (snapshot) => {
        const chars: Character[] = [];
        snapshot.forEach((doc) => {
          chars.push({ id: doc.id, ...doc.data() } as Character);
        });
        setCharacters(chars);
      }
    );

    return () => unsubscribe();
  }, [roomId]);

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const characterId = `${playerId}-${Date.now()}`;

    // Add character to Firebase
    await setDoc(
      doc(db, 'rooms', roomId, 'characters', characterId),
      {
        x,
        y,
        color: playerColor,
        emoji: playerEmoji,
        playerId,
      }
    );
  };

  const handleRemoveCharacter = async (characterId: string, charPlayerId: string) => {
    // Only allow players to remove their own characters
    if (charPlayerId === playerId) {
      await deleteDoc(doc(db, 'rooms', roomId, 'characters', characterId));
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="p-4 bg-gray-800 border-b border-gray-700">
        <h1 className="text-2xl font-bold">Multiplayer Game</h1>
        <div className="mt-2 flex items-center gap-4">
          <p className="text-sm text-gray-400">
            Room: <span className="text-white font-mono">{roomId}</span>
          </p>
          <p className="text-sm text-gray-400">
            You: <span className="text-2xl">{playerEmoji}</span>
          </p>
          <p className="text-sm text-gray-400">
            Players online: <span className="text-white">{new Set(characters.map(c => c.playerId)).size}</span>
          </p>
        </div>
        <p className="text-sm text-gray-400 mt-2">
          Click anywhere on the game board to place your character. Click on your characters to remove them.
        </p>
      </div>

      <div
        className="relative w-full h-[calc(100vh-140px)] bg-gray-800 cursor-crosshair"
        onClick={handleClick}
      >
        {characters.map((char) => (
          <div
            key={char.id}
            className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer hover:scale-125 transition-transform"
            style={{
              left: `${char.x}px`,
              top: `${char.y}px`,
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveCharacter(char.id, char.playerId);
            }}
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shadow-lg"
              style={{ backgroundColor: char.color }}
            >
              {char.emoji}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
