import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { FontFamily } from '../constants/theme';

const HAMMER_IMG      = require('../assets/hamer.png');
const TRADEASE_WORDMARK = require('../assets/tradeaselogo.png');

interface Props {
  iconSize?:      number;
  fontSize?:      number;
  layout?:        'row' | 'column';
  gap?:           number;
  showCopyright?: boolean;
}

export function TradeaseLogo({
  iconSize      = 32,
  fontSize      = 20,
  layout        = 'row',
  gap           = -10,
  showCopyright = false,
}: Props) {
  const radius    = Math.round(iconSize * 0.24);
  const wordmarkH = Math.round(fontSize * 1.1);
  // Cap width at 200 px — prevents overflow on narrow screens when layout is
  // 'column' and the wrap View has no parent-defined width constraint.
  const wordmarkW = Math.min(Math.round(wordmarkH * 7), 200);

  return (
    <View style={[s.wrap, layout === 'column' ? s.col : s.row]}>

      {/* Icon — hamer.png is a complete badge (orange bg + hammer baked in) */}
      <View style={[s.iconShadow, { width: iconSize, height: iconSize, borderRadius: radius }]}>
        <Image
          source={HAMMER_IMG}
          style={{ width: iconSize, height: iconSize }}
          resizeMode="contain"
        />
      </View>

      {/* Wordmark — gap applied as margin so negative values work */}
      <Image
        source={TRADEASE_WORDMARK}
        style={[
          { height: wordmarkH, width: wordmarkW },
          layout === 'row' ? { marginLeft: gap } : { marginTop: gap },
        ]}
        resizeMode="contain"
      />

      {/* © line — shown only on large column layouts */}
      {showCopyright && layout === 'column' && (
        <Text style={s.copyright} allowFontScaling={false}>
          © 2025 Tradease, Inc.
        </Text>
      )}

    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center' },
  row:  { flexDirection: 'row' },
  col:  { flexDirection: 'column' },

  iconShadow: {
    shadowColor:  '#FF6200',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius:  6,
    elevation:     4,
  },

  copyright: {
    fontSize:      10,
    fontFamily:    FontFamily.medium,
    fontWeight:    '500',
    color:         'rgba(240,240,240,0.22)',
    letterSpacing: 0.6,
    marginTop:     -1,
  },
});
