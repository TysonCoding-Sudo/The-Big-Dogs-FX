# THE BIG DOGS FX 🐂🐻

> **We chase the cash**

A professional automated trading system built for MetaTrader 5 with a cross-platform mobile & web dashboard.

## Strategy

Price action-based EA trading on **Indices** and **Commodities** using:

- **Supply/Demand Zones** - Identified via impulse candle method on H1
- **Fair Value Gaps (FVG)** - 3-candle FVG for entry confluence
- **Candlestick Patterns** - Engulfing, Inside Bar, Morning Star, Evening Star
- **Break & Retest** - Zone touch + candle pattern confirmation
- **Session Filtering** - London + NY sessions only

## Risk Management

| Parameter | Value |
|-----------|-------|
| Risk per Trade | 1-3% (configurable) |
| Breakeven | 25 pips profit |
| Take Profit | 250 pips / Structure-based |
| Min Impulsive Move | 50 pips |
| Max Spread | 300 points |
| Max Open Trades | 3 |
| Min RR Ratio | 1:2 |

## Project Structure

```
BigDogsFX/
├── MT5_EA/
│   └── THE_BIG_DOGS_FX_EA.mq5    # MetaTrader 5 Expert Advisor
├── backend/
│   └── src/
│       ├── server.js              # Express + Socket.io API
│       ├── config/
│       ├── models/                # User, Trade models
│       ├── routes/                # Auth, Trades routes
│       └── services/              # MT5 Bridge service
├── The Big Dogs Fx/
│   ├── app/                       # Expo Router screens
│   │   ├── _layout.js
│   │   ├── index.js               # Splash screen
│   │   ├── login.js               # Login screen
│   │   ├── register.js            # Registration screen
│   │   └── dashboard.js           # Main dashboard
│   └── src/
│       ├── components/            # BullBearBackground, etc.
│       ├── context/               # Auth context
│       ├── services/              # API client
│       └── theme/                 # Colors, fonts, styles
```

## Getting Started

### MT5 EA

1. Copy `MT5_EA/THE_BIG_DOGS_FX_EA.mq5` to your MT5 `MQL5/Experts/` folder
2. Open MetaEditor and compile
3. Attach to H1 chart on your preferred instrument (US30, NAS100, XAUUSD, etc.)
4. Configure input parameters as needed

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret
npm run dev
```

### Mobile/Web App

```bash
cd "The Big Dogs Fx"
npm install
npm start
```

Then choose platform:
- Press `w` for Web
- Press `a` for Android
- Press `i` for iOS (macOS only)

## Tech Stack

- **MT5 EA**: MQL5
- **Backend**: Node.js, Express, MongoDB, Socket.io
- **App**: React Native + Expo (iOS, Android, Web)
- **Auth**: JWT + bcrypt

## Features

- [x] Supply/Demand zone detection
- [x] Fair Value Gap confluence
- [x] Candlestick pattern recognition
- [x] Automatic risk calculation
- [x] Breakeven + trailing stop
- [x] Session-based trading filter
- [x] User authentication
- [x] Real-time trade monitoring
- [x] Dashboard with stats
- [x] Cross-platform (iOS, Android, Web)
- [x] Custom 3D-style background animation

## License

THE BIG DOGS FX - We chase the cash
