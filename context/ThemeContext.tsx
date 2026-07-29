// context/ThemeContext.tsx
// ─── Drop this in a new `context/` folder at your project root ────────────────
//
// MIGRATION — change any screen from static to themed in ONE line:
//
//   BEFORE:  import { Colors } from '../../constants/theme';
//   AFTER:   const { colors: Colors } = useTheme();   ← alias keeps all code below unchanged
//
// Nothing else in the file needs to change.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

// ─── Color tokens ─────────────────────────────────────────────────────────────

const SHARED = {
  orange:    '#FF6200',
  orangeDim: 'rgba(255,98,0,0.15)',
  orangeGlow:'rgba(255,98,0,0.3)',
  nardo:     '#737373',
  nardoLight:'#9A9A9A',
  white:     '#FFFFFF',
  success:   '#22C55E',
  error:     '#EF4444',
  warning:   '#F59E0B',
};

export const DarkColors = {
  ...SHARED,
  background:  '#0D0D0D',
  surface:     '#1A1A1A',
  surfaceAlt:  '#222222',
  border:      '#2E2E2E',
  textPrimary: '#F0F0F0',
  textSecondary:'#9A9A9A',
  textMuted:   '#555555',
  // convenience
  cardBg:      '#1A1A1A',
  inputBg:     '#222222',
  tabBar:      '#0D0D0D',
  tabBarBorder:'#2E2E2E',
  statusBar:   'light' as const,
} as const;

export const LightColors = {
  ...SHARED,
  background:  '#F2F2F7',    // iOS system grouped background
  surface:     '#FFFFFF',
  surfaceAlt:  '#E8E8EE',
  border:      '#D0D0DC',
  textPrimary: '#0D0D0D',
  textSecondary:'#4A4A5A',
  textMuted:   '#8A8A9A',
  // convenience
  cardBg:      '#FFFFFF',
  inputBg:     '#F2F2F7',
  tabBar:      '#FFFFFF',
  tabBarBorder:'#D0D0DC',
  statusBar:   'dark' as const,
} as const;

export type AppColors = typeof DarkColors | typeof LightColors;

// ─── Context ──────────────────────────────────────────────────────────────────

type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeContextValue {
  colors:     AppColors;
  mode:       ThemeMode;
  isDark:     boolean;
  setMode:    (mode: ThemeMode) => void;
  toggleTheme:() => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors:      DarkColors,
  mode:        'dark',
  isDark:      true,
  setMode:     () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = '@tradease_theme';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();           // 'dark' | 'light' | null
  const [mode, setModeState] = useState<ThemeMode>('dark'); // default dark until loaded

  // Load saved preference on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((saved) => {
      if (saved === 'dark' || saved === 'light' || saved === 'system') {
        setModeState(saved);
      }
    });
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY, m);
  }, []);

  const toggleTheme = useCallback(() => {
    setMode(mode === 'dark' ? 'light' : 'dark');
  }, [mode, setMode]);

  // Resolve actual theme
  const resolvedDark =
    mode === 'system' ? (systemScheme === 'light' ? false : true) : mode === 'dark';

  const colors = (resolvedDark ? DarkColors : LightColors) as AppColors;

  return (
    <ThemeContext.Provider value={{ colors, mode, isDark: resolvedDark, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme() {
  return useContext(ThemeContext);
}