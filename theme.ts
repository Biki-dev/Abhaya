// Design System & Theme for Abhaya
// Logo-matched: Mint • Emerald • Deep Teal

export const colors = {
  // Core theme
  bg: '#F6FFFB',
  surface: '#FFFFFF',
  card: '#F1FBF7',

  // Text colors
  text: '#12332D',
  textSecondary: '#5F7D75',
  muted: '#93AAA3',

  // Brand colors
  primary: '#00A887',
  primaryDark: '#00796B',
  primaryLight: '#D9F8EC',

  // Status colors
  danger: '#EF4444',
  safe: '#10B981',
  warning: '#F59E0B',

  // UI elements
  active: '#00A887',
  inactive: '#D6E3DF',
  border: '#DCEBE5',

  // Logo gradient colors
  logoMint: '#7AF2B5',
  logoGreen: '#19C995',
  logoTeal: '#008F7A',
  logoDeep: '#005E55',

  // Overlay
  overlay: 'rgba(18, 51, 45, 0.72)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 40,
};

export const sizes = {
  buttonHeight: 52,
  sosButtonSize: 80,
  avatarSmall: 32,
  avatarMedium: 48,
  avatarLarge: 64,
};

export const typography = {
  title: {
    fontSize: 30,
    fontWeight: '700' as const,
    lineHeight: 36,
    fontFamily: 'Manrope_700Bold',
  },
  heading: {
    fontSize: 20,
    fontWeight: '700' as const,
    lineHeight: 26,
    fontFamily: 'Manrope_700Bold',
  },
  subheading: {
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
    fontFamily: 'Manrope_600SemiBold',
  },
  body: {
    fontSize: 14,
    fontWeight: '500' as const,
    lineHeight: 20,
    fontFamily: 'Manrope_500Medium',
  },
  bodySmall: {
    fontSize: 12,
    fontWeight: '500' as const,
    lineHeight: 16,
    fontFamily: 'Manrope_500Medium',
  },
  caption: {
    fontSize: 11,
    fontWeight: '500' as const,
    lineHeight: 14,
    fontFamily: 'Manrope_500Medium',
  },
};

export const borderRadius = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
};

export const shadows = {
  xs: {
    elevation: 1,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
  },
  sm: {
    elevation: 2,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  md: {
    elevation: 4,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  lg: {
    elevation: 8,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
};
