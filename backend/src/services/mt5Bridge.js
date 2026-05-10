const axios = require('axios');
const fs = require('fs');
const path = require('path');

let io = null;

function getModeFilePath() {
  const appData = process.env.APPDATA || '';
  if (!appData) return null;
  const dir = path.join(appData, 'MetaQuotes', 'Terminal', 'Common', 'Files');
  return path.join(dir, 'BigDogsFX_Mode.cfg');
}

function getAgentsFilePath() {
  const appData = process.env.APPDATA || '';
  if (!appData) return null;
  const dir = path.join(appData, 'MetaQuotes', 'Terminal', 'Common', 'Files');
  return path.join(dir, 'BigDogsFX_Agents.cfg');
}

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
  },

  async setTradingMode(mode) {
    // Write to MT5 Common Files folder for EA to read
    const filePath = getModeFilePath();
    if (filePath) {
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, `mode=${mode}`, 'utf8');
        console.log(`Trading mode written to ${filePath}: ${mode}`);
      } catch (err) {
        console.error('Failed to write mode file:', err.message);
      }
    }

    // Also try HTTP relay to MT5 terminal bridge
    try {
      await axios.post('http://localhost:8080/api/command', {
        command: 'setTradingMode',
        data: { mode }
      });
    } catch {
      // HTTP bridge may not be running
    }
  },

  async setMultiAgentVoting(enabled) {
    const filePath = getAgentsFilePath();
    if (filePath) {
      try {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, `agents=${enabled ? 'enabled' : 'disabled'}`, 'utf8');
        console.log(`Agent voting written to ${filePath}: ${enabled}`);
      } catch (err) {
        console.error('Failed to write agents file:', err.message);
      }
    }

    try {
      await axios.post('http://localhost:8080/api/command', {
        command: 'setMultiAgentVoting',
        data: { enabled }
      });
    } catch {
      // HTTP bridge may not be running
    }
  }
};

module.exports = mt5Bridge;
