/**
 * Full tokenization for the contractor onboarding funnel: signup.tsx,
 * profile/get-verified.tsx, VerificationGate.tsx, profile/
 * verification-status.tsx, (tabs)/contractor-home.tsx, (tabs)/profile.tsx.
 *
 * Unlike lib/design/tokens.ts (built for screens that already render
 * through useTheme()/ThemeContext), these screens render a fixed dark
 * aesthetic regardless of system theme -- most of their styling lives in
 * module-level StyleSheet.create() objects that can't call the useTheme()
 * hook at all. So colors here are plain constants, not theme-reactive,
 * and that's intentional: this funnel's dark hero styling isn't meant to
 * flip with system light/dark mode.
 *
 * Every value below is copied byte-for-byte from what the file already
 * rendered -- this is a rename, not a redesign. The one exception:
 * OnboardingColors.borderSubtle collapses two values that were both
 * '#1E1E1E' and '#1F1F1F' (a 1-in-255 channel difference, on a
 * non-adjacent, non-comparable pair of borders) into one -- visually
 * imperceptible, called out explicitly rather than silently.
 *
 * Where a value is byte-identical to an existing ThemeContext DarkColors
 * entry, it's re-exported from there instead of redefined, so this file
 * doesn't grow a second definition of the same brand orange or the same
 * success green.
 */

import { DarkColors } from '@/context/ThemeContext';
import { FontFamily } from '@/constants/theme';

export const OnboardingColors = {
  // Re-exported from ThemeContext.DarkColors -- identical values, not new
  white:       DarkColors.white,
  success:     DarkColors.success,
  error:       DarkColors.error,
  warning:     DarkColors.warning,
  textPrimary: DarkColors.textPrimary,
  textMuted:   DarkColors.textMuted,
  textSecondary: DarkColors.textSecondary,
  surface:     DarkColors.surface,
  surfaceAlt:  DarkColors.surfaceAlt,
  orange:      DarkColors.orange,

  // Unique to this funnel's fixed-dark styling
  bg:              '#0A0A0A',
  inputBg:         '#0F0F0F',
  disabledBg:      '#141414',
  pickerCellBg:    '#161616',
  borderSubtle:    '#1E1E1E',
  chipBorder:      '#252525',
  disabledBorder:  '#2A2A2A',
  checkboxBorder:  '#333333',
  placeholder:     '#3F3F3F',
  disabledText:    '#444444',
  captionText:     '#666666',
  labelText:       '#777777',
  iconMuted:       '#888888',
  googleTextDark:  '#16A34A',
  gradientStart:   '#FF7A1F',
  info:            '#60A5FA',
  black:           '#000000',
} as const;

/**
 * fontSize + fontFamily pairs, named by where they're used. This funnel
 * loads distinct Inter weight files via `fontFamily` (see constants/
 * theme.ts FontFamily) rather than the numeric `fontWeight` the rest of
 * the app's Type scale (lib/design/tokens.ts) uses -- a different
 * mechanism, so these aren't merged into that scale even where a size
 * happens to coincide (e.g. this funnel's heroTitle is also 28px, but
 * via FontFamily.black, not fontWeight:'800').
 */
export const OnboardingType = {
  heroTitle:      { fontSize: 28, fontFamily: FontFamily.black },
  heroSub:        { fontSize: 14, fontFamily: FontFamily.medium },
  sectionLabel:   { fontSize: 11, fontFamily: FontFamily.extraBold },
  fieldLabel:     { fontSize: 11, fontFamily: FontFamily.bold },
  fieldInput:     { fontSize: 15, fontFamily: FontFamily.medium },
  fieldHint:      { fontSize: 11, fontFamily: FontFamily.medium },
  bannerTitle:    { fontSize: 13, fontFamily: FontFamily.bold },
  bannerSub:      { fontSize: 12, fontFamily: FontFamily.medium },
  roleLabel:      { fontSize: 13, fontFamily: FontFamily.bold },
  roleSub:        { fontSize: 10, fontFamily: FontFamily.medium },
  chipIcon:       { fontSize: 14 },
  chipText:       { fontSize: 12, fontFamily: FontFamily.bold },
  bodyText:       { fontSize: 12, fontFamily: FontFamily.medium },
  checkmarkText:  { fontSize: 12, fontFamily: FontFamily.black },
  iconMd:         { fontSize: 16 },
  ctaText:        { fontSize: 16, fontFamily: FontFamily.black },
  ctaIcon:        { fontSize: 18 },
  linkText:       { fontSize: 13, fontFamily: FontFamily.medium },
  captionText:    { fontSize: 11, fontFamily: FontFamily.medium },
  disabledCta:    { fontSize: 14, fontFamily: FontFamily.bold },
  pickerArrow:    { fontSize: 20, fontFamily: FontFamily.bold },
  pickerYear:     { fontSize: 16, fontFamily: FontFamily.black },
  pickerMonth:    { fontSize: 13, fontFamily: FontFamily.semibold },
  toggleLabel:    { fontSize: 14, fontFamily: FontFamily.semibold },
  toggleSub:      { fontSize: 11, fontFamily: FontFamily.medium },
} as const;

/** Every distinct raw padding/margin value from the funnel, named by role. */
export const OnboardingSpacing = {
  none: 0,
  xxxs: 2,
  xxxsPlus: 3,
  xxs: 4,
  xs: 6,
  sm: 8,
  smMd: 9,
  md: 10,
  mdLg: 12,
  lg: 14,
  lgXl: 16,
  xl: 20,
  xl2: 24,
  xxl: 40,
  /** get-verified.tsx's footer safe-bottom padding -- a one-off, not part
   * of the scale's progression, but still a real value that needs a name
   * rather than a magic number in the file. */
  footerPad: 34,
} as const;

/**
 * fontSize-only scale (no paired weight/family) for funnel screens that
 * set fontWeight as a plain string literal directly (VerificationGate,
 * verification-status) rather than through FontFamily (signup) or a
 * Font.* alias with a local TY scale (get-verified). Font weight itself
 * isn't tokenized here -- out of scope (raw hex/fontSize/padding only).
 */
export const FontSize = {
  xxs: 10,
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 15,
  xl: 16,
  xl2: 17,
  xl3: 18,
  xl4: 20,
  xxl: 22,
} as const;
