import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../src/context/AuthContext';
import { tradeAPI } from '../src/services/api';
import { COLORS, SIZES } from '../src/theme';
import BullBearBackground from '../src/components/BullBearBackground';
import { Ionicons } from '@expo/vector-icons';

export default function DashboardScreen() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [trades, setTrades] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, tradesRes] = await Promise.all([
        tradeAPI.getStats(),
        tradeAPI.getTrades(),
      ]);
      setStats(statsRes.data);
      setTrades(tradesRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <View style={styles.container}>
      <BullBearBackground />

      <LinearGradient
        colors={['rgba(10,10,10,0.9)', 'rgba(10,10,10,0.97)']}
        style={styles.overlay}
      >
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>THE BIG DOGS FX</Text>
            <Text style={styles.slogan}>We chase the cash</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <View style={styles.userBar}>
          <Ionicons name="person-circle" size={32} color={COLORS.primary} />
          <Text style={styles.welcome}>Welcome, {user?.username || 'Trader'}</Text>
        </View>

        <View style={styles.tabs}>
          {['overview', 'trades', 'settings'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />
          }
        >
          {activeTab === 'overview' && <OverviewTab stats={stats} />}
          {activeTab === 'trades' && <TradesTab trades={trades} />}
          {activeTab === 'settings' && <SettingsTab user={user} />}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}

function OverviewTab({ stats }) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.statsGrid}>
        <StatCard label="Win Rate" value={stats ? `${stats.winRate}%` : '--'} color={COLORS.success} />
        <StatCard label="Total P&L" value={stats ? `$${stats.totalPnl.toFixed(2)}` : '--'} color={stats?.totalPnl >= 0 ? COLORS.success : COLORS.danger} />
        <StatCard label="Open Trades" value={stats?.open ?? '--'} color={COLORS.primary} />
        <StatCard label="Total Trades" value={stats?.total ?? '--'} color={COLORS.text} />
      </View>

      <View style={styles.signalCard}>
        <Text style={styles.cardTitle}>Live Signals</Text>
        <View style={styles.signalItem}>
          <View style={styles.signalDot} />
          <Text style={styles.signalText}>Scanning for setups...</Text>
        </View>
      </View>

      <View style={styles.infoCard}>
        <Ionicons name="information-circle" size={24} color={COLORS.primary} />
        <Text style={styles.infoText}>
          EA is monitoring H1 charts for supply/demand zones with FVG confluence
        </Text>
      </View>
    </View>
  );
}

function TradesTab({ trades }) {
  return (
    <View style={styles.tabContent}>
      {trades.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="trending-up" size={64} color={COLORS.textMuted} />
          <Text style={styles.emptyText}>No trades yet</Text>
          <Text style={styles.emptySubtext}>Trades will appear here when the EA executes</Text>
        </View>
      ) : (
        trades.map((trade) => (
          <View key={trade.ticket} style={styles.tradeCard}>
            <View style={styles.tradeHeader}>
              <Text style={styles.tradeSymbol}>{trade.symbol}</Text>
              <View style={[styles.badge, trade.type === 'BUY' ? styles.badgeBuy : styles.badgeSell]}>
                <Text style={styles.badgeText}>{trade.type}</Text>
              </View>
            </View>
            <View style={styles.tradeDetails}>
              <Text style={styles.tradeDetail}>Lot: {trade.lotSize}</Text>
              <Text style={styles.tradeDetail}>Entry: {trade.openPrice}</Text>
              <Text style={styles.tradeDetail}>P&L: ${trade.pnl?.toFixed(2) ?? '--'}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

function SettingsTab({ user }) {
  return (
    <View style={styles.tabContent}>
      <View style={styles.settingsCard}>
        <Text style={styles.cardTitle}>Risk Settings</Text>
        <SettingItem label="Risk per Trade" value={`${user?.riskSettings?.riskPercent ?? 2}%`} />
        <SettingItem label="Max Open Trades" value={user?.riskSettings?.maxTrades ?? 3} />
        <SettingItem label="Max Spread" value={user?.riskSettings?.maxSpread ?? 300} />
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.cardTitle}>MT5 Connection</Text>
        <SettingItem label="Account" value={user?.mt5Account?.login ?? 'Not connected'} />
        <SettingItem label="Server" value={user?.mt5Account?.server ?? '--'} />
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.cardTitle}>Account</Text>
        <SettingItem label="Username" value={user?.username} />
        <SettingItem label="Email" value={user?.email} />
      </View>
    </View>
  );
}

function StatCard({ label, value, color }) {
  return (
    <View style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function SettingItem({ label, value }) {
  return (
    <View style={styles.settingItem}>
      <Text style={styles.settingLabel}>{label}</Text>
      <Text style={styles.settingValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: SIZES.md,
    paddingTop: SIZES.lg,
  },
  brand: {
    fontSize: 24,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  slogan: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  logoutBtn: {
    padding: SIZES.sm,
  },
  userBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
    paddingHorizontal: SIZES.md,
    marginBottom: SIZES.md,
  },
  welcome: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: SIZES.md,
    marginBottom: SIZES.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    paddingVertical: SIZES.sm,
    marginRight: SIZES.lg,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    color: COLORS.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  tabTextActive: {
    color: COLORS.primary,
  },
  content: {
    flex: 1,
    padding: SIZES.md,
  },
  tabContent: {
    gap: SIZES.md,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SIZES.sm,
  },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
  },
  statLabel: {
    color: COLORS.textSecondary,
    fontSize: 12,
    marginTop: SIZES.xs,
  },
  signalCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: SIZES.sm,
  },
  signalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.sm,
  },
  signalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.success,
  },
  signalText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SIZES.md,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 12,
    padding: SIZES.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
  },
  infoText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    flex: 1,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: SIZES.xxl,
  },
  emptyText: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '600',
    marginTop: SIZES.md,
  },
  emptySubtext: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginTop: SIZES.sm,
  },
  tradeCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: SIZES.sm,
  },
  tradeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SIZES.sm,
  },
  tradeSymbol: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  badge: {
    paddingHorizontal: SIZES.sm,
    paddingVertical: SIZES.xs,
    borderRadius: 6,
  },
  badgeBuy: {
    backgroundColor: 'rgba(0, 200, 83, 0.2)',
  },
  badgeSell: {
    backgroundColor: 'rgba(255, 23, 68, 0.2)',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
  },
  tradeDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tradeDetail: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  settingsCard: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 12,
    padding: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SIZES.sm,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingLabel: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  settingValue: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
});
