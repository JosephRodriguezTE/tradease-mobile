/**
 * Map pin artwork for Tradease.
 *
 * These are NOT rendered as <MarkerView>. Each one is registered once
 * with the map as an image via <Images>, then drawn by a SymbolLayer.
 * The difference matters: a MarkerView is a real Android View that gets
 * laid out and composited on every camera frame. Thirty of them will
 * visibly stutter on a mid-range phone. A SymbolLayer draws thousands
 * of icons on the GPU as a single layer.
 *
 * Requires react-native-svg:
 *   npx expo install react-native-svg
 */

import React from 'react';
import Svg, { Circle, Path, G, Rect } from 'react-native-svg';
import { TRADE_LIST, URGENCY, type Trade, type UrgencyId } from '../../lib/map/trades';

const PIN_W = 46;
const PIN_H = 58;

/* ------------------------------------------------------------------ */
/* Job pin — a house, because a job is a place that needs something    */
/* ------------------------------------------------------------------ */

export function JobPin({
  trade,
  urgency = 'standard',
}: {
  trade: Trade;
  urgency?: UrgencyId;
}) {
  const ring = URGENCY[urgency].ring;
  const hasRing = ring !== 'transparent';

  return (
    <Svg width={PIN_W} height={PIN_H} viewBox="0 0 46 58">
      {/* drop shadow — a soft dark ellipse on the ground plane */}
      <Circle cx="23" cy="52" r="6" fill="#000000" opacity={0.35} />

      {/* urgency ring sits outside the body so both colors read at once */}
      {hasRing && (
        <Path
          d="M23 2C12.5 2 4 10.3 4 20.6c0 12.4 15.4 26.1 17.6 28a2.2 2.2 0 0 0 2.8 0C26.6 46.7 42 33 42 20.6 42 10.3 33.5 2 23 2z"
          fill="none"
          stroke={ring}
          strokeWidth={3.5}
        />
      )}

      {/* pin body */}
      <Path
        d="M23 4C13.6 4 6 11.4 6 20.6c0 11.2 14.1 24.1 16.1 25.9a1.3 1.3 0 0 0 1.8 0C25.9 44.7 40 31.8 40 20.6 40 11.4 32.4 4 23 4z"
        fill={trade.color}
        stroke={trade.colorDark}
        strokeWidth={1.5}
      />

      {/* house glyph, knocked out in near-black for contrast on any hue */}
      <G transform="translate(12.5, 10.5) scale(0.88)">
        <Path
          d="M12 2.4 2.6 10.2v.9h2v10.4h5.1v-5.8h4.6v5.8h5.1V11.1h2v-.9L12 2.4z"
          fill="#0E0E10"
          opacity={0.88}
        />
      </G>
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Contractor pin — a hardhat                                          */
/* ------------------------------------------------------------------ */

export function ContractorPin({
  trade,
  verified = false,
}: {
  trade: Trade;
  verified?: boolean;
}) {
  return (
    <Svg width={PIN_W} height={PIN_H} viewBox="0 0 46 58">
      <Circle cx="23" cy="52" r="6" fill="#000000" opacity={0.35} />

      {/* rounded-square body — visually distinct from the teardrop job pin
          even at a glance, even for someone who can't separate the hues */}
      <Rect
        x="5"
        y="4"
        width="36"
        height="36"
        rx="11"
        fill={trade.color}
        stroke={trade.colorDark}
        strokeWidth={1.5}
      />
      {/* stem down to the ground point */}
      <Path d="M18 38h10l-5 9z" fill={trade.colorDark} />

      {/* hardhat: dome, center rib, brim */}
      <G transform="translate(11, 12)">
        <Path
          d="M3.2 12.4a8.8 8.8 0 0 1 17.6 0z"
          fill="#0E0E10"
          opacity={0.88}
        />
        <Path
          d="M12 3.6v8.8"
          stroke={trade.color}
          strokeWidth={1.6}
          strokeLinecap="round"
        />
        <Rect
          x="0.4"
          y="12.4"
          width="23.2"
          height="3.6"
          rx="1.8"
          fill="#0E0E10"
          opacity={0.88}
        />
      </G>

      {/* verification dot — earned, so it gets its own color, not the trade's */}
      {verified && (
        <>
          <Circle cx="37" cy="9" r="7" fill="#0E0E10" />
          <Circle cx="37" cy="9" r="5.4" fill="#4ADE80" />
          <Path
            d="M34.6 9.1l1.7 1.7 3.2-3.4"
            stroke="#0E0E10"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </>
      )}
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Cluster bubble                                                      */
/* ------------------------------------------------------------------ */

export function ClusterPin({ count }: { count: number }) {
  const size = count < 10 ? 40 : count < 50 ? 48 : 56;
  return (
    <Svg width={size} height={size} viewBox="0 0 56 56">
      <Circle cx="28" cy="28" r="26" fill="#FF7A1A" opacity={0.18} />
      <Circle cx="28" cy="28" r="19" fill="#FF7A1A" opacity={0.32} />
      <Circle cx="28" cy="28" r="14" fill="#FF7A1A" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Image registry                                                      */
/* ------------------------------------------------------------------ */

/**
 * Stable id for a pin variant. The SymbolLayer's iconImage expression
 * builds this same string from feature properties, so the two must
 * agree exactly — keep them in one place.
 */
export function jobPinId(tradeId: string, urgency: UrgencyId): string {
  return `job-${tradeId}-${urgency}`;
}

export function contractorPinId(tradeId: string, verified: boolean): string {
  return `pro-${tradeId}-${verified ? 'v' : 'u'}`;
}

/**
 * Every pin variant, ready to hand to <Images>.
 *
 * This is 9 trades x 3 urgencies + 9 trades x 2 verification states = 45
 * images. They rasterize once at map load and cost nothing afterward.
 * Don't generate these per-render.
 */
export function buildPinImages(): Record<string, React.ReactElement> {
  const images: Record<string, React.ReactElement> = {};

  for (const trade of TRADE_LIST) {
    for (const urgency of Object.keys(URGENCY) as UrgencyId[]) {
      images[jobPinId(trade.id, urgency)] = (
        <JobPin trade={trade} urgency={urgency} />
      );
    }
    images[contractorPinId(trade.id, true)] = (
      <ContractorPin trade={trade} verified />
    );
    images[contractorPinId(trade.id, false)] = (
      <ContractorPin trade={trade} verified={false} />
    );
  }

  return images;
}

export const PIN_SIZE = { width: PIN_W, height: PIN_H };
