# THE BIG DOGS FX 🐂🐻

> **We chase the cash**

A professional automated trading system built for MetaTrader 5 with a cross-platform web dashboard.

**Live Web App:** [tysoncoding-sudo.github.io/The-Big-Dogs-FX](https://tysoncoding-sudo.github.io/The-Big-Dogs-FX/)

## Strategy

Price action-based EA trading on **Indices** and **Commodities** using:

### Normal Mode (H1)
- **Supply/Demand Zones** - Identified via impulse candle method on H1
- **Fair Value Gaps (FVG)** - 3-candle FVG for entry confluence
- **Candlestick Patterns** - Engulfing, Inside Bar, Morning Star, Evening Star
- **Break & Retest** - Zone touch + candle pattern confirmation
- **Session Filtering** - London + NY sessions only

### Aggressive Mode (M1/M5)
- **Liquidity Sweep Detection** - Sweeps of recent swing highs/lows
- **Change in State of Delivery (CHoSD)** - Impulsive reversal after sweep
- **IFVG/FVG + Fibonacci** - Entry at 50%, 61.8%, 78.6% retracement within FVG gap
- **No Negative Drawdown** - Entry guaranteed within price void
- **Toggle from Dashboard** - Switch modes in Settings tab

## Risk Management

| Parameter | Normal | Aggressive |
|-----------|--------|------------|
| Risk per Trade | 1-3% (configurable) | 1% (fixed) |
| Breakeven | 25 pips profit | 25 pips |
| Take Profit | Structure-based | Next liquidity level |
| Min Impulsive Move | 50 pips | 15 pips |
| Max Open Trades | 3 | 2 |
| Min RR Ratio | 1:2 | 1:2.5 |

## Project Structure

```
BigDogsFX/
├── MT5_EA/
│   └── THE_BIG_DOGS_FX_EA.mq5    # MetaTrader 5 Expert Advisor (Normal + Aggressive)
├── backend/
│   └── src/
│       ├── server.js              # Express + Socket.io API
│       ├── config/
│       ├── models/                # User, Trade models
│       ├── routes/                # Auth, Trades routes
│       └── services/              # MT5 Bridge service
├── web-app/
│   └── index.html                # Single-page web dashboard
├── The Big Dogs Fx/
│   └── (React Native app)
├── render.yaml                   # Render deployment blueprint
├── .github/workflows/pages.yml   # GitHub Pages deployment
└── README.md
```

## Quick Start

### 🌐 Web Dashboard (hosted)

The dashboard is live at GitHub Pages:
```
https://tysoncoding-sudo.github.io/The-Big-Dogs-FX/
```

It automatically connects to the hosted backend. To use full features, deploy the backend (see below).

### MT5 EA

1. Copy `MT5_EA/THE_BIG_DOGS_FX_EA.mq5` to your MT5 `MQL5/Experts/` folder
2. Open MetaEditor and compile
3. Attach to H1 chart on your preferred instrument (US30, NAS100, XAUUSD, etc.)
4. Toggle aggressive mode via EA input params or dashboard Settings tab

### Backend (Local)

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
npm run dev
```

### Backend (Hosted - Render)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/TysonCoding-Sudo/The-Big-Dogs-FX)

1. Click the button above
2. Set environment variables in Render dashboard:
   - `MONGO_URI` - Get free from [MongoDB Atlas](https://www.mongodb.com/atlas)
   - `JWT_SECRET` - Generate a random 64-char string
   - `EMAIL_USER` / `EMAIL_PASS` - Gmail App Password for OTP
3. Deploy - Render will auto-detect the Node.js service

### MongoDB Atlas (Free Database)

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a free M0 cluster
3. Under Security → Database Access → Add new user
4. Under Security → Network Access → Allow access from everywhere (0.0.0.0/0)
5. Click Connect → Connect your application → Copy the connection string
6. Paste into your `MONGO_URI` env var (replace `<user>` and `<password>`)

## Toggle Aggressive Mode

From the web dashboard's Settings tab:
1. Toggle the switch to **Aggressive**
2. EA reads the mode from file on next tick
3. Switches to M1/M5 liquidity sweep strategy

Or set `AggressiveModeEnabled=true` in EA input parameters directly.

## Tech Stack

- **MT5 EA**: MQL5 (Normal + Aggressive strategies)
- **Backend**: Node.js, Express, MongoDB, Socket.io
- **Web App**: Vanilla HTML/CSS/JS (single-page, no build step)
- **Mobile App**: React Native + Expo
- **Hosting**: GitHub Pages (frontend) + Render (backend)
- **Auth**: JWT + bcrypt + OTP

## Features

- [x] Supply/Demand zone detection (H1)
- [x] Liquidity sweep + IFVG/FVG + Fibonacci (M1/M5)
- [x] Aggressive mode toggle from dashboard
- [x] Fair Value Gap confluence
- [x] Candlestick pattern recognition
- [x] Automatic risk calculation
- [x] Breakeven + trailing stop
- [x] Session-based trading filter (London + NY)
- [x] User authentication + OTP
- [x] Real-time trade monitoring
- [x] Dashboard with stats + journal
- [x] Cross-platform (Web + Mobile)
- [x] Custom candlestick chart animation

## License

THE BIG DOGS FX - We chase the cash
