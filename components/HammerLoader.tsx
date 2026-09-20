// components/HammerLoader.tsx
//
// Tradease-branded loading indicator: hammer silhouette (dark charcoal fill)
// with a thin orange outline, plus an animated orange tracer that sweeps
// clockwise around the hammer's outer edge, with a soft layered-stroke glow.
// Not wired into any screen yet — this is the component only.
//
// ── Shape ────────────────────────────────────────────────────────────────
// Path is not hand-traced by eye — it's extracted directly from the pixel
// data in assets/hamer.png: threshold the PNG to isolate pure-black opaque
// pixels (the hammer) from the orange badge and transparent corners, trace
// the resulting mask's contours (skimage.measure.find_contours), simplify
// (skimage.measure.approximate_polygon), and rescale into a 24x24 viewBox.
// Verified by rasterizing the simplified path back and diffing it against
// the original mask (~2% of hammer-area pixels differ, consistent with the
// PNG's own edge anti-aliasing).
//
// The silhouette has two holes — the gap between the claw and the striking
// face, and the neck notch where the head meets the handle — which is why
// HAMMER_PATH concatenates three closed subpaths (one outer boundary + two
// holes) and is drawn with fillRule="evenodd" so the holes read as
// transparent gaps, matching the real artwork, instead of filling solid.
//
// ── Animation ────────────────────────────────────────────────────────────
// The moving tracer only travels the OUTER boundary (HAMMER_OUTER_PATH), not
// the two interior holes — chasing a dash through a multi-subpath `d` would
// have to jump between disconnected loops, which reads as a glitch, not a
// sweep. HAMMER_OUTER_POINTS is the single source of truth for that
// boundary: HAMMER_OUTER_PATH (what gets drawn) and HAMMER_OUTER_LENGTH
// (real geometric length in viewBox units, for stroke-dasharray/dashoffset
// math) are both derived from it.
//
// react-native-svg@15.12.1 does NOT implement the SVG2 `pathLength`
// normalization attribute on native (iOS/Android) — grepping its Android/iOS
// native source shows "pathLength" used only internally for text-on-path
// layout, never exposed as a <Path> prop, and it's entirely absent from the
// JS/TS source. react-native-web would honor it (real browser SVG), which
// would make dash math correct on web but wrong on iOS/Android if we mixed
// pathLength={100} with normalized 0-100 dash values (native ignores the
// attribute and reads dasharray/dashoffset as literal viewBox units, so a
// value like "22" would be nearly 3x longer than the whole outer path).
// So: no pathLength anywhere, and all dasharray/dashoffset values are real
// geometric units computed from HAMMER_OUTER_LENGTH — identical behavior on
// iOS, Android, and web.
//
// The animated dashoffset runs from 0 to -HAMMER_OUTER_LENGTH and repeats.
// Since the dash pattern's period equals HAMMER_OUTER_LENGTH, offset 0 and
// offset -HAMMER_OUTER_LENGTH render identically, so the loop has no visible
// seam. HAMMER_OUTER_POINTS is wound clockwise (verified via the shoelace
// formula in screen coordinates, y-down), and decreasing dashoffset moves
// the visible dash in the direction the path was authored — the same
// direction used by the standard "line draw-in" SVG technique (dashoffset:
// L -> 0 draws start-to-end; 0 -> -L is the same motion, phase-shifted by
// one period) — so the tracer sweeps clockwise.
//
// Glow is layered strokes (progressively wider + fainter under a thin bright
// core), never feGaussianBlur/SVG filters — react-native-svg's filter
// support is unreliable across iOS/Android/web.
//
// Reduced motion: checks AccessibilityInfo.isReduceMotionEnabled() and
// subscribes to 'reduceMotionChanged'. When motion is reduced (or not yet
// determined), the tracer/glow layers aren't mounted at all — no Reanimated
// loop is created — and only the static fill + thin outline renders, which
// is pixel-identical to the approved shape-gate output.

import { useTheme } from '@/context/ThemeContext';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Fixed (not theme-reactive) dark charcoal for the hammer body — darker than
// the app's "nardo" token on purpose, per explicit request, and picked to
// stay legible against the app's own dark-theme surfaces (background
// #0D0D0D, surface #1A1A1A, border #2E2E2E): a couple of steps lighter than
// all three so the body doesn't disappear into the screen behind it,
// especially in the reduced-motion fallback where there's no glow to help
// define the shape. Also reads as a clean dark charcoal on light theme.
const HAMMER_FILL = '#333333';

// 24x24 viewBox, matching this app's existing lucide-react-native icon
// convention. Fill body + static outline (all 3 subpaths, holes included).
export const HAMMER_PATH =
  'M4.277,23.027L2.89,22.954L2.05,22.626L1.539,22.26L0.973,21.621L0.644,20.964L0.462,20.124L0.498,19.285L0.717,18.518L1.192,17.751L9.334,9.608L10.101,8.805L10.211,8.476L10.649,7.892L10.795,6.76L10.503,5.592L9.481,4.058L7.874,2.598L7.691,2.196L7.764,1.612L8.075,1.228L8.44,1.082L11.544,0.973L13.515,1.228L15.414,1.922L16.838,2.908L19.851,5.701L19.997,5.993L20.07,7.491L20.435,8.367L21.439,9.371L22.096,9.7L23.082,9.992L23.502,10.558L23.538,10.996L23.429,11.361L18.883,15.98L18.554,16.126L17.897,15.98L17.185,15.231L16.966,13.954L16.674,13.406L16.363,13.095L15.889,12.876L15.268,12.949L5.957,22.26L5.081,22.808Z' +
  'M18.755,13.588L21.165,11.178L19.869,10.393L18.938,9.316L18.39,8.038L18.244,6.505L15.889,4.222L14.574,3.383L12.712,2.871L10.558,2.689L11.744,4.095L12.511,5.738L12.657,7.344L12.256,8.732L12.329,8.878L14.611,11.124L15.268,10.941L16.108,10.941L17.24,11.416L18.171,12.347Z' +
  'M3.894,21.183L4.679,20.873L13.205,12.347L11.251,10.357L2.652,19.065L2.397,19.613L2.397,20.088L2.543,20.49L3.072,21.019L3.583,21.202Z';

// Outer-boundary-only points — single source of truth for the tracer path.
// Same coordinates as HAMMER_PATH's first subpath. Confirmed clockwise via
// the shoelace formula (positive signed area, screen/y-down coordinates).
const HAMMER_OUTER_POINTS: [number, number][] = [
  [4.277, 23.027], [2.89, 22.954], [2.05, 22.626], [1.539, 22.26], [0.973, 21.621],
  [0.644, 20.964], [0.462, 20.124], [0.498, 19.285], [0.717, 18.518], [1.192, 17.751],
  [9.334, 9.608], [10.101, 8.805], [10.211, 8.476], [10.649, 7.892], [10.795, 6.76],
  [10.503, 5.592], [9.481, 4.058], [7.874, 2.598], [7.691, 2.196], [7.764, 1.612],
  [8.075, 1.228], [8.44, 1.082], [11.544, 0.973], [13.515, 1.228], [15.414, 1.922],
  [16.838, 2.908], [19.851, 5.701], [19.997, 5.993], [20.07, 7.491], [20.435, 8.367],
  [21.439, 9.371], [22.096, 9.7], [23.082, 9.992], [23.502, 10.558], [23.538, 10.996],
  [23.429, 11.361], [18.883, 15.98], [18.554, 16.126], [17.897, 15.98], [17.185, 15.231],
  [16.966, 13.954], [16.674, 13.406], [16.363, 13.095], [15.889, 12.876], [15.268, 12.949],
  [5.957, 22.26], [5.081, 22.808],
];

function pointsToClosedPath(points: [number, number][]): string {
  const [first, ...rest] = points;
  return `M${first[0]},${first[1]}` + rest.map(([x, y]) => `L${x},${y}`).join('') + 'Z';
}

function closedPolylineLength(points: [number, number][]): number {
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
}

const HAMMER_OUTER_PATH = pointsToClosedPath(HAMMER_OUTER_POINTS);
const HAMMER_OUTER_LENGTH = closedPolylineLength(HAMMER_OUTER_POINTS);

// Comet length as a fraction of the full outer perimeter.
const COMET_FRACTION = 0.22;
const COMET_LENGTH = HAMMER_OUTER_LENGTH * COMET_FRACTION;
const COMET_GAP = HAMMER_OUTER_LENGTH - COMET_LENGTH;
const DASH_ARRAY = [COMET_LENGTH, COMET_GAP];

const LOOP_DURATION_MS = 1600;

interface HammerLoaderProps {
  size?: number;
}

export function HammerLoader({ size = 48 }: HammerLoaderProps) {
  const { colors: C } = useTheme();
  // Orange stays theme-reactive (C.orange); the fill is intentionally fixed
  // — see HAMMER_FILL above.

  // null = not yet determined. Treated the same as "reduced" for rendering
  // purposes, so we never show motion before we've confirmed it's safe to.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);
  const isAnimated = reduceMotion === false;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (mounted) setReduceMotion(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => {
      setReduceMotion(value);
    });
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const progress = useSharedValue(0);

  useEffect(() => {
    if (isAnimated) {
      progress.value = withRepeat(
        withTiming(-HAMMER_OUTER_LENGTH, { duration: LOOP_DURATION_MS, easing: Easing.linear }),
        -1,
        false
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
  }, [isAnimated, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: progress.value,
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        {/* Base: fill + thin static outline. Pixel-identical to the approved
            shape-gate output — this is the whole render when motion is
            reduced. */}
        <Path
          d={HAMMER_PATH}
          fillRule="evenodd"
          fill={HAMMER_FILL}
          stroke={C.orange}
          strokeWidth={0.65}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {isAnimated && (
          <>
            {/* Glow — layered strokes, not feGaussianBlur. Wide + faint,
                then narrower + brighter, under the thin bright core. */}
            <AnimatedPath
              d={HAMMER_OUTER_PATH}
              fill="none"
              stroke={C.orange}
              strokeWidth={3.2}
              strokeOpacity={0.16}
              strokeLinecap="round"
              strokeDasharray={DASH_ARRAY}
              animatedProps={animatedProps}
            />
            <AnimatedPath
              d={HAMMER_OUTER_PATH}
              fill="none"
              stroke={C.orange}
              strokeWidth={1.8}
              strokeOpacity={0.35}
              strokeLinecap="round"
              strokeDasharray={DASH_ARRAY}
              animatedProps={animatedProps}
            />
            {/* Core tracer */}
            <AnimatedPath
              d={HAMMER_OUTER_PATH}
              fill="none"
              stroke={C.orange}
              strokeWidth={1}
              strokeLinecap="round"
              strokeDasharray={DASH_ARRAY}
              animatedProps={animatedProps}
            />
          </>
        )}
      </Svg>
    </View>
  );
}
