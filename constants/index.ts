
export const Colors = {
  background:       '#0A0A0F',
  surface:          '#13131A',
  surfaceAlt:       '#1C1C26',
  border:           '#2A2A38',
  borderLight:      '#3A3A4E',

  primary:          '#F5A623',
  primaryDark:      '#C47F0A',
  primaryLight:     '#FFD080',
  primaryMuted:     'rgba(245, 166, 35, 0.12)',

  success:          '#22C55E',
  successMuted:     'rgba(34, 197, 94, 0.12)',
  warning:          '#FBBF24',
  warningMuted:     'rgba(251, 191, 36, 0.12)',
  error:            '#EF4444',
  errorMuted:       'rgba(239, 68, 68, 0.12)',
  info:             '#38BDF8',
  infoMuted:        'rgba(56, 189, 248, 0.12)',

  textPrimary:      '#F0F0F5',
  textSecondary:    '#9090A8',
  textTertiary:     '#5A5A70',
  textInverse:      '#0A0A0F',

  customerAccent:   '#F5A623',
  contractorAccent: '#38BDF8',

  overlay:          'rgba(0,0,0,0.6)',
  transparent:      'transparent',
  white:            '#FFFFFF',
  black:            '#000000',
} as const;

export const Typography = {
  xs:   11,
  sm:   13,
  base: 15,
  md:   17,
  lg:   20,
  xl:   24,
  '2xl': 30,
  '3xl': 38,
  '4xl': 48,

  lineHeightTight:   1.15,
  lineHeightNormal:  1.5,
  lineHeightRelaxed: 1.75,

  trackingTight:   -0.5,
  trackingNormal:   0,
  trackingWide:     0.5,
  trackingWidest:   1.5,
} as const;

export const Spacing = {
  0:  0,
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  7:  28,
  8:  32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
} as const;

export const Radii = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   22,
  '2xl': 32,
  full: 9999,
} as const;

export const Shadows = {
  sm: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius:  3,
    elevation:     2,
  },
  md: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius:  8,
    elevation:     5,
  },
  lg: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius:  16,
    elevation:     10,
  },
  glow: {
    shadowColor:   '#F5A623',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius:  12,
    elevation:     8,
  },
} as const;

export const TRADE_TYPES = [
  'Plumbing',
  'Electrical',
  'HVAC',
  'Carpentry',
  'Roofing',
  'Painting',
  'Landscaping',
  'General Contracting',
  'Masonry',
  'Flooring',
  'Drywall',
  'Handyman',
] as const;