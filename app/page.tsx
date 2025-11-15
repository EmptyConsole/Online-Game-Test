'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();
  const [roomId, setRoomId] = useState('');

  const createRoom = () => {
    const newRoomId = Math.random().toString(36).substring(2, 9);
    router.push(`/game?room=${newRoomId}`);
  };

  const joinRoom = () => {
    if (roomId.trim()) {
      router.push(`/game?room=${roomId.trim()}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-gray-800 rounded-lg shadow-2xl p-8 border border-gray-700">
        <h1 className="text-4xl font-bold text-white mb-2 text-center">
          Multiplayer Platformer
        </h1>
        <p className="text-gray-400 text-center mb-8">
          Jump around and play with friends in real-time!
        </p>

        <div className="space-y-6">
          <div>
            <button
              onClick={createRoom}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors shadow-lg"
            >
              Create New Room
            </button>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-600"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-800 text-gray-400">Or</span>
            </div>
          </div>

          <div>
            <label htmlFor="roomId" className="block text-sm font-medium text-gray-300 mb-2">
              Join Existing Room
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                id="roomId"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room code"
                className="flex-1 bg-gray-700 border border-gray-600 text-white rounded-lg px-4 py-2 focus:outline-none focus:border-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && joinRoom()}
              />
              <button
                onClick={joinRoom}
                disabled={!roomId.trim()}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-semibold py-2 px-6 rounded-lg transition-colors"
              >
                Join
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 p-4 bg-gray-700 rounded-lg">
          <h2 className="text-sm font-semibold text-white mb-2">How to Play:</h2>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Create a room and share the room code with friends</li>
            <li>• Use Arrow Keys or WASD to move left and right</li>
            <li>• Press Space, W, or Up Arrow to jump</li>
            <li>• See other players move around in real-time</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
