/**
 * Tradease — Map
 *
 * ══════════════════════════════════════════════════════════════════════
 * HOOKS ORDER
 *
 * Every hook in this file sits above every early return. This is the bug
 * that crashed the app on real hardware: a useMemo below a `if (locating)
 * return` guard never ran on first render, then ran on the second, and
 * React aborted the render tree. If you add a hook here, add it to the
 * block at the top — not next to the code that uses it.
 * ══════════════════════════════════════════════════════════════════════
 *
 * PERFORMANCE
 *
 * Pins are drawn by SymbolLayer over a clustered ShapeSource, not by
 * MarkerView. Exactly one MarkerView exists, for the selected pin's
 * callout. This is the difference between a smooth map and a stuttering
 * one on a mid-range Android device.
 *
 * First paint does not wait for GPS. The last camera position is restored
 * from storage synchronously-ish and the map renders immediately; the
 * camera eases to the real fix when it arrives.
 *
 * PRIVACY
 *
 * Every coordinate rendered here is already public-safe. Jobs arrive
 * pre-fuzzed from the API and contractors arrive as service-area centers.
 * See lib/map/location-privacy.ts. Never render a raw address here.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import Mapbox, {
  Camera,
  CircleLayer,
  Image,
  Images,
  MapView,
  MarkerView,
  ShapeSource,
  SymbolLayer,
  UserLocation,
} from '@rnmapbox/maps';

import {
  TRADE_LIST,
  getTrade,
  type TradeId,
  type UrgencyId,
} from '../../lib/map/trades';
import {
  approximateDistanceLabel,
  type LatLng,
} from '../../lib/map/location-privacy';
import {
  buildPinImages,
  contractorPinId,
  jobPinId,
} from '../../components/map/MapPins';

/* ── config ──────────────────────────────────────────────────────── */

const MAP_STYLE = 'mapbox://styles/mapbox/dark-v11';
const CAMERA_CACHE_KEY = 'tradease:map:camera:v1';

/** Center of Long Island. Used only if there is no cached camera. */
const FALLBACK_CENTER: LatLng = { latitude: 40.8534, longitude: -73.2739 };

const RADIUS_OPTIONS = [10, 25, 50] as const;
type RadiusMiles = (typeof RADIUS_OPTIONS)[number];

const C = {
  bg: '#0E0E10',
  surface: '#17171A',
  surfaceHi: '#212126',
  border: '#2A2A31',
  text: '#F5F5F7',
  textDim: '#8E8E97',
  accent: '#FF7A1A',
  verified: '#4ADE80',
};

/* ── data shapes ─────────────────────────────────────────────────── */

export interface PublicJob {
  id: string;
  title: string;
  tradeId: TradeId;
  urgency: UrgencyId;
  /** Already fuzzed server-side. */
  latitude: number;
  longitude: number;
  areaLabel: string;
  budgetLabel: string | null;
  postedAtLabel: string;
  isPublic: boolean;
}

export interface PublicContractor {
  id: string;
  businessName: string;
  /** First name only until a job is claimed. */
  contactFirstName: string;
  tradeId: TradeId;
  verified: boolean;
  /** Service-area center or opted-in storefront. */
  latitude: number;
  longitude: number;
  locationMode: 'area' | 'exact';
  serviceRadiusMeters: number | null;
  areaLabel: string;
  yearsInBusiness: number | null;
  jobsCompleted: number;
  isPublic: boolean;
}

type Role = 'contractor' | 'customer';

/**
 * Wire these to your API. Both must return public-safe coordinates —
 * run assertNoExactLocation() on the server side of this boundary.
 */
async function fetchNearbyJobs(
  _center: LatLng,
  _radiusMiles: number
): Promise<PublicJob[]> {
  return [];
}

async function fetchNearbyContractors(
  _center: LatLng,
  _radiusMiles: number
): Promise<PublicContractor[]> {
  return [];
}

/* ── screen ──────────────────────────────────────────────────────── */

export default function MapScreen() {
  /* ─── ALL HOOKS. NOTHING BELOW THIS BLOCK MAY RETURN EARLY. ─── */
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<Camera>(null);
  const didCenterOnUser = useRef(false);

  const [role, setRole] = useState<Role>('contractor');
  const [radius, setRadius] = useState<RadiusMiles>(10);
  const [center, setCenter] = useState<LatLng>(FALLBACK_CENTER);
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [contractors, setContractors] = useState<PublicContractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationDenied, setLocationDenied] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTrades, setActiveTrades] = useState<Set<TradeId>>(new Set());

  const pinImages = useMemo(() => buildPinImages(), []);

  /** Restore the last camera so the map paints before GPS resolves. */
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(CAMERA_CACHE_KEY)
      .then((raw) => {
        if (!alive || !raw) {
          if (alive) setCameraReady(true);
          return;
        }
        const saved = JSON.parse(raw) as LatLng;
        if (
          typeof saved?.latitude === 'number' &&
          typeof saved?.longitude === 'number'
        ) {
          setCenter(saved);
        }
        setCameraReady(true);
      })
      .catch(() => {
        if (alive) setCameraReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  /** GPS runs in parallel with the first paint, never in front of it. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!alive) return;
        if (status !== 'granted') {
          setLocationDenied(true);
          return;
        }
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!alive) return;
        const next = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setUserLocation(next);
        setCenter(next);
        AsyncStorage.setItem(CAMERA_CACHE_KEY, JSON.stringify(next)).catch(
          () => {}
        );
        if (!didCenterOnUser.current) {
          didCenterOnUser.current = true;
          cameraRef.current?.setCamera({
            centerCoordinate: [next.longitude, next.latitude],
            zoomLevel: 11,
            animationDuration: 900,
          });
        }
      } catch {
        if (alive) setLocationDenied(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /** Data fetch is independent of the camera. */
  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      fetchNearbyJobs(center, radius),
      fetchNearbyContractors(center, radius),
    ])
      .then(([j, c]) => {
        if (!alive) return;
        setJobs(j);
        setContractors(c);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [center.latitude, center.longitude, radius]);

  const visibleJobs = useMemo(() => {
    const pool = jobs.filter((j) => j.isPublic);
    if (activeTrades.size === 0) return pool;
    return pool.filter((j) => activeTrades.has(j.tradeId));
  }, [jobs, activeTrades]);

  const visibleContractors = useMemo(() => {
    const pool = contractors.filter((c) => c.isPublic);
    if (activeTrades.size === 0) return pool;
    return pool.filter((c) => activeTrades.has(c.tradeId));
  }, [contractors, activeTrades]);

  /** One FeatureCollection, whichever role is active. */
  const featureCollection = useMemo(() => {
    const features =
      role === 'contractor'
        ? visibleJobs.map((j) => ({
            type: 'Feature' as const,
            id: j.id,
            geometry: {
              type: 'Point' as const,
              coordinates: [j.longitude, j.latitude],
            },
            properties: {
              kind: 'job',
              id: j.id,
              icon: jobPinId(j.tradeId, j.urgency),
              tradeId: j.tradeId,
            },
          }))
        : visibleContractors.map((c) => ({
            type: 'Feature' as const,
            id: c.id,
            geometry: {
              type: 'Point' as const,
              coordinates: [c.longitude, c.latitude],
            },
            properties: {
              kind: 'contractor',
              id: c.id,
              icon: contractorPinId(c.tradeId, c.verified),
              tradeId: c.tradeId,
            },
          }));

    return { type: 'FeatureCollection' as const, features };
  }, [role, visibleJobs, visibleContractors]);

  /** Service-area haze. Shows coverage density even with zero jobs. */
  const coverageCollection = useMemo(() => {
    if (role !== 'customer') {
      return { type: 'FeatureCollection' as const, features: [] };
    }
    return {
      type: 'FeatureCollection' as const,
      features: visibleContractors
        .filter((c) => c.locationMode === 'area')
        .map((c) => ({
          type: 'Feature' as const,
          id: `cov-${c.id}`,
          geometry: {
            type: 'Point' as const,
            coordinates: [c.longitude, c.latitude],
          },
          properties: { tradeId: c.tradeId },
        })),
    };
  }, [role, visibleContractors]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    const job = visibleJobs.find((j) => j.id === selectedId);
    if (job) return { kind: 'job' as const, job };
    const pro = visibleContractors.find((c) => c.id === selectedId);
    if (pro) return { kind: 'contractor' as const, pro };
    return null;
  }, [selectedId, visibleJobs, visibleContractors]);

  const onPinPress = useCallback((e: any) => {
    const feature = e?.features?.[0];
    if (!feature) return;
    if (feature.properties?.cluster) return;
    setSelectedId(feature.properties?.id ?? null);
  }, []);

  const toggleTrade = useCallback((id: TradeId) => {
    setActiveTrades((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const recenter = useCallback(() => {
    const target = userLocation ?? center;
    cameraRef.current?.setCamera({
      centerCoordinate: [target.longitude, target.latitude],
      zoomLevel: 11,
      animationDuration: 600,
    });
  }, [userLocation, center]);

  /* ─── END OF HOOKS. Early returns are safe from here down. ─── */

  const count =
    role === 'contractor' ? visibleJobs.length : visibleContractors.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Header
        role={role}
        onRoleChange={setRole}
        count={count}
        loading={loading}
        areaLabel={locationDenied ? 'Long Island' : 'Near you'}
      />

      <RadiusBar radius={radius} onChange={setRadius} />

      <TradeFilter active={activeTrades} onToggle={toggleTrade} />

      <View style={styles.mapWrap}>
        {cameraReady && (
          <MapView
            style={StyleSheet.absoluteFill}
            styleURL={MAP_STYLE}
            logoEnabled
            attributionEnabled
            scaleBarEnabled={false}
            compassEnabled={false}
            onPress={() => setSelectedId(null)}
          >
            <Camera
              ref={cameraRef}
              defaultSettings={{
                centerCoordinate: [center.longitude, center.latitude],
                zoomLevel: 11,
              }}
            />

            {/*
              Registers every pin variant as a map image once.

              If your @rnmapbox/maps version does not support React
              children here, swap the SymbolLayer below for the
              CircleLayer fallback at the bottom of this file.
            */}
            <Images>
              {Object.entries(pinImages).map(([id, element]) => (
                <Image key={id} name={id}>
                  {element}
                </Image>
              ))}
            </Images>

            {/* Coverage haze — drawn first so pins sit on top */}
            {role === 'customer' && (
              <ShapeSource id="coverage" shape={coverageCollection}>
                <CircleLayer
                  id="coverage-haze"
                  style={{
                    circleRadius: [
                      'interpolate',
                      ['linear'],
                      ['zoom'],
                      9,
                      28,
                      13,
                      90,
                    ],
                    circleColor: C.accent,
                    circleOpacity: 0.07,
                    circleBlur: 1,
                  }}
                />
              </ShapeSource>
            )}

            <ShapeSource
              id="pins"
              shape={featureCollection}
              cluster
              clusterRadius={55}
              clusterMaxZoomLevel={13}
              onPress={onPinPress}
            >
              <CircleLayer
                id="cluster-halo"
                filter={['has', 'point_count']}
                style={{
                  circleRadius: [
                    'step',
                    ['get', 'point_count'],
                    22,
                    10,
                    28,
                    50,
                    34,
                  ],
                  circleColor: C.accent,
                  circleOpacity: 0.22,
                }}
              />
              <CircleLayer
                id="cluster-core"
                filter={['has', 'point_count']}
                style={{
                  circleRadius: [
                    'step',
                    ['get', 'point_count'],
                    14,
                    10,
                    18,
                    50,
                    22,
                  ],
                  circleColor: C.accent,
                }}
              />
              <SymbolLayer
                id="cluster-count"
                filter={['has', 'point_count']}
                style={{
                  textField: ['get', 'point_count_abbreviated'],
                  textSize: 13,
                  textColor: C.bg,
                  textFont: ['DIN Offc Pro Bold', 'Arial Unicode MS Bold'],
                  textAllowOverlap: true,
                }}
              />
              <SymbolLayer
                id="pin-icons"
                filter={['!', ['has', 'point_count']]}
                style={{
                  iconImage: ['get', 'icon'],
                  iconSize: 1,
                  iconAnchor: 'bottom',
                  iconAllowOverlap: true,
                  iconIgnorePlacement: true,
                }}
              />
            </ShapeSource>

            <UserLocation visible androidRenderMode="normal" />

            {/* The ONE MarkerView. A real view is worth it for one callout. */}
            {selected && (
              <MarkerView
                id="selected-callout"
                coordinate={
                  selected.kind === 'job'
                    ? [selected.job.longitude, selected.job.latitude]
                    : [selected.pro.longitude, selected.pro.latitude]
                }
                anchor={{ x: 0.5, y: 1.35 }}
                allowOverlap
              >
                <CalloutCard selected={selected} origin={userLocation} />
              </MarkerView>
            )}
          </MapView>
        )}

        <Pressable
          onPress={recenter}
          style={[styles.recenter, { bottom: 92 }]}
          accessibilityLabel="Center map on my location"
        >
          <Text style={styles.recenterGlyph}>◎</Text>
        </Pressable>

        {!loading && count === 0 && (
          <EmptyState
            role={role}
            radius={radius}
            onWiden={() => {
              const next = RADIUS_OPTIONS.find((r) => r > radius);
              if (next) setRadius(next);
            }}
            canWiden={radius !== RADIUS_OPTIONS[RADIUS_OPTIONS.length - 1]}
          />
        )}
      </View>
    </View>
  );
}

/* ── header ──────────────────────────────────────────────────────── */

function Header({
  role,
  onRoleChange,
  count,
  loading,
  areaLabel,
}: {
  role: Role;
  onRoleChange: (r: Role) => void;
  count: number;
  loading: boolean;
  areaLabel: string;
}) {
  const noun = role === 'contractor' ? 'open job' : 'pro';
  const headline = loading
    ? 'Looking around…'
    : count === 0
      ? role === 'contractor'
        ? 'No open jobs yet'
        : 'No pros listed yet'
      : `${count} ${noun}${count === 1 ? '' : 's'} ${areaLabel.toLowerCase()}`;

  return (
    <View style={styles.header}>
      <Text style={styles.headline} numberOfLines={1}>
        {headline}
      </Text>

      <View style={styles.roleSwitch}>
        {(['contractor', 'customer'] as Role[]).map((r) => {
          const on = r === role;
          return (
            <Pressable
              key={r}
              onPress={() => onRoleChange(r)}
              style={[styles.roleBtn, on && styles.roleBtnOn]}
            >
              <Text style={[styles.roleTxt, on && styles.roleTxtOn]}>
                {r === 'contractor' ? 'Find work' : 'Find a pro'}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ── radius ──────────────────────────────────────────────────────── */

function RadiusBar({
  radius,
  onChange,
}: {
  radius: RadiusMiles;
  onChange: (r: RadiusMiles) => void;
}) {
  return (
    <View style={styles.radiusRow}>
      {RADIUS_OPTIONS.map((r) => {
        const on = r === radius;
        return (
          <Pressable
            key={r}
            onPress={() => onChange(r)}
            style={[styles.pill, on && styles.pillOn]}
          >
            <Text style={[styles.pillTxt, on && styles.pillTxtOn]}>
              {r} mi
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── trade filter ────────────────────────────────────────────────── */

function TradeFilter({
  active,
  onToggle,
}: {
  active: Set<TradeId>;
  onToggle: (id: TradeId) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tradeRow}
    >
      {TRADE_LIST.map((t) => {
        const on = active.has(t.id);
        return (
          <Pressable
            key={t.id}
            onPress={() => onToggle(t.id)}
            style={[
              styles.tradeChip,
              on && { backgroundColor: t.color, borderColor: t.color },
            ]}
          >
            <View
              style={[
                styles.tradeDot,
                { backgroundColor: on ? C.bg : t.color },
              ]}
            />
            <Text style={[styles.tradeTxt, on && { color: C.bg }]}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ── callout ─────────────────────────────────────────────────────── */

function CalloutCard({
  selected,
  origin,
}: {
  selected:
    | { kind: 'job'; job: PublicJob }
    | { kind: 'contractor'; pro: PublicContractor };
  origin: LatLng | null;
}) {
  if (selected.kind === 'job') {
    const j = selected.job;
    const trade = getTrade(j.tradeId);
    const dist = origin
      ? approximateDistanceLabel(origin, {
          latitude: j.latitude,
          longitude: j.longitude,
        })
      : null;

    return (
      <View style={[styles.callout, { borderLeftColor: trade.color }]}>
        <Text style={styles.calloutEyebrow}>{trade.label}</Text>
        <Text style={styles.calloutTitle} numberOfLines={2}>
          {j.title}
        </Text>
        <Text style={styles.calloutMeta}>
          {j.areaLabel}
          {dist ? ` · ${dist}` : ''}
        </Text>
        <Text style={styles.calloutFine}>
          Approximate location · exact address shared when you're hired
        </Text>
        {j.budgetLabel && (
          <Text style={styles.calloutBudget}>{j.budgetLabel}</Text>
        )}
      </View>
    );
  }

  const p = selected.pro;
  const trade = getTrade(p.tradeId);
  return (
    <View style={[styles.callout, { borderLeftColor: trade.color }]}>
      <View style={styles.calloutTopRow}>
        <Text style={styles.calloutEyebrow}>{trade.label}</Text>
        {p.verified && <Text style={styles.verifiedTag}>Verified</Text>}
      </View>
      <Text style={styles.calloutTitle} numberOfLines={2}>
        {p.businessName}
      </Text>
      <Text style={styles.calloutMeta}>
        {p.contactFirstName}
        {p.yearsInBusiness ? ` · ${p.yearsInBusiness} yrs on the Island` : ''}
      </Text>
      <Text style={styles.calloutFine}>{p.areaLabel}</Text>
    </View>
  );
}

/* ── empty state ─────────────────────────────────────────────────── */

function EmptyState({
  role,
  radius,
  onWiden,
  canWiden,
}: {
  role: Role;
  radius: RadiusMiles;
  onWiden: () => void;
  canWiden: boolean;
}) {
  const body =
    role === 'contractor'
      ? `Nothing posted within ${radius} miles right now. New jobs show up here the moment a customer posts one.`
      : `No pros are listed within ${radius} miles yet. Tradease is new on the Island — we're adding shops every week.`;

  return (
    <View style={styles.empty} pointerEvents="box-none">
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>
          {role === 'contractor' ? 'Quiet right now' : 'Still building coverage'}
        </Text>
        <Text style={styles.emptyBody}>{body}</Text>
        {canWiden && (
          <Pressable onPress={onWiden} style={styles.emptyBtn}>
            <Text style={styles.emptyBtnTxt}>Widen the search</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

/* ── styles ──────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headline: {
    color: C.text,
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.5,
  },

  roleSwitch: {
    flexDirection: 'row',
    marginTop: 14,
    backgroundColor: C.surface,
    borderRadius: 10,
    padding: 3,
    alignSelf: 'flex-start',
  },
  roleBtn: { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 8 },
  roleBtnOn: { backgroundColor: C.surfaceHi },
  roleTxt: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  roleTxtOn: { color: C.text },

  radiusRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20 },
  pill: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
  },
  pillOn: { borderColor: C.accent },
  pillTxt: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  pillTxtOn: { color: C.accent },

  tradeRow: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  tradeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  tradeDot: { width: 7, height: 7, borderRadius: 4 },
  tradeTxt: { color: C.textDim, fontSize: 12, fontWeight: '600' },

  mapWrap: { flex: 1, overflow: 'hidden' },

  recenter: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterGlyph: { color: C.text, fontSize: 20, lineHeight: 22 },

  callout: {
    backgroundColor: C.surface,
    borderRadius: 12,
    borderLeftWidth: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    width: 250,
    borderWidth: 1,
    borderColor: C.border,
  },
  calloutTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  calloutEyebrow: {
    color: C.textDim,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  verifiedTag: { color: C.verified, fontSize: 10, fontWeight: '700' },
  calloutTitle: {
    color: C.text,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 5,
    lineHeight: 20,
  },
  calloutMeta: { color: C.textDim, fontSize: 12, marginTop: 4 },
  calloutFine: { color: '#5E5E68', fontSize: 10, marginTop: 7, lineHeight: 14 },
  calloutBudget: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 8,
  },

  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyCard: {
    backgroundColor: C.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
    padding: 20,
    alignItems: 'center',
  },
  emptyTitle: { color: C.text, fontSize: 17, fontWeight: '700' },
  emptyBody: {
    color: C.textDim,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: 8,
  },
  emptyBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: C.accent,
  },
  emptyBtnTxt: { color: C.bg, fontSize: 13, fontWeight: '700' },
});

export { Mapbox };
