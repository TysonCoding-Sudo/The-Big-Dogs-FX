const User = require('../models/User');

const eaAuthMiddleware = async (req, res, next) => {
  const apiKey = req.headers['x-ea-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({ message: 'EA API key required' });
  }

  try {
    const user = await User.findByEAAPIKey(apiKey);
    
    if (user) {
      if (!user.isActive) {
        return res.status(403).json({ message: 'Account deactivated' });
      }
      req.eaUser = user;
      req.userId = user._id;
      return next();
    }

    if (process.env.EA_API_KEY && apiKey === process.env.EA_API_KEY) {
      console.warn('Using legacy global EA_API_KEY - this is deprecated. Use per-user keys.');
      req.userId = null;
      req.usesGlobalKey = true;
      return next();
    }

    return res.status(401).json({ message: 'Invalid EA API key' });
  } catch (error) {
    console.error('EA auth error:', error);
    return res.status(500).json({ message: 'Authentication failed' });
  }
};

module.exports = eaAuthMiddleware;
