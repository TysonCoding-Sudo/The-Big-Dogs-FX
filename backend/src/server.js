const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const depositRoutes = require('./routes/deposits');
const mt5Bridge = require('./services/mt5Bridge');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

connectDB();

app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/deposits', depositRoutes);

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
