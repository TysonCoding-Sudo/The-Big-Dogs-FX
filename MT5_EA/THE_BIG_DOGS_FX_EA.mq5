//+------------------------------------------------------------------+
//|                                          THE_BIG_DOGS_FX_EA.mq5  |
//|                                  Copyright 2025, THE BIG DOGS FX |
//|                                           We chase the cash      |
//+------------------------------------------------------------------+
#property copyright "THE BIG DOGS FX - We chase the cash"
#property version   "2.00"
#property strict

#include <Trade\Trade.mqh>

CTrade trade;

//--- Input Parameters
input group "=== RISK MANAGEMENT ==="
input double RiskPercent        = 2.0;      // Risk % per trade (1-3%)
input int    BreakevenPips      = 25;       // Move to BE after X pips profit
input int    TrailingStartPips  = 25;       // Trail start distance (pips)
input int    TrailingDistance   = 15;       // Trailing stop distance (pips)

input group "=== ZONE DETECTION ==="
input int    MinImpulsivePips   = 50;       // Min pip size for impulsive move
input int    MaxZoneLookback    = 500;      // Max candles to look back for zones
input int    MinZoneStrength    = 2;        // Min confluence for valid zone (FVG nearby)

input group "=== CANDLESTICK PATTERNS ==="
input bool   UseEngulfing       = true;     // Use Engulfing pattern
input bool   UseInsideBar       = true;     // Use Inside Bar pattern
input bool   UseMorningStar     = true;     // Use Morning Star (bullish)
input bool   UseEveningStar     = true;     // Use Evening Star (bearish)

input group "=== FAIR VALUE GAPS ==="
input bool   UseFVGConfluence   = true;     // Require FVG for entry confluence

input group "=== SESSION FILTER ==="
input bool   UseSessionFilter   = true;     // Trade only during sessions
input int    LondonStartHour    = 7;        // London session start (broker time)
input int    LondonEndHour      = 17;       // London session end (broker time)
input int    NYStartHour        = 13;       // NY session start (broker time)
input int    NYEndHour          = 22;       // NY session end (broker time)
input int    SpreadGraceMinutes = 30;       // No trades first N min of each session

input group "=== TRADE FILTERS ==="
input int    MaxSpreadPoints    = 300;      // Max spread allowed (in points)
input int    MaxOpenTrades      = 3;        // Max simultaneous trades
input int    MagicNumber        = 20250417; // EA Magic Number
input double MinLotSize         = 0.01;     // Minimum lot size
input double MaxLotSize         = 10.0;     // Maximum lot size

input group "=== TP/SL STRUCTURE ==="
input int    ExtraSLPips        = 10;       // Extra buffer beyond zone (pips)
input bool   UseStructureTP     = true;     // TP at next structure level
input int    MinRRRatio         = 2;        // Minimum Risk:Reward ratio (normal)

input group "=== AGGRESSIVE MODE ==="
input bool   AggressiveModeEnabled = true;  // Enable aggressive mode (M1/M5)
input ENUM_TIMEFRAMES AggressiveTimeframe = PERIOD_M5; // TF for aggressive
input double AggressiveRiskPercent  = 1.0;  // Risk % for aggressive trades
input int    AggressiveMinSwingBars = 10;   // Min swing lookback (bars)
input int    AggressiveImpulsePips  = 15;   // Min impulse for CHoSD (pips)
input int    AggressiveMaxTrades    = 2;    // Max trades in aggressive mode
input double AggressiveMinRR        = 2.5;  // Min RR for aggressive trades

input group "=== SYMBOL FILTER ==="
input string AllowedSymbols         = "NAS100,US30,XAUUSD"; // Comma-separated allowed symbols

input group "=== MULTI-AGENT VOTING ==="
input bool   UseMultiAgentVoting   = true;    // Enable multi-agent consensus
input int    MinAgreeCount         = 3;       // Min agents agreeing (1-5)
input bool   Agent1_SnD            = true;    // Agent 1: S&D Zone Trader
input bool   Agent2_Sweep          = true;    // Agent 2: Liquidity Sweep Trader
input bool   Agent3_FVGFib         = true;    // Agent 3: FVG + Fib Trader
input bool   Agent4_Momentum       = true;    // Agent 4: Momentum Breaker
input bool   Agent5_Trend          = true;    // Agent 5: HTF Trend Follower

input group "=== GOD MODE ==="
input bool   GodModeEnabled        = true;    // Combine all signal sources

//--- Global Variables
datetime lastBarTime = 0;
int zoneCount = 0;

//--- Aggressive Mode Globals
datetime lastAggressiveBarTime = 0;
double swingHighs[];
double swingLows[];
int swingCount = 0;

//--- Zone Structure
struct SZone {
   datetime zoneTime;
   double   top;
   double   bottom;
   int      type;     // 1 = Supply, -1 = Demand
   bool     isValid;
   bool     hasFVG;
   double   fvgTop;
   double   fvgBottom;
};

SZone zones[];

//--- GOD MODE Signal
struct GodModeSignal {
   bool   hasSignal;
   int    direction;  // 1 = buy, -1 = sell
   double entry;
   double sl;
   double tp;
   string reason;
};

enum AgentVote { VOTE_NEUTRAL = 0, VOTE_BUY = 1, VOTE_SELL = -1 };

struct AgentResult {
   AgentVote vote;
   double    entry;
   double    sl;
   double    tp;
   string    reason;
};

struct ConsensusResult {
   bool   hasConsensus;
   int    direction;
   double entry;
   double sl;
   double tp;
   int    agreeCount;
   string agentsSummary;
};

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit() {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(50);
   trade.SetTypeFilling(ORDER_FILLING_IOC);

   ArrayResize(zones, 0);

   Print("==============================================");
   Print("   THE BIG DOGS FX - GOD MODE");
   Print("   We chase the cash");
   Print("   EA Initialized Successfully");
   Print("   Risk: ", RiskPercent, "% | BE: ", BreakevenPips, " pips");
   Print("   TF: ", EnumToString(AggressiveTimeframe));
   Print("   GOD MODE: ", GodModeEnabled ? "ENABLED" : "DISABLED");
   Print("   AGGRESSIVE MODE: ", AggressiveModeEnabled ? "ENABLED" : "DISABLED");
   Print("   MULTI-AGENT VOTING: ", UseMultiAgentVoting ? "ENABLED" : "DISABLED");
   if(UseMultiAgentVoting) {
      Print("   MinAgreeCount: ", MinAgreeCount);
   }
   if(GodModeEnabled) {
      Print("   All signal sources will be combined");
   }
   Print("==============================================");

   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                   |
//+------------------------------------------------------------------+
void OnDeinit(const int reason) {
   Print("THE BIG DOGS FX EA Deinitialized. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Expert tick function                                               |
//+------------------------------------------------------------------+
void OnTick() {
   if(!IsAllowedSymbol()) return;

   datetime currentBarTime = iTime(_Symbol, AggressiveTimeframe, 0);

   if(currentBarTime != lastBarTime) {
      lastBarTime = currentBarTime;
      ScanForZones(AggressiveTimeframe);
      ScanAggressiveSwings();
   }

   ManageOpenTrades();

   if(!IsWithinSession() || IsSpreadHours() || !IsSpreadOK()) return;
   if(CountOpenTrades() >= MathMin(MaxOpenTrades, AggressiveMaxTrades)) return;

   if(GodModeEnabled) {
      //--- GOD MODE: Combine all 3 signal sources
      GodModeSignal sweepSignal = GetSweepSignal();
      GodModeSignal zoneSignal  = GetZoneSignal();
      ConsensusResult consensus = GetConsensus();

      EvaluateGodModeEntry(sweepSignal, zoneSignal, consensus);
   } else if(UseMultiAgentVoting) {
      //--- Multi-agent voting only
      ConsensusResult consensus = GetConsensus();
      if(consensus.hasConsensus) {
         ExecuteConsensusTrade(consensus);
      }
   } else if(AggressiveModeEnabled) {
      //--- Aggressive mode only
      CheckAggressiveEntries();
   }
}

//+------------------------------------------------------------------+
//| Check if current time is within trading sessions                   |
//+------------------------------------------------------------------+
bool IsWithinSession() {
   if(!UseSessionFilter) return true;

   MqlDateTime dt;
   TimeCurrent(dt);
   int hour = dt.hour;
   int dayOfWeek = dt.day_of_week;

   if(dayOfWeek == 0 || dayOfWeek == 6) return false;

   bool isLondon = (hour >= LondonStartHour && hour < LondonEndHour);
   bool isNY = (hour >= NYStartHour && hour < NYEndHour);

   return (isLondon || isNY);
}

//+------------------------------------------------------------------+
//| Check if we are in spread grace period (first N min of session)   |
//+------------------------------------------------------------------+
bool IsSpreadHours() {
   if(SpreadGraceMinutes <= 0 || !UseSessionFilter) return false;

   MqlDateTime dt;
   TimeCurrent(dt);
   int totalMinutes = dt.hour * 60 + dt.min;
   int dayOfWeek = dt.day_of_week;

   if(dayOfWeek == 0 || dayOfWeek == 6) return true;

   int londonStart = LondonStartHour * 60;
   int londonEnd = LondonEndHour * 60;
   int nyStart = NYStartHour * 60;
   int nyEnd = NYEndHour * 60;

   if(totalMinutes >= londonStart && totalMinutes < londonStart + SpreadGraceMinutes) return true;
   if(totalMinutes >= nyStart && totalMinutes < nyStart + SpreadGraceMinutes) return true;

   return false;
}

//+------------------------------------------------------------------+
//| Check if spread is acceptable                                      |
//+------------------------------------------------------------------+
bool IsSpreadOK() {
   long spread = SymbolInfoInteger(_Symbol, SYMBOL_SPREAD);
   return (spread <= MaxSpreadPoints);
}

//+------------------------------------------------------------------+
//| Count open trades for this EA                                      |
//+------------------------------------------------------------------+
int CountOpenTrades() {
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(PositionSelectByTicket(ticket)) {
         if(PositionGetString(POSITION_SYMBOL) == _Symbol &&
            PositionGetInteger(POSITION_MAGIC) == MagicNumber) {
            count++;
         }
      }
   }
   return count;
}

//+------------------------------------------------------------------+
//| Calculate lot size based on risk percentage                        |
//+------------------------------------------------------------------+
double CalculateLotSize(double slDistancePoints) {
   double accountBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskAmount = accountBalance * (RiskPercent / 100.0);

   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);

   double lotSize = (riskAmount / (slDistancePoints * tickValue / tickSize));

   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   lotSize = MathMax(lotSize, MinLotSize);
   lotSize = MathMin(lotSize, MaxLotSize);
   lotSize = MathMax(lotSize, minLot);
   lotSize = MathMin(lotSize, maxLot);
   lotSize = MathFloor(lotSize / lotStep) * lotStep;

   return NormalizeDouble(lotSize, 2);
}

//+------------------------------------------------------------------+
//| Convert pips to points                                             |
//+------------------------------------------------------------------+
int PipsToPoints(int pips) {
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   double pipSize = (digits == 3 || digits == 5) ? point * 10 : point;

   return (int)MathRound(pips / pipSize * point);
}

//+------------------------------------------------------------------+
//| Scan charts for Supply/Demand zones on given timeframe            |
//+------------------------------------------------------------------+
void ScanForZones(ENUM_TIMEFRAMES tf) {
   ArrayResize(zones, 0);
   zoneCount = 0;

   double pipSize = GetPipSize();
   double minImpulseSize = MinImpulsivePips * pipSize;

   for(int i = 2; i < MaxZoneLookback; i++) {
      double bodySize = MathAbs(iClose(_Symbol, tf, i) - iOpen(_Symbol, tf, i));
      double candleRange = iHigh(_Symbol, tf, i) - iLow(_Symbol, tf, i);

      if(bodySize >= minImpulseSize && candleRange >= minImpulseSize) {
         bool isBullishImpulse = (iClose(_Symbol, tf, i) - iOpen(_Symbol, tf, i)) > 0;

         int prevIdx = i + 1;
         if(prevIdx >= MaxZoneLookback) continue;

         double zoneTop, zoneBottom;
         int zoneType;

         if(isBullishImpulse) {
            zoneTop = iLow(_Symbol, tf, prevIdx);
            zoneBottom = iLow(_Symbol, tf, prevIdx) - (candleRange * 0.2);
            zoneType = -1; // Demand
         } else {
            zoneTop = iHigh(_Symbol, tf, prevIdx) + (candleRange * 0.2);
            zoneBottom = iHigh(_Symbol, tf, prevIdx);
            zoneType = 1; // Supply
         }

         bool hasFVG = false;
         double fvgTop = 0, fvgBottom = 0;

         if(UseFVGConfluence) {
            hasFVG = FindFVGNearZone(i, zoneTop, zoneBottom, zoneType, fvgTop, fvgBottom, tf);
         }

         int idx = ArraySize(zones);
         ArrayResize(zones, idx + 1);

         zones[idx].zoneTime = iTime(_Symbol, tf, prevIdx);
         zones[idx].top = zoneTop;
         zones[idx].bottom = zoneBottom;
         zones[idx].type = zoneType;
         zones[idx].isValid = (!UseFVGConfluence || hasFVG);
         zones[idx].hasFVG = hasFVG;
         zones[idx].fvgTop = fvgTop;
         zones[idx].fvgBottom = fvgBottom;

         zoneCount++;
      }
   }
}

//+------------------------------------------------------------------+
//| Find Fair Value Gap near a zone                                    |
//+------------------------------------------------------------------+
bool FindFVGNearZone(int zoneIdx, double zoneTop, double zoneBottom, int zoneType, double &fvgTop, double &fvgBottom, ENUM_TIMEFRAMES tf) {
   for(int i = zoneIdx - 10; i <= zoneIdx + 5; i++) {
      if(i < 2) continue;

      double high1 = iHigh(_Symbol, tf, i - 2);
      double low1 = iLow(_Symbol, tf, i - 2);
      double high3 = iHigh(_Symbol, tf, i);
      double low3 = iLow(_Symbol, tf, i);

      if(zoneType == -1) {
         if(low1 > high3) {
            fvgTop = low1;
            fvgBottom = high3;

            double zoneMid = (zoneTop + zoneBottom) / 2.0;
            double fvgMid = (fvgTop + fvgBottom) / 2.0;
            double pipSize = GetPipSize();

            if(MathAbs(zoneMid - fvgMid) < (MinImpulsivePips * pipSize * 0.5)) {
               return true;
            }
         }
      } else {
         if(high1 < low3) {
            fvgTop = low3;
            fvgBottom = high1;

            double zoneMid = (zoneTop + zoneBottom) / 2.0;
            double fvgMid = (fvgTop + fvgBottom) / 2.0;
            double pipSize = GetPipSize();

            if(MathAbs(zoneMid - fvgMid) < (MinImpulsivePips * pipSize * 0.5)) {
               return true;
            }
         }
      }
   }

   return false;
}

//+------------------------------------------------------------------+
//| Get pip size for current symbol                                    |
//+------------------------------------------------------------------+
double GetPipSize() {
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   return (digits == 3 || digits == 5) ? point * 10 : point;
}

//+------------------------------------------------------------------+
//| Check for candlestick patterns at zone touch                       |
//+------------------------------------------------------------------+
int CheckCandlestickPatterns(int zoneType, ENUM_TIMEFRAMES tf) {
   int signal = 0;

   if(zoneType == -1) {
      if(UseEngulfing && IsBullishEngulfing(tf)) signal = 1;
      if(UseInsideBar && IsBullishInsideBarBreakout(tf)) signal = 1;
      if(UseMorningStar && IsMorningStar(tf)) signal = 1;
   } else if(zoneType == 1) {
      if(UseEngulfing && IsBearishEngulfing(tf)) signal = -1;
      if(UseInsideBar && IsBearishInsideBarBreakout(tf)) signal = -1;
      if(UseEveningStar && IsEveningStar(tf)) signal = -1;
   }

   return signal;
}

//+------------------------------------------------------------------+
//| Bullish Engulfing Pattern                                          |
//+------------------------------------------------------------------+
bool IsBullishEngulfing(ENUM_TIMEFRAMES tf) {
   double open1 = iOpen(_Symbol, tf, 1);
   double close1 = iClose(_Symbol, tf, 1);
   double open2 = iOpen(_Symbol, tf, 2);
   double close2 = iClose(_Symbol, tf, 2);

   return (close2 < open2 && close1 > open1 && close1 > open2 && open1 < close2);
}

//+------------------------------------------------------------------+
//| Bearish Engulfing Pattern                                          |
//+------------------------------------------------------------------+
bool IsBearishEngulfing(ENUM_TIMEFRAMES tf) {
   double open1 = iOpen(_Symbol, tf, 1);
   double close1 = iClose(_Symbol, tf, 1);
   double open2 = iOpen(_Symbol, tf, 2);
   double close2 = iClose(_Symbol, tf, 2);

   return (close2 > open2 && close1 < open1 && close1 < open2 && open1 > close2);
}

//+------------------------------------------------------------------+
//| Bullish Inside Bar Breakout                                        |
//+------------------------------------------------------------------+
bool IsBullishInsideBarBreakout(ENUM_TIMEFRAMES tf) {
   double high2 = iHigh(_Symbol, tf, 2);
   double low2 = iLow(_Symbol, tf, 2);
   double high1 = iHigh(_Symbol, tf, 1);
   double low1 = iLow(_Symbol, tf, 1);
   double close0 = iClose(_Symbol, tf, 0);
   double close1 = iClose(_Symbol, tf, 1);

   bool isInsideBar = (high1 < high2 && low1 > low2);
   bool isBreakout = (close0 > high1 || close1 > high1);

   return (isInsideBar && isBreakout);
}

//+------------------------------------------------------------------+
//| Bearish Inside Bar Breakout                                        |
//+------------------------------------------------------------------+
bool IsBearishInsideBarBreakout(ENUM_TIMEFRAMES tf) {
   double high2 = iHigh(_Symbol, tf, 2);
   double low2 = iLow(_Symbol, tf, 2);
   double high1 = iHigh(_Symbol, tf, 1);
   double low1 = iLow(_Symbol, tf, 1);
   double close0 = iClose(_Symbol, tf, 0);
   double close1 = iClose(_Symbol, tf, 1);

   bool isInsideBar = (high1 < high2 && low1 > low2);
   bool isBreakout = (close0 < low1 || close1 < low1);

   return (isInsideBar && isBreakout);
}

//+------------------------------------------------------------------+
//| Morning Star Pattern (Bullish Reversal)                            |
//+------------------------------------------------------------------+
bool IsMorningStar(ENUM_TIMEFRAMES tf) {
   double open3 = iOpen(_Symbol, tf, 3);
   double close3 = iClose(_Symbol, tf, 3);
   double open2 = iOpen(_Symbol, tf, 2);
   double close2 = iClose(_Symbol, tf, 2);
   double open1 = iOpen(_Symbol, tf, 1);
   double close1 = iClose(_Symbol, tf, 1);

   bool firstBearish = (close3 < open3);
   bool smallBody = (MathAbs(close2 - open2) < (MathAbs(close3 - open3) * 0.3));
   bool secondBullish = (close1 > open1);
   bool penetrates = (close1 > (open3 + close3) / 2.0);

   return (firstBearish && smallBody && secondBullish && penetrates);
}

//+------------------------------------------------------------------+
//| Evening Star Pattern (Bearish Reversal)                            |
//+------------------------------------------------------------------+
bool IsEveningStar(ENUM_TIMEFRAMES tf) {
   double open3 = iOpen(_Symbol, tf, 3);
   double close3 = iClose(_Symbol, tf, 3);
   double open2 = iOpen(_Symbol, tf, 2);
   double close2 = iClose(_Symbol, tf, 2);
   double open1 = iOpen(_Symbol, tf, 1);
   double close1 = iClose(_Symbol, tf, 1);

   bool firstBullish = (close3 > open3);
   bool smallBody = (MathAbs(close2 - open2) < (MathAbs(close3 - open3) * 0.3));
   bool secondBearish = (close1 < open1);
   bool penetrates = (close1 < (open3 + close3) / 2.0);

   return (firstBullish && smallBody && secondBearish && penetrates);
}

//+------------------------------------------------------------------+
//| Check if price is touching a zone                                  |
//+------------------------------------------------------------------+
int CheckZoneTouch() {
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();
   double touchBuffer = pipSize * 5;

   for(int i = 0; i < ArraySize(zones); i++) {
      if(!zones[i].isValid) continue;

      if(zones[i].type == -1) {
         if(bid <= zones[i].top + touchBuffer && bid >= zones[i].bottom - touchBuffer) {
            return -1;
         }
      } else if(zones[i].type == 1) {
         if(ask >= zones[i].bottom - touchBuffer && ask <= zones[i].top + touchBuffer) {
            return 1;
         }
      }
   }

   return 0;
}

//+------------------------------------------------------------------+
//| Get zone info for entry                                            |
//+------------------------------------------------------------------+
bool GetEntryZone(int zoneType, SZone &zone) {
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();
   double touchBuffer = pipSize * 5;

   for(int i = 0; i < ArraySize(zones); i++) {
      if(!zones[i].isValid || zones[i].type != zoneType) continue;

      if(zoneType == -1) {
         if(bid <= zones[i].top + touchBuffer && bid >= zones[i].bottom - touchBuffer) {
            zone = zones[i];
            return true;
         }
      } else {
         if(ask >= zones[i].bottom - touchBuffer && ask <= zones[i].top + touchBuffer) {
            zone = zones[i];
            return true;
         }
      }
   }

   return false;
}

//+------------------------------------------------------------------+
//| Find next structure level for TP                                   |
//+------------------------------------------------------------------+
double FindNextStructureLevel(int direction, double currentPrice, ENUM_TIMEFRAMES tf) {
   double pipSize = GetPipSize();
   int lookback = 100;

   if(direction == 1) {
      for(int i = 2; i < lookback; i++) {
         double high = iHigh(_Symbol, tf, i);
         if(high > currentPrice + (10 * pipSize)) {
            return high;
         }
      }
   } else {
      for(int i = 2; i < lookback; i++) {
         double low = iLow(_Symbol, tf, i);
         if(low < currentPrice - (10 * pipSize)) {
            return low;
         }
      }
   }

   return 0;
}

//+------------------------------------------------------------------+
//| Find next opposite zone for TP                                     |
//+------------------------------------------------------------------+
double FindOppositeZoneLevel(int direction) {
   for(int i = 0; i < ArraySize(zones); i++) {
      if(!zones[i].isValid) continue;

      if(direction == 1 && zones[i].type == 1) {
         if(zones[i].bottom > SymbolInfoDouble(_Symbol, SYMBOL_ASK)) {
            return zones[i].bottom;
         }
      } else if(direction == -1 && zones[i].type == -1) {
         if(zones[i].top < SymbolInfoDouble(_Symbol, SYMBOL_BID)) {
            return zones[i].top;
         }
      }
   }

   return 0;
}

//+------------------------------------------------------------------+
//| GOD MODE: Get zone + pattern signal                                |
//+------------------------------------------------------------------+
GodModeSignal GetZoneSignal() {
   GodModeSignal sig;
   sig.hasSignal = false;
   sig.direction = 0;
   sig.entry = 0; sig.sl = 0; sig.tp = 0; sig.reason = "";

   int zoneType = CheckZoneTouch();
   if(zoneType == 0) return sig;

   int patternSignal = CheckCandlestickPatterns(zoneType, AggressiveTimeframe);
   if(patternSignal == 0) return sig;
   if(zoneType != patternSignal) return sig;

   SZone entryZone;
   if(!GetEntryZone(zoneType, entryZone)) return sig;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();

   if(patternSignal == 1) {
      sig.direction = 1;
      sig.entry = ask;
      sig.sl = entryZone.bottom - (ExtraSLPips * pipSize);
      double slDistance = (bid - sig.sl) / pipSize;
      if(slDistance < 10) { sig.hasSignal = false; return sig; }

      double structureTP = 0;
      if(UseStructureTP) {
         structureTP = FindNextStructureLevel(1, ask, AggressiveTimeframe);
         double oppositeZoneTP = FindOppositeZoneLevel(1);
         if(oppositeZoneTP > 0) structureTP = MathMin(structureTP, oppositeZoneTP);
      }
      sig.tp = structureTP > 0 ? structureTP : ask + (slDistance * MinRRRatio * pipSize);
      double tpDistance = (sig.tp - ask) / pipSize;
      if(tpDistance / slDistance < MinRRRatio && structureTP > 0) {
         sig.tp = ask + (slDistance * MinRRRatio * pipSize);
      }
      sig.reason = "Demand zone + pattern";
   } else {
      sig.direction = -1;
      sig.entry = bid;
      sig.sl = entryZone.top + (ExtraSLPips * pipSize);
      double slDistance = (sig.sl - bid) / pipSize;
      if(slDistance < 10) { sig.hasSignal = false; return sig; }

      double structureTP = 0;
      if(UseStructureTP) {
         structureTP = FindNextStructureLevel(-1, bid, AggressiveTimeframe);
         double oppositeZoneTP = FindOppositeZoneLevel(-1);
         if(oppositeZoneTP > 0) structureTP = MathMax(structureTP, oppositeZoneTP);
      }
      sig.tp = structureTP > 0 ? structureTP : bid - (slDistance * MinRRRatio * pipSize);
      double tpDistance = (bid - sig.tp) / pipSize;
      if(tpDistance / slDistance < MinRRRatio && structureTP > 0) {
         sig.tp = bid - (slDistance * MinRRRatio * pipSize);
      }
      sig.reason = "Supply zone + pattern";
   }

   sig.hasSignal = true;
   return sig;
}

//+------------------------------------------------------------------+
//| Scan aggressive timeframe for swing highs/lows                    |
//+------------------------------------------------------------------+
void ScanAggressiveSwings() {
   ArrayResize(swingHighs, 0);
   ArrayResize(swingLows, 0);
   swingCount = 0;

   int lookback = AggressiveMinSwingBars * 3;
   for(int i = 2; i < lookback; i++) {
      double high1 = iHigh(_Symbol, AggressiveTimeframe, i - 1);
      double high0 = iHigh(_Symbol, AggressiveTimeframe, i);
      double high2 = iHigh(_Symbol, AggressiveTimeframe, i - 2);

      if(high1 > high0 && high1 > high2) {
         int idx = ArraySize(swingHighs);
         ArrayResize(swingHighs, idx + 1);
         swingHighs[idx] = high1;
      }

      double low1 = iLow(_Symbol, AggressiveTimeframe, i - 1);
      double low0 = iLow(_Symbol, AggressiveTimeframe, i);
      double low2 = iLow(_Symbol, AggressiveTimeframe, i - 2);

      if(low1 < low0 && low1 < low2) {
         int idx = ArraySize(swingLows);
         ArrayResize(swingLows, idx + 1);
         swingLows[idx] = low1;
      }
   }
}

//+------------------------------------------------------------------+
//| Find the most recent swing level that was swept by price         |
//+------------------------------------------------------------------+
bool DetectLiquiditySweep(double currentBid, double currentAsk,
                          double &sweptLevel, int &sweepDirection) {
   double pipSize = GetPipSize();
   double sweepBuffer = pipSize * 3;

   for(int i = 0; i < ArraySize(swingLows); i++) {
      double lowestSinceSwing = DBL_MAX;
      for(int b = 1; b <= 5; b++) {
         double low = iLow(_Symbol, AggressiveTimeframe, b);
         if(low < lowestSinceSwing) lowestSinceSwing = low;
      }

      if(lowestSinceSwing <= swingLows[i] + sweepBuffer &&
         currentBid >= swingLows[i] - pipSize) {
         sweptLevel = swingLows[i];
         sweepDirection = 1;
         return true;
      }
   }

   for(int i = 0; i < ArraySize(swingHighs); i++) {
      double highestSinceSwing = 0;
      for(int b = 1; b <= 5; b++) {
         double high = iHigh(_Symbol, AggressiveTimeframe, b);
         if(high > highestSinceSwing) highestSinceSwing = high;
      }

      if(highestSinceSwing >= swingHighs[i] - sweepBuffer &&
         currentAsk <= swingHighs[i] + pipSize) {
         sweptLevel = swingHighs[i];
         sweepDirection = -1;
         return true;
      }
   }

   return false;
}

//+------------------------------------------------------------------+
//| Detect Change in State of Delivery after sweep                   |
//+------------------------------------------------------------------+
bool DetectCHoSD(double sweptLevel, int sweepDirection,
                 double &impulseHigh, double &impulseLow) {
   double pipSize = GetPipSize();
   double minImpulse = AggressiveImpulsePips * pipSize;
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   if(sweepDirection == 1) {
      double maxHigh = 0;
      double totalBullBody = 0;
      int bullCount = 0;

      for(int i = 1; i <= 3; i++) {
         double open = iOpen(_Symbol, AggressiveTimeframe, i);
         double close = iClose(_Symbol, AggressiveTimeframe, i);
         double high = iHigh(_Symbol, AggressiveTimeframe, i);
         double low = iLow(_Symbol, AggressiveTimeframe, i);

         if(close > open && (close - open) >= minImpulse * 0.5) {
            bullCount++;
            totalBullBody += (close - open);
            if(high > maxHigh) maxHigh = high;
         }
      }

      if(bullCount >= 2 && totalBullBody >= minImpulse * 1.5) {
         impulseHigh = maxHigh;
         impulseLow = sweptLevel - pipSize;
         return true;
      }
   } else if(sweepDirection == -1) {
      double minLow = DBL_MAX;
      double totalBearBody = 0;
      int bearCount = 0;

      for(int i = 1; i <= 3; i++) {
         double open = iOpen(_Symbol, AggressiveTimeframe, i);
         double close = iClose(_Symbol, AggressiveTimeframe, i);
         double high = iHigh(_Symbol, AggressiveTimeframe, i);
         double low = iLow(_Symbol, AggressiveTimeframe, i);

         if(close < open && (open - close) >= minImpulse * 0.5) {
            bearCount++;
            totalBearBody += (open - close);
            if(low < minLow) minLow = low;
         }
      }

      if(bearCount >= 2 && totalBearBody >= minImpulse * 1.5) {
         impulseHigh = sweptLevel + pipSize;
         impulseLow = minLow;
         return true;
      }
   }

   return false;
}

//+------------------------------------------------------------------+
//| Find IFVG (bullish) or FVG (bearish) overlapping with Fib levels|
//+------------------------------------------------------------------+
bool FindIFVGNearFib(int sweepDirection, double fibStart, double fibEnd,
                     double &entryPrice, double &fvgTop, double &fvgBottom) {
   int lookback = MathMax(AggressiveMinSwingBars, 15);
   double pipSize = GetPipSize();

   double range = MathAbs(fibEnd - fibStart);
   double fib50 = fibStart + (sweepDirection == 1 ? 0.50 * range : -0.50 * range);
   double fib618 = fibStart + (sweepDirection == 1 ? 0.618 * range : -0.618 * range);
   double fib786 = fibStart + (sweepDirection == 1 ? 0.786 * range : -0.786 * range);

   double fibLevels[3] = {fib50, fib618, fib786};

   if(sweepDirection == 1) {
      for(int i = 3; i < lookback; i++) {
         double low1 = iLow(_Symbol, AggressiveTimeframe, i - 2);
         double high3 = iHigh(_Symbol, AggressiveTimeframe, i);

         if(low1 > high3) {
            double ifvgTop = low1;
            double ifvgBottom = high3;

            for(int f = 0; f < 3; f++) {
               if(fibLevels[f] >= ifvgBottom - pipSize &&
                  fibLevels[f] <= ifvgTop + pipSize) {
                  entryPrice = fibLevels[f];
                  fvgTop = ifvgTop;
                  fvgBottom = ifvgBottom;
                  return true;
               }
            }
         }
      }
   } else if(sweepDirection == -1) {
      for(int i = 3; i < lookback; i++) {
         double high1 = iHigh(_Symbol, AggressiveTimeframe, i - 2);
         double low3 = iLow(_Symbol, AggressiveTimeframe, i);

         if(high1 < low3) {
            fvgTop = low3;
            fvgBottom = high1;

            for(int f = 0; f < 3; f++) {
               if(fibLevels[f] >= fvgBottom - pipSize &&
                  fibLevels[f] <= fvgTop + pipSize) {
                  entryPrice = fibLevels[f];
                  return true;
               }
            }
         }
      }
   }

   return false;
}

//+------------------------------------------------------------------+
//| Find next liquidity target for TP in aggressive mode               |
//+------------------------------------------------------------------+
double FindNextLiquidityTarget(int sweepDirection, double currentPrice) {
   double pipSize = GetPipSize();

   if(sweepDirection == 1) {
      for(int i = 0; i < ArraySize(swingHighs); i++) {
         if(swingHighs[i] > currentPrice + (5 * pipSize)) {
            return swingHighs[i];
         }
      }
      for(int i = 1; i <= 50; i++) {
         double high = iHigh(_Symbol, AggressiveTimeframe, i);
         if(high > currentPrice + (5 * pipSize)) {
            return high;
         }
      }
   } else {
      for(int i = 0; i < ArraySize(swingLows); i++) {
         if(swingLows[i] < currentPrice - (5 * pipSize)) {
            return swingLows[i];
         }
      }
      for(int i = 1; i <= 50; i++) {
         double low = iLow(_Symbol, AggressiveTimeframe, i);
         if(low < currentPrice - (5 * pipSize)) {
            return low;
         }
      }
   }

   return 0;
}

//+------------------------------------------------------------------+
//| Calculate lot size for aggressive mode                           |
//+------------------------------------------------------------------+
double CalculateAggressiveLotSize(double slDistancePips) {
   double accountBalance = AccountInfoDouble(ACCOUNT_BALANCE);
   double riskAmount = accountBalance * (AggressiveRiskPercent / 100.0);

   double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);

   double lotSize = (riskAmount / (slDistancePips * tickValue / tickSize));

   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);

   lotSize = MathMax(lotSize, MinLotSize);
   lotSize = MathMin(lotSize, MaxLotSize);
   lotSize = MathMax(lotSize, minLot);
   lotSize = MathMin(lotSize, maxLot);
   lotSize = MathFloor(lotSize / lotStep) * lotStep;

   return NormalizeDouble(lotSize, 2);
}

//+------------------------------------------------------------------+
//| GOD MODE: Get aggressive sweep signal                              |
//+------------------------------------------------------------------+
GodModeSignal GetSweepSignal() {
   GodModeSignal sig;
   sig.hasSignal = false;
   sig.direction = 0;
   sig.entry = 0; sig.sl = 0; sig.tp = 0; sig.reason = "";

   if(!IsWithinSession() || IsSpreadHours()) return sig;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();

   double sweptLevel;
   int sweepDirection;

   if(!DetectLiquiditySweep(bid, ask, sweptLevel, sweepDirection)) return sig;

   double impulseHigh, impulseLow;
   if(!DetectCHoSD(sweptLevel, sweepDirection, impulseHigh, impulseLow)) return sig;

   double fibStart = sweptLevel;
   double fibEnd = (sweepDirection == 1) ? impulseHigh : impulseLow;
   double fibRange = MathAbs(fibEnd - fibStart);
   if(fibRange < AggressiveImpulsePips * pipSize * 2) return sig;

   double entryPrice, fvgTop, fvgBottom;
   if(!FindIFVGNearFib(sweepDirection, fibStart, fibEnd, entryPrice, fvgTop, fvgBottom)) return sig;

   double currentPrice = (sweepDirection == 1) ? bid : ask;
   double priceDelta = MathAbs(currentPrice - entryPrice);
   if(priceDelta > pipSize * 2) return sig;

   if(sweepDirection == 1) {
      if(entryPrice < fvgBottom - pipSize) return sig;
   } else {
      if(entryPrice > fvgTop + pipSize) return sig;
   }

   double sl, tp;
   double slDistancePips, tpDistancePips;

   if(sweepDirection == 1) {
      sl = MathMin(sweptLevel, fvgBottom) - (ExtraSLPips * pipSize);
      slDistancePips = (entryPrice - sl) / pipSize;
      if(slDistancePips < 5) return sig;

      tp = FindNextLiquidityTarget(1, entryPrice);
      if(tp == 0 || tp <= entryPrice + (3 * pipSize)) {
         tp = entryPrice + (slDistancePips * AggressiveMinRR * pipSize);
      }
      tpDistancePips = (tp - entryPrice) / pipSize;
   } else {
      sl = MathMax(sweptLevel, fvgTop) + (ExtraSLPips * pipSize);
      slDistancePips = (sl - entryPrice) / pipSize;
      if(slDistancePips < 5) return sig;

      tp = FindNextLiquidityTarget(-1, entryPrice);
      if(tp == 0 || tp >= entryPrice - (3 * pipSize)) {
         tp = entryPrice - (slDistancePips * AggressiveMinRR * pipSize);
      }
      tpDistancePips = (entryPrice - tp) / pipSize;
   }

   if(tpDistancePips / slDistancePips < AggressiveMinRR) {
      tp = sweepDirection == 1
         ? entryPrice + (slDistancePips * AggressiveMinRR * pipSize)
         : entryPrice - (slDistancePips * AggressiveMinRR * pipSize);
   }

   sig.hasSignal = true;
   sig.direction = sweepDirection;
   sig.entry = entryPrice;
   sig.sl = sl;
   sig.tp = tp;
   sig.reason = (sweepDirection == 1) ? "Sweep+CHoSD+IFVG/Fib" : "Sweep+CHoSD+FVG/Fib";

   return sig;
}

//+------------------------------------------------------------------+
//| Check for aggressive entry signals (legacy - places trade)        |
//+------------------------------------------------------------------+
void CheckAggressiveEntries() {
   if(!IsWithinSession() || IsSpreadHours()) return;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();

   double sweptLevel;
   int sweepDirection;

   if(!DetectLiquiditySweep(bid, ask, sweptLevel, sweepDirection)) return;

   double impulseHigh, impulseLow;
   if(!DetectCHoSD(sweptLevel, sweepDirection, impulseHigh, impulseLow)) return;

   double fibStart = sweptLevel;
   double fibEnd = (sweepDirection == 1) ? impulseHigh : impulseLow;
   double fibRange = MathAbs(fibEnd - fibStart);
   if(fibRange < AggressiveImpulsePips * pipSize * 2) return;

   double entryPrice, fvgTop, fvgBottom;
   if(!FindIFVGNearFib(sweepDirection, fibStart, fibEnd, entryPrice, fvgTop, fvgBottom)) return;

   double currentPrice = (sweepDirection == 1) ? bid : ask;
   double priceDelta = MathAbs(currentPrice - entryPrice);
   if(priceDelta > pipSize * 2) return;

   if(sweepDirection == 1) {
      if(entryPrice < fvgBottom - pipSize) return;
   } else {
      if(entryPrice > fvgTop + pipSize) return;
   }

   double sl, tp;
   double slDistancePips, tpDistancePips;

   if(sweepDirection == 1) {
      sl = MathMin(sweptLevel, fvgBottom) - (ExtraSLPips * pipSize);
      slDistancePips = (entryPrice - sl) / pipSize;
      if(slDistancePips < 5) return;
      tp = FindNextLiquidityTarget(1, entryPrice);
      if(tp == 0 || tp <= entryPrice + (3 * pipSize)) {
         tp = entryPrice + (slDistancePips * AggressiveMinRR * pipSize);
      }
      tpDistancePips = (tp - entryPrice) / pipSize;
   } else {
      sl = MathMax(sweptLevel, fvgTop) + (ExtraSLPips * pipSize);
      slDistancePips = (sl - entryPrice) / pipSize;
      if(slDistancePips < 5) return;
      tp = FindNextLiquidityTarget(-1, entryPrice);
      if(tp == 0 || tp >= entryPrice - (3 * pipSize)) {
         tp = entryPrice - (slDistancePips * AggressiveMinRR * pipSize);
      }
      tpDistancePips = (entryPrice - tp) / pipSize;
   }

   if(tpDistancePips / slDistancePips < AggressiveMinRR) {
      tp = sweepDirection == 1
         ? entryPrice + (slDistancePips * AggressiveMinRR * pipSize)
         : entryPrice - (slDistancePips * AggressiveMinRR * pipSize);
   }

   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double lotSize = CalculateAggressiveLotSize(slDistancePips);

   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);
   lotSize = NormalizeDouble(lotSize, 2);

   if(sweepDirection == 1) {
      if(trade.Buy(lotSize, _Symbol, ask, sl, tp, "BigDogsFX Agg Buy")) {
         Print("AGGRESSIVE BUY | Lot: ", lotSize, " | Entry: ", entryPrice,
               " | SL: ", sl, " | TP: ", tp, " | Sweep: ", sweptLevel);
      }
   } else {
      if(trade.Sell(lotSize, _Symbol, bid, sl, tp, "BigDogsFX Agg Sell")) {
         Print("AGGRESSIVE SELL | Lot: ", lotSize, " | Entry: ", entryPrice,
               " | SL: ", sl, " | TP: ", tp, " | Sweep: ", sweptLevel);
      }
   }
}

//+------------------------------------------------------------------+
//| Check if current symbol is in the allowed list                    |
//+------------------------------------------------------------------+
bool IsAllowedSymbol() {
   string parts[];
   int count = StringSplit(AllowedSymbols, ',', parts);
   string currentSymbol = _Symbol;
   StringToUpper(currentSymbol);

   for(int i = 0; i < count; i++) {
      string sym = parts[i];
      StringToUpper(sym);
      if(currentSymbol == sym) return true;
   }
   return false;
}

//+------------------------------------------------------------------+
//| Agent 1: S&D Zone Trader - zone touch + candlestick pattern      |
//+------------------------------------------------------------------+
AgentResult Agent1_SnDZone(ENUM_TIMEFRAMES tf) {
   AgentResult res;
   res.vote = VOTE_NEUTRAL;
   res.entry = 0; res.sl = 0; res.tp = 0; res.reason = "";

   if(!Agent1_SnD) return res;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();

   int zoneType = CheckZoneTouch();
   if(zoneType == 0) return res;

   int patternSignal = CheckCandlestickPatterns(zoneType, tf);
   if(patternSignal == 0 || zoneType != patternSignal) return res;

   SZone entryZone;
   if(!GetEntryZone(zoneType, entryZone)) return res;

   res.entry = (patternSignal == 1) ? ask : bid;
   res.sl = (patternSignal == 1)
      ? entryZone.bottom - (ExtraSLPips * pipSize)
      : entryZone.top + (ExtraSLPips * pipSize);
   res.tp = (patternSignal == 1)
      ? FindNextStructureLevel(1, ask, tf)
      : FindNextStructureLevel(-1, bid, tf);
   if(res.tp == 0) res.tp = res.entry + (patternSignal == 1 ? 50 * pipSize : -50 * pipSize);
   res.vote = (patternSignal == 1) ? VOTE_BUY : VOTE_SELL;
   res.reason = (patternSignal == 1) ? "Demand zone + pattern" : "Supply zone + pattern";
   return res;
}

//+------------------------------------------------------------------+
//| Agent 2: Liquidity Sweep Trader                                  |
//+------------------------------------------------------------------+
AgentResult Agent2_LiquiditySweep(ENUM_TIMEFRAMES tf) {
   AgentResult res;
   res.vote = VOTE_NEUTRAL;
   res.entry = 0; res.sl = 0; res.tp = 0; res.reason = "";

   if(!Agent2_Sweep) return res;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();

   double sweptLevel; int sweepDirection;
   if(!DetectLiquiditySweep(bid, ask, sweptLevel, sweepDirection)) return res;

   double impulseHigh, impulseLow;
   if(!DetectCHoSD(sweptLevel, sweepDirection, impulseHigh, impulseLow)) return res;

   res.entry = (sweepDirection == 1) ? ask : bid;
   res.sl = (sweepDirection == 1)
      ? MathMin(sweptLevel, impulseLow) - (ExtraSLPips * pipSize)
      : MathMax(sweptLevel, impulseHigh) + (ExtraSLPips * pipSize);

   double tpTarget = FindNextLiquidityTarget(sweepDirection, res.entry);
   res.tp = (tpTarget != 0) ? tpTarget : res.entry + (sweepDirection == 1 ? 40 * pipSize : -40 * pipSize);

   res.vote = (sweepDirection == 1) ? VOTE_BUY : VOTE_SELL;
   res.reason = (sweepDirection == 1) ? "Liquidity sweep low" : "Liquidity sweep high";
   return res;
}

//+------------------------------------------------------------------+
//| Agent 3: FVG + Fib Retracement Trader                            |
//+------------------------------------------------------------------+
AgentResult Agent3_FVGIFVGFib(ENUM_TIMEFRAMES tf) {
   AgentResult res;
   res.vote = VOTE_NEUTRAL;
   res.entry = 0; res.sl = 0; res.tp = 0; res.reason = "";

   if(!Agent3_FVGFib) return res;

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();

   double sweptLevel; int sweepDirection;
   if(!DetectLiquiditySweep(bid, ask, sweptLevel, sweepDirection)) return res;

   double impulseHigh, impulseLow;
   if(!DetectCHoSD(sweptLevel, sweepDirection, impulseHigh, impulseLow)) return res;

   double fibStart = sweptLevel;
   double fibEnd = (sweepDirection == 1) ? impulseHigh : impulseLow;
   double fibRange = MathAbs(fibEnd - fibStart);
   if(fibRange < AggressiveImpulsePips * pipSize * 2) return res;

   double entryPrice, fvgTop, fvgBottom;
   if(!FindIFVGNearFib(sweepDirection, fibStart, fibEnd, entryPrice, fvgTop, fvgBottom)) return res;

   double currentPrice = (sweepDirection == 1) ? bid : ask;
   if(MathAbs(currentPrice - entryPrice) > pipSize * 2) return res;

   if(sweepDirection == 1 && entryPrice < fvgBottom - pipSize) return res;
   if(sweepDirection == -1 && entryPrice > fvgTop + pipSize) return res;

   res.entry = entryPrice;
   res.sl = (sweepDirection == 1)
      ? MathMin(sweptLevel, fvgBottom) - (ExtraSLPips * pipSize)
      : MathMax(sweptLevel, fvgTop) + (ExtraSLPips * pipSize);

   double tpTarget = FindNextLiquidityTarget(sweepDirection, entryPrice);
   res.tp = (tpTarget != 0) ? tpTarget : entryPrice + (sweepDirection == 1 ? 40 * pipSize : -40 * pipSize);

   res.vote = (sweepDirection == 1) ? VOTE_BUY : VOTE_SELL;
   res.reason = (sweepDirection == 1) ? "IFVG at fib level" : "FVG at fib level";
   return res;
}

//+------------------------------------------------------------------+
//| Agent 4: Momentum Breaker - consecutive impulsive candles        |
//+------------------------------------------------------------------+
AgentResult Agent4_MomentumFn(ENUM_TIMEFRAMES tf) {
   AgentResult res;
   res.vote = VOTE_NEUTRAL;
   res.entry = 0; res.sl = 0; res.tp = 0; res.reason = "";

   if(!Agent4_Momentum) return res;

   double pipSize = GetPipSize();
   double minBody = pipSize * 10;
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   int bullCount = 0, bearCount = 0;

   for(int i = 1; i <= 5; i++) {
      double open = iOpen(_Symbol, tf, i);
      double close = iClose(_Symbol, tf, i);
      double body = MathAbs(close - open);
      if(body < minBody) { bullCount = 0; bearCount = 0; continue; }
      if(close > open) { bullCount++; bearCount = 0; }
      else { bearCount++; bullCount = 0; }
      if(bullCount >= 3 || bearCount >= 3) break;
   }

   if(bullCount >= 3) {
      res.vote = VOTE_BUY; res.entry = ask;
      res.sl = ask - (20 * pipSize); res.tp = ask + (40 * pipSize);
      res.reason = "3+ bullish impulse candles";
   } else if(bearCount >= 3) {
      res.vote = VOTE_SELL; res.entry = bid;
      res.sl = bid + (20 * pipSize); res.tp = bid - (40 * pipSize);
      res.reason = "3+ bearish impulse candles";
   }
   return res;
}

//+------------------------------------------------------------------+
//| Agent 5: HTF Trend Follower - 200 EMA slope                      |
//+------------------------------------------------------------------+
AgentResult Agent5_TrendFn(ENUM_TIMEFRAMES tf) {
   AgentResult res;
   res.vote = VOTE_NEUTRAL;
   res.entry = 0; res.sl = 0; res.tp = 0; res.reason = "";

   if(!Agent5_Trend) return res;

   double pipSize = GetPipSize();
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   int emaHandle = iMA(_Symbol, tf, 200, 0, MODE_EMA, PRICE_CLOSE);
   if(emaHandle == INVALID_HANDLE) return res;

   double ema[3];
   if(CopyBuffer(emaHandle, 0, 0, 3, ema) < 3) return res;

   bool uptrend = (bid > ema[0] && ema[0] > ema[1]);
   bool downtrend = (bid < ema[0] && ema[0] < ema[1]);

   if(uptrend) {
      res.vote = VOTE_BUY; res.entry = ask;
      res.sl = ema[0] - (5 * pipSize); res.tp = ask + (30 * pipSize);
      res.reason = "HTF uptrend (price > 200 EMA)";
   } else if(downtrend) {
      res.vote = VOTE_SELL; res.entry = bid;
      res.sl = ema[0] + (5 * pipSize); res.tp = bid - (30 * pipSize);
      res.reason = "HTF downtrend (price < 200 EMA)";
   }
   return res;
}

//+------------------------------------------------------------------+
//| Get consensus from all agents                                    |
//+------------------------------------------------------------------+
ConsensusResult GetConsensus() {
   ConsensusResult result;
   result.hasConsensus = false;
   result.direction = 0;
   result.entry = 0; result.sl = 0; result.tp = 0;
   result.agreeCount = 0; result.agentsSummary = "";

   ENUM_TIMEFRAMES tf = AggressiveTimeframe;
   AgentResult agents[5];
   agents[0] = Agent1_SnDZone(tf);
   agents[1] = Agent2_LiquiditySweep(tf);
   agents[2] = Agent3_FVGIFVGFib(tf);
   agents[3] = Agent4_MomentumFn(tf);
   agents[4] = Agent5_TrendFn(tf);

   int buyVotes = 0, sellVotes = 0;
   double buyEntry = 0, sellEntry = 0, buySL = 0, sellSL = 0, buyTP = 0, sellTP = 0;
   int buyCount = 0, sellCount = 0;
   string as[] = {"A1","A2","A3","A4","A5"};

   for(int i = 0; i < 5; i++) {
      if(agents[i].vote == VOTE_BUY) {
         buyVotes++;
         buyEntry += agents[i].entry;
         if(buyCount == 0 || agents[i].sl > buySL) buySL = agents[i].sl;
         buyTP += agents[i].tp;
         buyCount++;
         result.agentsSummary += as[i] + ":BUY ";
         if(agents[i].reason != "") result.agentsSummary += "(" + agents[i].reason + ") ";
      } else if(agents[i].vote == VOTE_SELL) {
         sellVotes++;
         sellEntry += agents[i].entry;
         if(sellCount == 0 || agents[i].sl < sellSL) sellSL = agents[i].sl;
         sellTP += agents[i].tp;
         sellCount++;
         result.agentsSummary += as[i] + ":SELL ";
         if(agents[i].reason != "") result.agentsSummary += "(" + agents[i].reason + ") ";
      }
   }

   if(buyVotes >= MinAgreeCount && buyVotes > sellVotes) {
      result.hasConsensus = true; result.direction = 1;
      result.entry = buyEntry / buyCount;
      result.sl = buySL; result.tp = buyTP / buyCount;
      result.agreeCount = buyVotes;
   } else if(sellVotes >= MinAgreeCount && sellVotes > buyVotes) {
      result.hasConsensus = true; result.direction = -1;
      result.entry = sellEntry / sellCount;
      result.sl = sellSL; result.tp = sellTP / sellCount;
      result.agreeCount = sellVotes;
   }
   return result;
}

//+------------------------------------------------------------------+
//| Execute trade based on consensus                                 |
//+------------------------------------------------------------------+
void ExecuteConsensusTrade(ConsensusResult &consensus) {
   if(!consensus.hasConsensus) return;

   double pipSize = GetPipSize();
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   double slDistance = (consensus.direction == 1)
      ? (consensus.entry - consensus.sl) / pipSize
      : (consensus.sl - consensus.entry) / pipSize;
   if(slDistance < 5) return;

   double lotSize = CalculateAggressiveLotSize(slDistance);

   double sl = NormalizeDouble(consensus.sl, digits);
   double tp = NormalizeDouble(consensus.tp, digits);
   lotSize = NormalizeDouble(lotSize, 2);

   if(consensus.direction == 1) {
      if(trade.Buy(lotSize, _Symbol, ask, sl, tp, "BigDogsFX Agreed Buy")) {
         Print("CONSENSUS BUY | Agents: ", consensus.agreeCount,
               " | Votes: ", consensus.agentsSummary,
               " | Lot: ", lotSize, " | Entry: ", consensus.entry,
               " | SL: ", sl, " | TP: ", tp);
      }
   } else {
      if(trade.Sell(lotSize, _Symbol, bid, sl, tp, "BigDogsFX Agreed Sell")) {
         Print("CONSENSUS SELL | Agents: ", consensus.agreeCount,
               " | Votes: ", consensus.agentsSummary,
               " | Lot: ", lotSize, " | Entry: ", consensus.entry,
               " | SL: ", sl, " | TP: ", tp);
      }
   }
}

//+------------------------------------------------------------------+
//| GOD MODE: Evaluate combined signals and trade                     |
//+------------------------------------------------------------------+
void EvaluateGodModeEntry(GodModeSignal &sweep, GodModeSignal &zone, ConsensusResult &agents) {
   int buySources = 0, sellSources = 0;
   double entry = 0, sl = 0, tp = 0;
   string reason = "";

   //--- Count sources that agree on direction
   if(sweep.hasSignal && sweep.direction == 1) { buySources++; reason += "Sweep "; }
   if(sweep.hasSignal && sweep.direction == -1) { sellSources++; reason += "Sweep "; }
   if(zone.hasSignal && zone.direction == 1) { buySources++; reason += "Zone "; }
   if(zone.hasSignal && zone.direction == -1) { sellSources++; reason += "Zone "; }
   if(agents.hasConsensus && agents.direction == 1) { buySources++; reason += "Agents "; }
   if(agents.hasConsensus && agents.direction == -1) { sellSources++; reason += "Agents "; }

   int agreedSources = MathMax(buySources, sellSources);
   int direction = (buySources > sellSources) ? 1 : -1;

   if(agreedSources < 1) return;

   double pipSize = GetPipSize();
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);

   //--- Calculate aggregated entry, SL, TP from all agreeing sources
   int count = 0;

   if(direction == 1) {
      if(sweep.hasSignal && sweep.direction == 1) {
         entry += sweep.entry; sl += sweep.sl; tp += sweep.tp; count++;
      }
      if(zone.hasSignal && zone.direction == 1) {
         entry += zone.entry; sl += zone.sl; tp += zone.tp; count++;
      }
      if(agents.hasConsensus && agents.direction == 1) {
         entry += agents.entry; sl += agents.sl; tp += agents.tp; count++;
      }
   } else {
      if(sweep.hasSignal && sweep.direction == -1) {
         entry += sweep.entry; sl += sweep.sl; tp += sweep.tp; count++;
      }
      if(zone.hasSignal && zone.direction == -1) {
         entry += zone.entry; sl += zone.sl; tp += zone.tp; count++;
      }
      if(agents.hasConsensus && agents.direction == -1) {
         entry += agents.entry; sl += agents.sl; tp += agents.tp; count++;
      }
   }

   if(count == 0) return;

   entry /= count;
   //--- Use worst-case SL (tightest for buys, widest for sells)
   if(direction == 1) {
      double worstSL = DBL_MAX;
      if(sweep.hasSignal && sweep.direction == 1 && sweep.sl < worstSL) worstSL = sweep.sl;
      if(zone.hasSignal && zone.direction == 1 && zone.sl < worstSL) worstSL = zone.sl;
      if(agents.hasConsensus && agents.direction == 1 && agents.sl < worstSL) worstSL = agents.sl;
      sl = worstSL;
   } else {
      double worstSL = 0;
      if(sweep.hasSignal && sweep.direction == -1 && sweep.sl > worstSL) worstSL = sweep.sl;
      if(zone.hasSignal && zone.direction == -1 && zone.sl > worstSL) worstSL = zone.sl;
      if(agents.hasConsensus && agents.direction == -1 && agents.sl > worstSL) worstSL = agents.sl;
      sl = worstSL;
   }
   tp /= count;

   //--- Verify SL distance
   double slDistance = (direction == 1)
      ? (entry - sl) / pipSize
      : (sl - entry) / pipSize;
   if(slDistance < 5) return;

   //--- Size: full lot if 3 sources agree, reduced if 2/1
   double lotSize;
   if(agreedSources >= 3) {
      lotSize = CalculateAggressiveLotSize(slDistance);
   } else {
      //--- 1-2 sources: use standard risk sizing
      lotSize = CalculateAggressiveLotSize(slDistance);
      //--- Reduce size if fewer sources agreed
      if(agreedSources == 1) {
         double halfRisk = AggressiveRiskPercent * 0.5;
         double account = AccountInfoDouble(ACCOUNT_BALANCE);
         double riskAmount = account * (halfRisk / 100.0);
         double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
         double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
         lotSize = (riskAmount / (slDistance * tickValue / tickSize));
         double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
         double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
         double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
         lotSize = MathMax(lotSize, MinLotSize);
         lotSize = MathMin(lotSize, MaxLotSize);
         lotSize = MathMax(lotSize, minLot);
         lotSize = MathMin(lotSize, maxLot);
         lotSize = MathFloor(lotSize / lotStep) * lotStep;
         lotSize = NormalizeDouble(lotSize, 2);
      }
   }

   sl = NormalizeDouble(sl, digits);
   tp = NormalizeDouble(tp, digits);

   if(direction == 1) {
      if(trade.Buy(lotSize, _Symbol, ask, sl, tp, "BigDogsFX God Buy")) {
         Print("GOD MODE BUY | Sources: ", reason, " (", agreedSources, "/3)",
               " | Lot: ", lotSize, " | Entry: ", entry,
               " | SL: ", sl, " | TP: ", tp);
      }
   } else {
      if(trade.Sell(lotSize, _Symbol, bid, sl, tp, "BigDogsFX God Sell")) {
         Print("GOD MODE SELL | Sources: ", reason, " (", agreedSources, "/3)",
               " | Lot: ", lotSize, " | Entry: ", entry,
               " | SL: ", sl, " | TP: ", tp);
      }
   }
}

//+------------------------------------------------------------------+
//| Manage open trades - breakeven and trailing                        |
//+------------------------------------------------------------------+
void ManageOpenTrades() {
   double pipSize = GetPipSize();
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);

   for(int i = PositionsTotal() - 1; i >= 0; i--) {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);
      long posType = PositionGetInteger(POSITION_TYPE);

      if(posType == POSITION_TYPE_BUY) {
         double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         double profitPips = (bid - openPrice) / pipSize;

         if(profitPips >= BreakevenPips && currentSL < openPrice) {
            double newSL = openPrice + (5 * point);
            trade.PositionModify(ticket, NormalizeDouble(newSL, digits), currentTP);
            Print("Breakeven triggered for BUY #", ticket);
         }

         if(profitPips >= TrailingStartPips) {
            double newSL = bid - (TrailingDistance * pipSize);
            if(newSL > currentSL + (5 * point)) {
               trade.PositionModify(ticket, NormalizeDouble(newSL, digits), currentTP);
            }
         }

      } else if(posType == POSITION_TYPE_SELL) {
         double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
         double profitPips = (openPrice - ask) / pipSize;

         if(profitPips >= BreakevenPips && (currentSL > openPrice || currentSL == 0)) {
            double newSL = openPrice - (5 * point);
            trade.PositionModify(ticket, NormalizeDouble(newSL, digits), currentTP);
            Print("Breakeven triggered for SELL #", ticket);
         }

         if(profitPips >= TrailingStartPips) {
            double newSL = ask + (TrailingDistance * pipSize);
            if(currentSL == 0 || newSL < currentSL - (5 * point)) {
               trade.PositionModify(ticket, NormalizeDouble(newSL, digits), currentTP);
            }
         }
      }
   }
}
//+------------------------------------------------------------------+
