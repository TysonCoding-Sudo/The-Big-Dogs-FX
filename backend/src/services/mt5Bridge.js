const axios = require('axios');

let io = null;

const mt5Bridge = {
  setIO(socketIO) {
    io = socketIO;
  },

  startBridge() {
    console.log('MT5 Bridge initialized - waiting for EA connections');
    
    setInterval(() => this.syncTrades(), 10000);
  },

  async syncTrades() {
    try {
      const response = await axios.get('http://localhost:8080/api/positions');
      const positions = response.data;

      if (io) {
        positions.forEach(pos => {
          io.to(pos.userId).emit('trade_update', pos);
        });
      }
    } catch (error) {
      if (error.code !== 'ECONNREFUSED') {
        console.error('Bridge sync error:', error.message);
      }
    }
  },

  async sendCommand(command, data) {
    try {
      const response = await axios.post('http://localhost:8080/api/command', {
        command,
        data
      });
      return response.data;
    } catch (error) {
      console.error('Command failed:', error.message);
      return null;
    }
  }
};

module.exports = mt5Bridge;
