# Multiplayer Platformer

A real-time multiplayer platformer game built with Next.js and Firebase where players can join rooms and jump around on platforms together.

## Features

- Real-time multiplayer synchronization using Firebase Firestore
- Create and join game rooms with unique room codes
- Classic platformer physics with gravity and jumping
- Keyboard controls (Arrow Keys or WASD)
- See all players move around in real-time
- Each player gets a unique emoji and color
- Smooth local player movement with network synchronization

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or select an existing one)
3. Click on "Web" icon to add a web app
4. Copy the Firebase configuration values

### 3. Create Firestore Database

1. In Firebase Console, go to "Firestore Database"
2. Click "Create Database"
3. Choose "Start in test mode" (for development)
4. Select a location and create

### 4. Configure Environment Variables

1. Copy `.env.local.example` to `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```

2. Edit `.env.local` and add your Firebase credentials:
   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
   ```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How to Play

1. **Create a Room**: Click "Create New Room" to start a new game
2. **Share Room Code**: Copy the room code from the URL and share it with friends
3. **Join a Room**: Enter a room code and click "Join"
4. **Move Around**: Use Arrow Keys or WASD to move left and right
5. **Jump**: Press Space, W, or Up Arrow to jump on platforms
6. **Play Together**: All players in the same room see each other move in real-time

## Controls

- **Move Left**: Left Arrow or A
- **Move Right**: Right Arrow or D
- **Jump**: Space, W, or Up Arrow

## Deployment

### Deploy to Vercel (Recommended)

1. Push your code to GitHub
2. Go to [Vercel](https://vercel.com)
3. Import your repository
4. Add your environment variables in Vercel dashboard
5. Deploy

### Firebase Security Rules (Important for Production)

Before deploying to production, update your Firestore security rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /rooms/{roomId}/players/{playerId} {
      allow read: if true;
      allow write: if request.auth == null;
      allow delete: if request.auth == null;
    }
  }
}
```

## Tech Stack

- **Next.js 16** - React framework
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Firebase Firestore** - Real-time database
- **Vercel** - Deployment platform

## Project Structure

```
├── app/
│   ├── game/
│   │   └── page.tsx       # Platformer game component with physics
│   ├── layout.tsx         # Root layout
│   ├── page.tsx           # Home page (create/join room)
│   └── globals.css        # Global styles
├── lib/
│   └── firebase.ts        # Firebase configuration
└── .env.local.example     # Environment variables template
```

## Game Features

- **Physics System**: Gravity, jumping, and collision detection
- **Platforms**: Multiple platforms to jump on and explore
- **Real-time Sync**: Player positions update across all clients
- **Smooth Movement**: Local player uses client-side prediction for responsive controls

## License

ISC
