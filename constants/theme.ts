// constants/theme.ts
// ─── COMPLETE file — all tokens, nothing removed ──────────────────────────────
// Screens that haven't migrated to useTheme() still import from here directly.
// DO NOT remove any export — other screens depend on all of them.

export const Colors = {
  // Core backgrounds
  background:   '#0D0D0D',
  surface:      '#1A1A1A',
  surfaceAlt:   '#222222',
  border:       '#2E2E2E',

  // Orange — Tradease brand
  orange:       '#FF6200',
  orangeDim:    'rgba(255,98,0,0.15)',
  orangeGlow:   'rgba(255,98,0,0.3)',

  // Nardo grey
  nardo:        '#737373',
  nardoLight:   '#9A9A9A',

  // Text
  white:        '#FFFFFF',
  textPrimary:  '#F0F0F0',
  textSecondary:'#9A9A9A',
  textMuted:    '#555555',

  // Status
  success:      '#22C55E',
  error:        '#EF4444',
  warning:      '#F59E0B',
} as const;

// Font weight shorthands — used as fontWeight values in StyleSheet
export const Font = {
  black:   '800' as const,
  bold:    '700' as const,
  semibold:'600' as const,
  medium:  '500' as const,
  regular: '400' as const,
};

// Font family map — loaded in _layout.tsx via expo-google-fonts
export const FontFamily = {
  regular:   'Inter_400Regular',
  medium:    'Inter_500Medium',
  semibold:  'Inter_600SemiBold',
  bold:      'Inter_700Bold',
  extraBold: 'Inter_800ExtraBold',
  black:     'Inter_900Black',
};

// Border radii
export const Radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  full: 999,
};

// Shadows — used by splash.tsx and other screens
export const Shadows = {
  sm: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius:  4,
    elevation:     3,
  },
  md: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius:  8,
    elevation:     6,
  },
  lg: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius:  16,
    elevation:     10,
  },
  // Orange glow — used by splash.tsx CTA buttons
  glow: {
    shadowColor:   '#FF6200',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius:  24,
    elevation:     12,
  },
} as const;

// Design-skill elevation system
export const shadows = {
  card: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius:  8,
    elevation:     4,
  },
  modal: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius:  16,
    elevation:     12,
  },
  orangeGlow: {
    shadowColor:   '#FF6200',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.2,
    shadowRadius:  12,
    elevation:     6,
  },
  button: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius:  4,
    elevation:     3,
  },
} as const;

export const animation = {
  fast:   150,
  base:   220,
  smooth: 300,
  slow:   400,
} as const;

export const touchTarget = {
  min:         44,
  comfortable: 52,
} as const;