# WSpor Chat Backend

Real-time chat backend for WSpor mobile application using Socket.IO.

## Features

- 🚀 Real-time messaging with Socket.IO
- 🔍 Message filtering (keywords, spam detection)
- 👥 Online user tracking
- 📱 Multiple chat channels
- ⚡ Lightweight and fast

## Local Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

## Deployment on Railway

1. Create new project on Railway
2. Connect your GitHub repository
3. Railway will auto-detect Node.js and deploy
4. Set environment variables if needed

## Environment Variables

- `PORT` - Server port (Railway provides this automatically)
- `NODE_ENV` - Set to 'production' for Railway

## API Endpoints

- `GET /health` - Health check
- `GET /api/channels` - List all channels
- `GET /api/channels/:channelId` - Get channel details

## Socket.IO Events

### Client -> Server
- `joinChannel` - Join a chat channel
- `sendMessage` - Send a message
- `typing` - User is typing
- `stopTyping` - User stopped typing

### Server -> Client
- `message` - New message received
- `userJoined` - User joined channel
- `userLeft` - User left channel
- `onlineUsers` - Online users list
- `messageHistory` - Previous messages
- `messageFiltered` - Message was filtered

## Connecting from Android

```kotlin
// Update your ChatManager.kt
private const val SOCKET_URL = "https://your-chat-backend.up.railway.app"
``` 