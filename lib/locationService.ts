import * as Location from 'expo-location';
import { supabase } from './supabase';

let watchSubscription: Location.LocationSubscription | null = null;

export interface Coords {
  lat: number;
  lng: number;
}

export interface MapBounds {
  centerLat: number;
  centerLng: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

// ── PERMISSIONS ───────────────────────────────────────────
export async function requestLocationPermission(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

export async function hasLocationPermission(): Promise<boolean> {
  const { status } = await Location.getForegroundPermissionsAsync();
  return status === 'granted';
}

// ── GET POSITION ──────────────────────────────────────────
export async function getCurrentPosition(): Promise<Coords | null> {
  try {
    const hasPermission = await hasLocationPermission();
    if (!hasPermission) {
      const granted = await requestLocationPermission();
      if (!granted) return null;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return { lat: loc.coords.latitude, lng: loc.coords.longitude };
  } catch (err) {
    console.log('getCurrentPosition error:', err);
    return null;
  }
}

export async function reverseGeocode(coords: Coords): Promise<{
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
} | null> {
  try {
    const [addr] = await Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    });
    if (!addr) return null;
    return {
      street: `${addr.streetNumber ?? ''} ${addr.street ?? ''}`.trim(),
      city: addr.city ?? undefined,
      state: addr.region ?? undefined,
      zip: addr.postalCode ?? undefined,
    };
  } catch {
    return null;
  }
}

// ── PRIVACY: FUZZ COORDINATES ─────────────────────────────
// Adds ~0.3 mile random offset so customers can't track exact movement.
export function fuzzCoords(coords: Coords, radiusMiles = 0.3): Coords {
  const r = radiusMiles / 69; // 1 deg ≈ 69 miles
  const angle = Math.random() * 2 * Math.PI;
  const distance = Math.random() * r;
  return {
    lat: coords.lat + distance * Math.cos(angle),
    lng: coords.lng + distance * Math.sin(angle) / Math.cos(coords.lat * Math.PI / 180),
  };
}

// ── SAVE LOCATION ─────────────────────────────────────────
export async function saveCustomerLocation(userId: string, coords: Coords) {
  await supabase
    .from('users')
    .update({
      lat: coords.lat,
      lng: coords.lng,
      last_location_update: new Date().toISOString(),
    })
    .eq('id', userId);
}

export async function saveContractorLocation(
  contractorId: string,
  coords: Coords,
  mode: 'live' | 'manual'
) {
  // For live mode, fuzz before saving so DB never holds exact coords
  const stored = mode === 'live' ? fuzzCoords(coords) : coords;

  await supabase
    .from('contractors')
    .update({
      lat: stored.lat,
      lng: stored.lng,
      location_mode: mode,
      last_location_update: new Date().toISOString(),
    })
    .eq('id', contractorId);

  // Upsert live location row (contractor_id is the PK)
  await supabase.from('contractor_locations').upsert({
    contractor_id: contractorId,
    lat: stored.lat,
    lng: stored.lng,
    is_online: true,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'contractor_id' });
}

// ── LIVE TRACKING ─────────────────────────────────────────
export async function startLiveTracking(
  contractorId: string,
  onUpdate?: (coords: Coords) => void
) {
  await stopLiveTracking();

  const hasPermission = await hasLocationPermission();
  if (!hasPermission) {
    const granted = await requestLocationPermission();
    if (!granted) throw new Error('Location permission denied');
  }

  watchSubscription = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60000, // 60 sec
      distanceInterval: 100, // 100 meters
    },
    async (loc) => {
      const coords = { lat: loc.coords.latitude, lng: loc.coords.longitude };
      await saveContractorLocation(contractorId, coords, 'live');
      onUpdate?.(coords);
    }
  );
}

export async function stopLiveTracking() {
  if (watchSubscription) {
    watchSubscription.remove();
    watchSubscription = null;
  }
}

export function isTracking(): boolean {
  return watchSubscription !== null;
}

// ── NEARBY QUERIES (uses Supabase RPCs) ───────────────────
export async function getNearbyContractors(
  center: Coords,
  options: {
    radiusMiles?: number;
    trade?: string | null;
    onlyAvailable?: boolean;
  } = {}
) {
  const { data, error } = await supabase.rpc('nearby_contractors', {
    customer_lat: center.lat,
    customer_lng: center.lng,
    max_distance_miles: options.radiusMiles ?? 50,
    filter_trade: options.trade ?? null,
    only_available: options.onlyAvailable ?? true,
  });
  if (error) {
    console.log('nearby_contractors error:', error);
    return [];
  }
  return data ?? [];
}

export async function getNearbyJobs(
  center: Coords,
  options: {
    radiusMiles?: number;
    trade?: string | null;
  } = {}
) {
  const { data, error } = await supabase.rpc('nearby_jobs', {
    contractor_lat: center.lat,
    contractor_lng: center.lng,
    max_distance_miles: options.radiusMiles ?? 50,
    filter_trade: options.trade ?? null,
  });
  if (error) {
    console.log('nearby_jobs error:', error);
    return [];
  }
  return data ?? [];
}

// ── HELPERS ───────────────────────────────────────────────
export function boundsFromCenter(center: Coords, radiusMiles = 10): MapBounds {
  const delta = radiusMiles / 35; // rough zoom level
  return {
    centerLat: center.lat,
    centerLng: center.lng,
    latitudeDelta: delta,
    longitudeDelta: delta,
  };
}

export function milesBetween(a: Coords, b: Coords): number {
  const R = 3959;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
}