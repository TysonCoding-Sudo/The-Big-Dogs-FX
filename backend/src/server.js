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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

mt5Bridge.setIO(io);
mt5Bridge.startBridge();

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`THE BIG DOGS FX Server running on port ${PORT}`);
});
