/**
 * Interface-rules design tokens (tradease-interface-rules.html) — type
 * and spacing scale only. Colors are NOT duplicated here.
 *
 * All four semantic colors the rules spec calls for already exist as
 * ThemeContext (context/ThemeContext.tsx) keys, under different names:
 *
 *   spec "action" (orange)  -> Colors.orange    (#FF6200, via useTheme())
 *   spec "done"   (green)   -> Colors.success   (#22C55E)
 *   spec "waiting" (amber)  -> Colors.warning   (#F59E0B)
 *   spec "problem" (red)    -> Colors.error     (#EF4444)
 *
 * The spec's literal hex (#FF7A1A action orange, #4ADE80 green,
 * #FB923C amber) were deliberately NOT adopted:
 *  - #FF7A1A is byte-identical to TRADES.handyman.color in
 *    lib/map/trades.ts -- every primary button would read as a
 *    Handyman job by the map's own color logic.
 *  - #FB923C is already URGENCY.urgent's map ring color, same file.
 *  - #22C55E (existing success) already has 154 raw uses across the
 *    app vs. 1 for #4ADE80 -- adopting the spec's green would add a
 *    third shade of "done" on top of ones already everywhere.
 *
 * Screens get colors from useTheme() (ThemeContext), Type/Spacing from
 * here. Neutrals (background/surface/raised/border/text/dim/faint) also
 * already exist on ThemeContext as background/surface/surfaceAlt/
 * border/textPrimary/textSecondary/textMuted -- reuse those, don't
 * reintroduce the spec's near-identical near-black variants.
 */

/**
 * name: [fontSize, fontWeight, letterSpacing?]. letterSpacing is in the
 * unit React Native expects (point offset, not em) -- the spec's em
 * values are pre-converted here per its type-scale table.
 */
export const Type = {
  screenTitle: { fontSize: 28, fontWeight: '800' as const, letterSpacing: -0.84 },
  section: { fontSize: 20, fontWeight: '700' as const, letterSpacing: -0.4 },
  cardHeading: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 15, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  eyebrow: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.99 },
  money: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.96 },
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const TouchTarget = {
  min: 48,
} as const;
