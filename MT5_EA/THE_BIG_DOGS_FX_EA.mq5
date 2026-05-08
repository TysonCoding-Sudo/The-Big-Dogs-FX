//+------------------------------------------------------------------+
//|                                          THE_BIG_DOGS_FX_EA.mq5  |
//|                                  Copyright 2025, THE BIG DOGS FX |
//|                                           We chase the cash      |
//+------------------------------------------------------------------+
#property copyright "THE BIG DOGS FX - We chase the cash"
#property version   "1.00"
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

input group "=== TRADE FILTERS ==="
input int    MaxSpreadPoints    = 300;      // Max spread allowed (in points)
input int    MaxOpenTrades      = 3;        // Max simultaneous trades
input int    MagicNumber        = 20250417; // EA Magic Number
input double MinLotSize         = 0.01;     // Minimum lot size
input double MaxLotSize         = 10.0;     // Maximum lot size

input group "=== TP/SL STRUCTURE ==="
input int    ExtraSLPips        = 10;       // Extra buffer beyond zone (pips)
input bool   UseStructureTP     = true;     // TP at next structure level
input int    MinRRRatio         = 2;        // Minimum Risk:Reward ratio

//--- Global Variables
datetime lastBarTime = 0;
int zoneCount = 0;

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

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit() {
   trade.SetExpertMagicNumber(MagicNumber);
   trade.SetDeviationInPoints(50);
   trade.SetTypeFilling(ORDER_FILLING_IOC);
   
   ArrayResize(zones, 0);
   
   Print("==============================================");
   Print("   THE BIG DOGS FX - We chase the cash");
   Print("   EA Initialized Successfully");
   Print("   Risk: ", RiskPercent, "% | BE: ", BreakevenPips, " pips");
   Print("   Min Impulsive: ", MinImpulsivePips, " pips");
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
   datetime currentBarTime = iTime(_Symbol, PERIOD_H1, 0);
   
   if(currentBarTime != lastBarTime) {
      lastBarTime = currentBarTime;
      ScanForZones();
   }
   
   ManageOpenTrades();
   
   if(IsWithinSession() && IsSpreadOK() && CountOpenTrades() < MaxOpenTrades) {
      CheckForEntries();
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
//|
//+------------------------------------------------------------------+
int PipsToPoints(int pips) {
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   
   double pipSize = (digits == 3 || digits == 5) ? point * 10 : point;
   
   return (int)MathRound(pips / pipSize * point);
}

//+------------------------------------------------------------------+
//| Scan H1 chart for Supply/Demand zones                              |
//+------------------------------------------------------------------+
void ScanForZones() {
   ArrayResize(zones, 0);
   zoneCount = 0;
   
   double pipSize = GetPipSize();
   double minImpulseSize = MinImpulsivePips * pipSize;
   
   for(int i = 2; i < MaxZoneLookback; i++) {
      double bodySize = MathAbs(iClose(_Symbol, PERIOD_H1, i) - iOpen(_Symbol, PERIOD_H1, i));
      double candleRange = iHigh(_Symbol, PERIOD_H1, i) - iLow(_Symbol, PERIOD_H1, i);
      
      if(bodySize >= minImpulseSize && candleRange >= minImpulseSize) {
         bool isBullishImpulse = (iClose(_Symbol, PERIOD_H1, i) - iOpen(_Symbol, PERIOD_H1, i)) > 0;
         
         int prevIdx = i + 1;
         if(prevIdx >= MaxZoneLookback) continue;
         
         double zoneTop, zoneBottom;
         int zoneType;
         
         if(isBullishImpulse) {
            zoneTop = iLow(_Symbol, PERIOD_H1, prevIdx);
            zoneBottom = iLow(_Symbol, PERIOD_H1, prevIdx) - (candleRange * 0.2);
            zoneType = -1; // Demand
         } else {
            zoneTop = iHigh(_Symbol, PERIOD_H1, prevIdx) + (candleRange * 0.2);
            zoneBottom = iHigh(_Symbol, PERIOD_H1, prevIdx);
            zoneType = 1; // Supply
         }
         
         bool hasFVG = false;
         double fvgTop = 0, fvgBottom = 0;
         
         if(UseFVGConfluence) {
            hasFVG = FindFVGNearZone(i, zoneTop, zoneBottom, zoneType, fvgTop, fvgBottom);
         }
         
         int idx = ArraySize(zones);
         ArrayResize(zones, idx + 1);
         
         zones[idx].zoneTime = iTime(_Symbol, PERIOD_H1, prevIdx);
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
bool FindFVGNearZone(int zoneIdx, double zoneTop, double zoneBottom, int zoneType, double &fvgTop, double &fvgBottom) {
   for(int i = zoneIdx - 10; i <= zoneIdx + 5; i++) {
      if(i < 2) continue;
      
      double high1 = iHigh(_Symbol, PERIOD_H1, i - 2);
      double low1 = iLow(_Symbol, PERIOD_H1, i - 2);
      double high3 = iHigh(_Symbol, PERIOD_H1, i);
      double low3 = iLow(_Symbol, PERIOD_H1, i);
      
      if(zoneType == -1) { // Bullish - looking for bullish FVG
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
      } else { // Bearish - looking for bearish FVG
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
int CheckCandlestickPatterns(int zoneType) {
   int signal = 0; // 0 = no signal, 1 = buy, -1 = sell
   
   if(zoneType == -1) { // Demand zone - looking for bullish patterns
      if(UseEngulfing && IsBullishEngulfing()) signal = 1;
      if(UseInsideBar && IsBullishInsideBarBreakout()) signal = 1;
      if(UseMorningStar && IsMorningStar()) signal = 1;
   } else if(zoneType == 1) { // Supply zone - looking for bearish patterns
      if(UseEngulfing && IsBearishEngulfing()) signal = -1;
      if(UseInsideBar && IsBearishInsideBarBreakout()) signal = -1;
      if(UseEveningStar && IsEveningStar()) signal = -1;
   }
   
   return signal;
}

//+------------------------------------------------------------------+
//| Bullish Engulfing Pattern                                          |
//+------------------------------------------------------------------+
bool IsBullishEngulfing() {
   double open1 = iOpen(_Symbol, PERIOD_H1, 1);
   double close1 = iClose(_Symbol, PERIOD_H1, 1);
   double open2 = iOpen(_Symbol, PERIOD_H1, 2);
   double close2 = iClose(_Symbol, PERIOD_H1, 2);
   
   return (close2 < open2 && close1 > open1 && close1 > open2 && open1 < close2);
}

//+------------------------------------------------------------------+
//| Bearish Engulfing Pattern                                          |
//+------------------------------------------------------------------+
bool IsBearishEngulfing() {
   double open1 = iOpen(_Symbol, PERIOD_H1, 1);
   double close1 = iClose(_Symbol, PERIOD_H1, 1);
   double open2 = iOpen(_Symbol, PERIOD_H1, 2);
   double close2 = iClose(_Symbol, PERIOD_H1, 2);
   
   return (close2 > open2 && close1 < open1 && close1 < open2 && open1 > close2);
}

//+------------------------------------------------------------------+
//| Bullish Inside Bar Breakout                                        |
//+------------------------------------------------------------------+
bool IsBullishInsideBarBreakout() {
   double high2 = iHigh(_Symbol, PERIOD_H1, 2);
   double low2 = iLow(_Symbol, PERIOD_H1, 2);
   double high1 = iHigh(_Symbol, PERIOD_H1, 1);
   double low1 = iLow(_Symbol, PERIOD_H1, 1);
   double close0 = iClose(_Symbol, PERIOD_H1, 0);
   double close1 = iClose(_Symbol, PERIOD_H1, 1);
   
   bool isInsideBar = (high1 < high2 && low1 > low2);
   bool isBreakout = (close0 > high1 || close1 > high1);
   
   return (isInsideBar && isBreakout);
}

//+------------------------------------------------------------------+
//| Bearish Inside Bar Breakout                                        |
//+------------------------------------------------------------------+
bool IsBearishInsideBarBreakout() {
   double high2 = iHigh(_Symbol, PERIOD_H1, 2);
   double low2 = iLow(_Symbol, PERIOD_H1, 2);
   double high1 = iHigh(_Symbol, PERIOD_H1, 1);
   double low1 = iLow(_Symbol, PERIOD_H1, 1);
   double close0 = iClose(_Symbol, PERIOD_H1, 0);
   double close1 = iClose(_Symbol, PERIOD_H1, 1);
   
   bool isInsideBar = (high1 < high2 && low1 > low2);
   bool isBreakout = (close0 < low1 || close1 < low1);
   
   return (isInsideBar && isBreakout);
}

//+------------------------------------------------------------------+
//| Morning Star Pattern (Bullish Reversal)                            |
//+------------------------------------------------------------------+
bool IsMorningStar() {
   double open3 = iOpen(_Symbol, PERIOD_H1, 3);
   double close3 = iClose(_Symbol, PERIOD_H1, 3);
   double open2 = iOpen(_Symbol, PERIOD_H1, 2);
   double close2 = iClose(_Symbol, PERIOD_H1, 2);
   double open1 = iOpen(_Symbol, PERIOD_H1, 1);
   double close1 = iClose(_Symbol, PERIOD_H1, 1);
   
   bool firstBearish = (close3 < open3);
   bool smallBody = (MathAbs(close2 - open2) < (MathAbs(close3 - open3) * 0.3));
   bool secondBullish = (close1 > open1);
   bool penetrates = (close1 > (open3 + close3) / 2.0);
   
   return (firstBearish && smallBody && secondBullish && penetrates);
}

//+------------------------------------------------------------------+
//| Evening Star Pattern (Bearish Reversal)                            |
//+------------------------------------------------------------------+
bool IsEveningStar() {
   double open3 = iOpen(_Symbol, PERIOD_H1, 3);
   double close3 = iClose(_Symbol, PERIOD_H1, 3);
   double open2 = iOpen(_Symbol, PERIOD_H1, 2);
   double close2 = iClose(_Symbol, PERIOD_H1, 2);
   double open1 = iOpen(_Symbol, PERIOD_H1, 1);
   double close1 = iClose(_Symbol, PERIOD_H1, 1);
   
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
      
      if(zones[i].type == -1) { // Demand zone
         if(bid <= zones[i].top + touchBuffer && bid >= zones[i].bottom - touchBuffer) {
            return -1; // Price in demand zone
         }
      } else if(zones[i].type == 1) { // Supply zone
         if(ask >= zones[i].bottom - touchBuffer && ask <= zones[i].top + touchBuffer) {
            return 1; // Price in supply zone
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
double FindNextStructureLevel(int direction, double currentPrice) {
   double pipSize = GetPipSize();
   int lookback = 100;
   
   if(direction == 1) { // Looking for resistance (bullish TP)
      for(int i = 2; i < lookback; i++) {
         double high = iHigh(_Symbol, PERIOD_H1, i);
         if(high > currentPrice + (10 * pipSize)) {
            return high;
         }
      }
   } else { // Looking for support (bearish TP)
      for(int i = 2; i < lookback; i++) {
         double low = iLow(_Symbol, PERIOD_H1, i);
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
double FindOppositeZoneLevel(int direction, double currentPrice) {
   for(int i = 0; i < ArraySize(zones); i++) {
      if(!zones[i].isValid) continue;
      
      if(direction == 1 && zones[i].type == 1) { // Bullish trade, find supply zone
         if(zones[i].bottom > currentPrice) {
            return zones[i].bottom;
         }
      } else if(direction == -1 && zones[i].type == -1) { // Bearish trade, find demand zone
         if(zones[i].top < currentPrice) {
            return zones[i].top;
         }
      }
   }
   
   return 0;
}

//+------------------------------------------------------------------+
//| Check for entry signals                                            |
//+------------------------------------------------------------------+
void CheckForEntries() {
   int zoneType = CheckZoneTouch();
   
   if(zoneType == 0) return;
   
   int patternSignal = CheckCandlestickPatterns(zoneType);
   
   if(patternSignal == 0) return;
   
   if(zoneType != patternSignal) return;
   
   SZone entryZone;
   if(!GetEntryZone(zoneType, entryZone)) return;
   
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double pipSize = GetPipSize();
   
   double slDistance, tpDistance;
   double sl, tp;
   
   if(patternSignal == 1) { // BUY
      sl = entryZone.bottom - (ExtraSLPips * pipSize);
      slDistance = (bid - sl) / pipSize;
      
      if(slDistance < 10) return;
      
      double lotSize = CalculateLotSize(slDistance * (SymbolInfoDouble(_Symbol, SYMBOL_DIGITS) == 3 || SymbolInfoDouble(_Symbol, SYMBOL_DIGITS) == 5) ? 10 : 1);
      
      double structureTP = 0;
      if(UseStructureTP) {
         structureTP = FindNextStructureLevel(1, ask);
         double oppositeZoneTP = FindOppositeZoneLevel(1, ask);
         if(oppositeZoneTP > 0) structureTP = MathMin(structureTP, oppositeZoneTP);
      }
      
      tp = structureTP > 0 ? structureTP : ask + (slDistance * MinRRRatio * pipSize);
      tpDistance = (tp - ask) / pipSize;
      
      if(tpDistance / slDistance < MinRRRatio && structureTP > 0) {
         tp = ask + (slDistance * MinRRRatio * pipSize);
      }
      
      sl = NormalizeDouble(sl, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
      tp = NormalizeDouble(tp, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
      lotSize = NormalizeDouble(lotSize, 2);
      
      if(trade.Buy(lotSize, _Symbol, ask, sl, tp, "BigDogsFX Buy")) {
         Print("BUY Order Placed | Lot: ", lotSize, " | SL: ", sl, " | TP: ", tp);
      }
      
   } else if(patternSignal == -1) { // SELL
      sl = entryZone.top + (ExtraSLPips * pipSize);
      slDistance = (sl - bid) / pipSize;
      
      if(slDistance < 10) return;
      
      double lotSize = CalculateLotSize(slDistance);
      
      double structureTP = 0;
      if(UseStructureTP) {
         structureTP = FindNextStructureLevel(-1, bid);
         double oppositeZoneTP = FindOppositeZoneLevel(-1, bid);
         if(oppositeZoneTP > 0) structureTP = MathMax(structureTP, oppositeZoneTP);
      }
      
      tp = structureTP > 0 ? structureTP : bid - (slDistance * MinRRRatio * pipSize);
      tpDistance = (bid - tp) / pipSize;
      
      if(tpDistance / slDistance < MinRRRatio && structureTP > 0) {
         tp = bid - (slDistance * MinRRRatio * pipSize);
      }
      
      sl = NormalizeDouble(sl, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
      tp = NormalizeDouble(tp, (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS));
      lotSize = NormalizeDouble(lotSize, 2);
      
      if(trade.Sell(lotSize, _Symbol, bid, sl, tp, "BigDogsFX Sell")) {
         Print("SELL Order Placed | Lot: ", lotSize, " | SL: ", sl, " | TP: ", tp);
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
