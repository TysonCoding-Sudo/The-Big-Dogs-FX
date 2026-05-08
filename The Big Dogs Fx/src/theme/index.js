import { StyleSheet } from 'react-native';

export const COLORS = {
  bg: '#0a0a0a',
  bgCard: '#141414',
  bgInput: '#1a1a1a',
  primary: '#FFD700',
  primaryDark: '#B8960C',
  success: '#00C853',
  danger: '#FF1744',
  text: '#FFFFFF',
  textSecondary: '#888888',
  textMuted: '#555555',
  border: '#2a2a2a',
  gradientStart: '#0a0a0a',
  gradientEnd: '#1a1a1a',
};

export const SIZES = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const FONTS = {
  heading: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subheading: {
    fontSize: 20,
    fontWeight: '700',
  },
  body: {
    fontSize: 16,
    fontWeight: '400',
  },
  small: {
    fontSize: 14,
    fontWeight: '400',
  },
  tiny: {
    fontSize: 12,
    fontWeight: '400',
  },
  brand: {
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 2,
  },
  slogan: {
    fontSize: 16,
    fontWeight: '600',
    fontStyle: 'italic',
    letterSpacing: 1,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 16,
    padding: SIZES.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    backgroundColor: COLORS.bgInput,
    borderRadius: 12,
    padding: SIZES.md,
    color: COLORS.text,
    fontSize: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: SIZES.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.primary,
    borderRadius: 12,
    padding: SIZES.md,
    alignItems: 'center',
  },
  buttonOutlineText: {
    color: COLORS.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});

export default styles;
