const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const REQUIRED_ENV_VARS = ['JWT_SECRET', 'MONGO_URI'];

function validateEnvironment() {
  const missing = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('FATAL: Missing required environment variables:', missing.join(', '));
    process.exit(1);
  }

  if (!process.env.JWT_REFRESH_SECRET) {
    console.warn('WARNING: JWT_REFRESH_SECRET not set. Using JWT_SECRET as fallback (not recommended for production).');
  }

  if (!process.env.EA_API_KEY || process.env.EA_API_KEY === 'ChangeMeToARandomSecureString') {
    console.warn('WARNING: EA_API_KEY not set or using default value. MT5 trade reporting will be insecure.');
  }
}

validateEnvironment();

const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const tradeRoutes = require('./routes/trades');
const depositRoutes = require('./routes/deposits');
const mt5Bridge = require('./services/mt5Bridge');

const app = express();
const server = http.createServer(app);

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['https://tysoncoding-sudo.github.io', 'https://big-dogs-fx-backend.onrender.com', 'http://localhost:3000', 'http://localhost:5000'];

const corsConfig = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const isAllowed = ALLOWED_ORIGINS.some(allowed => {
      if (allowed.includes('*')) {
        return true;
      }
      return origin === allowed || origin.startsWith(allowed);
    }) || ALLOWED_ORIGINS.includes(origin);
    
    callback(null, isAllowed || process.env.NODE_ENV !== 'production');
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-EA-API-Key']
};

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  xssFilter: true,
  noSniff: true,
  permittedCrossDomainPolicies: { policy: 'none' }
}));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cors(corsConfig));

const io = new Server(server, {
  cors: corsConfig,
  pingTimeout: 60000,
  pingInterval: 25000
});

function authenticateSocketToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return { valid: true, userId: decoded.id };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return next(new Error('Authentication required'));
  }

  const result = authenticateSocketToken(token);
  if (!result.valid) {
    return next(new Error('Invalid token'));
  }

  socket.userId = result.userId;
  next();
});

app.use((req, res, next) => {
  req.io = io;
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: 'Too many attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return `${req.ip}:${req.body.email || req.body.username || 'unknown'}`;
  }
});

const strictAuthLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { message: 'Too many authentication requests. Please try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/broker-login', authLimiter);
app.use('/api/auth/*', strictAuthLimiter);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { message: 'Rate limit exceeded' },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', apiLimiter);

connectDB();

const connectedDevices = new Map();

function getConnectedDevices(userId) {
  return connectedDevices.get(userId.toString()) || [];
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
      io.to(userId).emit('devices_updated', filtered);
      return;
    }
  }
}

app.set('getConnectedDevices', getConnectedDevices);

app.use('/api/auth', authRoutes);
app.use('/api/trades', tradeRoutes);
app.use('/api/deposits', depositRoutes);

app.get('/', (req, res) => {
  res.json({ 
    status: 'ok', 
    app: 'THE BIG DOGS FX', 
    version: '1.1.0',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log('Authenticated client connected:', socket.id, 'userId:', userId);

  socket.join(userId.toString());

  socket.on('register_device', (data) => {
    const { deviceType, deviceName, os, isMobile } = data;

    const deviceEntry = {
      socketId: socket.id,
      deviceType: deviceType || 'Desktop',
      deviceName: deviceName || 'Unknown Device',
      os: os || 'Unknown',
      isMobile: isMobile || false,
      connectedAt: new Date().toISOString()
    };

    const userIdStr = userId.toString();
    if (!connectedDevices.has(userIdStr)) {
      connectedDevices.set(userIdStr, []);
    }
    const devices = connectedDevices.get(userIdStr);
    
    const existing = devices.findIndex(d => d.socketId === socket.id);
    if (existing >= 0) {
      devices[existing] = deviceEntry;
    } else {
      devices.push(deviceEntry);
    }

    io.to(userIdStr).emit('devices_updated', devices);
    console.log(`Device registered: ${deviceName} for user ${userId}`);
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    removeSocketFromDevices(socket.id);
  });
});

mt5Bridge.setIO(io);
mt5Bridge.startBridge();

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ message: 'Invalid JSON' });
  }
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`THE BIG DOGS FX Server running on port ${PORT}`);
  console.log(`Allowed origins: ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = { io, getConnectedDevices };
