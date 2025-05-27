const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const cors = require('cors');
const axios = require('axios');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Socket.IO CORS ayarları
const io = socketIO(server, {
  cors: {
    origin: "*", // Production'da spesifik origin kullanın
    methods: ["GET", "POST"]
  }
});

// Express middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Chat server is running' });
});

// Aktif kullanıcılar ve kanallar
const activeUsers = new Map();
const channels = new Map();

// Varsayılan kanallar
const defaultChannels = [
  {
    id: 'genel-sohbet',
    name: 'Genel Sohbet',
    description: 'Herkesin katılabileceği genel sohbet odası',
    filterRules: [
      {
        id: '1',
        type: 'KEYWORD',
        value: 'kötü kelime',
        action: 'REPLACE',
        replacementText: '***'
      },
      {
        id: '2',
        type: 'SPAM',
        value: '',
        action: 'FLAG'
      }
    ]
  },
  {
    id: 'spor-sohbet',
    name: 'Spor Sohbeti',
    description: 'Spor hakkında konuşmak için',
    filterRules: []
  }
];

// Kanalları başlat
defaultChannels.forEach(channel => {
  channels.set(channel.id, {
    ...channel,
    messages: [],
    users: new Set()
  });
});

// Basit filtreleme fonksiyonu
function filterMessage(text, filterRules) {
  let filteredText = text;
  let isFiltered = false;

  // Varsayılan yasaklı kelimeler
  const bannedWords = ['küfür', 'hakaret', 'spam'];
  
  bannedWords.forEach(word => {
    if (filteredText.toLowerCase().includes(word)) {
      filteredText = filteredText.replace(new RegExp(word, 'gi'), '***');
      isFiltered = true;
    }
  });

  // Kanal özel kuralları
  filterRules.forEach(rule => {
    if (rule.type === 'KEYWORD' && filteredText.toLowerCase().includes(rule.value.toLowerCase())) {
      filteredText = filteredText.replace(new RegExp(rule.value, 'gi'), rule.replacementText);
      isFiltered = true;
    }
  });

  // Spam kontrolü - tekrarlayan karakterler
  const spamPattern = /(.)\1{3,}/g;
  if (spamPattern.test(filteredText)) {
    isFiltered = true;
    filteredText = filteredText.replace(spamPattern, '$1$1$1');
  }

  return { filteredText, isFiltered };
}

// Socket.IO bağlantı yönetimi
io.on('connection', (socket) => {
  console.log('Yeni kullanıcı bağlandı:', socket.id);

  // Kullanıcı bilgilerini al
  const userId = socket.handshake.query.userId;
  const userName = socket.handshake.query.userName;

  if (userId && userName) {
    activeUsers.set(socket.id, {
      userId,
      userName,
      socketId: socket.id
    });
  }

  // Kanala katıl
  socket.on('joinChannel', (data) => {
    const { channelId, userId } = data;
    
    socket.join(channelId);
    
    const channel = channels.get(channelId);
    if (channel) {
      channel.users.add(socket.id);
      
      // Kanaldaki online kullanıcıları gönder
      const onlineUsers = Array.from(channel.users).map(id => {
        const user = activeUsers.get(id);
        return user ? user.userName : null;
      }).filter(Boolean);
      
      io.to(channelId).emit('onlineUsers', onlineUsers);
      
      // Kullanıcının katıldığını bildir
      socket.to(channelId).emit('userJoined', {
        userId,
        userName: activeUsers.get(socket.id)?.userName || 'Anonim'
      });
      
      // Son mesajları gönder (max 50)
      const recentMessages = channel.messages.slice(-50);
      socket.emit('messageHistory', recentMessages);
    }
  });

  // Mesaj gönder
  socket.on('sendMessage', (data) => {
    const { text, channelId, senderId, senderName, timestamp } = data;
    
    const channel = channels.get(channelId);
    if (!channel) return;

    // Mesajı filtrele
    const { filteredText, isFiltered } = filterMessage(text, channel.filterRules);
    
    const message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text: filteredText,
      originalText: isFiltered ? text : '',
      senderId,
      senderName,
      channelId,
      timestamp: timestamp || Date.now(),
      isFiltered
    };

    // Mesajı kaydet
    channel.messages.push(message);
    
    // Mesaj limitini kontrol et (max 1000 mesaj)
    if (channel.messages.length > 1000) {
      channel.messages = channel.messages.slice(-1000);
    }

    // Mesajı kanaldaki herkese gönder
    io.to(channelId).emit('message', message);
    
    // Eğer mesaj filtrelendiyse, bunu bildir
    if (isFiltered) {
      io.to(channelId).emit('messageFiltered', {
        messageId: message.id,
        filteredText: message.text
      });
    }
  });

  // Yazıyor bildirimi
  socket.on('typing', (data) => {
    socket.to(data.channelId).emit('userTyping', {
      userId: data.userId,
      userName: data.userName
    });
  });

  // Yazmayı bıraktı bildirimi
  socket.on('stopTyping', (data) => {
    socket.to(data.channelId).emit('userStoppedTyping', {
      userId: data.userId
    });
  });

  // Bağlantı kesildi
  socket.on('disconnect', () => {
    console.log('Kullanıcı ayrıldı:', socket.id);
    
    const user = activeUsers.get(socket.id);
    
    // Kullanıcıyı tüm kanallardan çıkar
    channels.forEach((channel, channelId) => {
      if (channel.users.has(socket.id)) {
        channel.users.delete(socket.id);
        
        // Güncellenen online kullanıcı listesini gönder
        const onlineUsers = Array.from(channel.users).map(id => {
          const u = activeUsers.get(id);
          return u ? u.userName : null;
        }).filter(Boolean);
        
        io.to(channelId).emit('onlineUsers', onlineUsers);
        
        // Kullanıcının ayrıldığını bildir
        if (user) {
          socket.to(channelId).emit('userLeft', {
            userId: user.userId,
            userName: user.userName
          });
        }
      }
    });
    
    activeUsers.delete(socket.id);
  });
});

// Kanal listesi endpoint'i
app.get('/api/channels', (req, res) => {
  const channelList = Array.from(channels.values()).map(channel => ({
    id: channel.id,
    name: channel.name,
    description: channel.description,
    userCount: channel.users.size
  }));
  
  res.json(channelList);
});

// Kanal detayları
app.get('/api/channels/:channelId', (req, res) => {
  const channel = channels.get(req.params.channelId);
  
  if (!channel) {
    return res.status(404).json({ error: 'Channel not found' });
  }
  
  res.json({
    id: channel.id,
    name: channel.name,
    description: channel.description,
    filterRules: channel.filterRules,
    userCount: channel.users.size,
    messageCount: channel.messages.length
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`Chat server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
}); 