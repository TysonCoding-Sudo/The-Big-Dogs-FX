const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const depositRoutes = require('./routes/deposits');
const mt5Bridge = require('./services/mt5Bridge');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://tysoncoding-sudo.github.io', 'http://localhost:3000', 'http://localhost:5000'],
    credentials: true
  }
});

app.use(helmet());
app.use(express.json({ limit: '10kb' }));
app.use(cors({
  origin: ['https://tysoncoding-sudo.github.io', 'http://localhost:3000', 'http://localhost:5000'],
  credentials: true
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many attempts, try again later' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/send-otp', authLimiter);

connectDB();

app.set('io', io);
app.set('getConnectedDevices', getConnectedDevices);

// In-memory device tracking: Map<userId, Array<{socketId, deviceType, deviceName, os, isMobile, connectedAt}>>
const connectedDevices = new Map();

function getConnectedDevices(userId) {
  return connectedDevices.get(userId) || [];
}

function removeSocketFromDevices(socketId) {
  for (const [userId, devices] of connectedDevices.entries()) {
    const filtered = devices.filter(d => d.socketId !== socketId);
    if (filtered.length !== devices.length) {
      if (filtered.length === 0) {
        connectedDevices.delete(userId);
      } else {
        connectedDevices.set(userId, filtered);
      }
      // Broadcast updated list to remaining devices
      io.to(userId).emit('devices_updated', filtered);
      return;
    }
  }
}

app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/deposits', depositRoutes);

app.get('/', (req, res) => {
  res.json({ status: 'ok', app: 'THE BIG DOGS FX', version: '1.1.0' });
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  socket.on('join', (userId) => {
    socket.join(userId);
  });

  socket.on('register_device', (data) => {
    const { userId, deviceType, deviceName, os, isMobile } = data;
    if (!userId) return;

    socket.join(userId);

    const deviceEntry = {
      socketId: socket.id,
      deviceType: deviceType || 'Desktop',
      deviceName: deviceName || 'Unknown',
      os: os || 'Unknown',
      isMobile: isMobile || false,
      connectedAt: new Date().toISOString()
    };

    if (!connectedDevices.has(userId)) {
      connectedDevices.set(userId, []);
    }
    const devices = connectedDevices.get(userId);
    // Replace if same socket re-registers
    const existing = devices.findIndex(d => d.socketId === socket.id);
    if (existing >= 0) {
      devices[existing] = deviceEntry;
    } else {
      devices.push(deviceEntry);
    }

    io.to(userId).emit('devices_updated', devices);
    console.log(`Device registered: ${deviceName} (${deviceType}) for user ${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    removeSocketFromDevices(socket.id);
  });
});

mt5Bridge.setIO(io);
mt5Bridge.startBridge();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`THE BIG DOGS FX Server running on port ${PORT}`);
});

module.exports = { io, getConnectedDevices };
