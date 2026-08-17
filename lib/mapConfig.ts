// lib/mapConfig.ts
// Single source of truth for Mapbox setup: per-platform public access token
// and the app's default camera (used only before a real job/contractor
// coordinate is known — never for geographic service-area validation).

import { Platform } from 'react-native';

// Each platform has its own public Mapbox token (separate dashboard entries,
// so usage/restrictions can be scoped and rotated independently per platform).
export const MAPBOX_ACCESS_TOKEN: string =
  Platform.select({
    ios: process.env.EXPO_PUBLIC_MAPBOX_IOS_TOKEN,
    android: process.env.EXPO_PUBLIC_MAPBOX_ANDROID_TOKEN,
    default: process.env.EXPO_PUBLIC_MAPBOX_WEB_TOKEN,
  }) ?? '';

// Shown before any job/contractor coordinate is available, instead of
// falling back to Mapbox's dashboard "Default map position". Centered on
// Nassau + Suffolk County, Long Island — adjust lat/lng/zoom here only.
export const DEFAULT_MAP_REGION = {
  centerCoordinate: [-73.2, 40.85] as [number, number], // [lng, lat]
  zoomLevel: 9,
};
