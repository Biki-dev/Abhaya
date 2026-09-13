// Design System & Theme for Abhaya - Professional Minimalist
export const colors = {
  // Core theme
  bg: '#FAFBFC',
  surface: '#FFFFFF',
  card: '#F8FAFB',
  
  // Text colors
  text: '#1A202C',
  textSecondary: '#718096',
  muted: '#A0AEC0',
  
  // Accent colors
  primary: '#3B82F6',
  danger: '#EF4444',
  safe: '#10B981',
  warning: '#F59E0B',
  
  // UI elements
  active: '#10B981',
  inactive: '#D1D5DB',
  border: '#E5E7EB',
  
  // Overlay
  overlay: 'rgba(26, 32, 44, 0.75)',
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
