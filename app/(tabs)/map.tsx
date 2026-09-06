// app/(tabs)/map.tsx
// GPS-powered proximity search. Customers (and guests) see nearby contractors
// on a real Mapbox map; contractors see open jobs near them. Uber-style
// presentation: map fills the screen, a single floating radius pill sits top
// right, and a draggable bottom sheet holds the trade filter + results.
//
// HOOKS ORDER: every hook in this file sits above every early return. A
// hook below an early-return guard runs on some renders and not others,
// which crashes React's render tree — this is the bug that crashed this
// screen on real hardware before. If you add a hook, add it to the block
// at the top, not next to the code that uses it.

import { useTheme, AppColors } from '@/context/ThemeContext';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/lib/supabase';
import { getCurrentPosition, reverseGeocode, Coords } from '@/lib/locationService';
import { MAPBOX_ACCESS_TOKEN, DEFAULT_MAP_REGION } from '@/lib/mapConfig';
import { FILTERABLE_TRADES, fromDbValue, getTrade, Trade } from '@/lib/map/trades';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetFlatList, BottomSheetView } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import MapboxGL from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

// ─── Types ────────────────────────────────────────────────────────────────────

interface NearbyContractor {
  id: string;
  company_name: string;
  trade_type: string | null;
  location: string | null;
  rating: number | null;
  review_count: number | null;
  is_available: boolean | null;
  avatar_url: string | null;
  verification_status: string;
  distance_miles: number;
  specializations: string[] | null;
  lat: number;
  lng: number;
}

interface NearbyJob {
  id: string;
  trade: string;
  urgency: string;
  status: string;
  price_estimate: number | null;
  created_at: string;
  request_expires_at: string | null;
  // Server-fuzzed via public_jobs_nearby() — never the true coordinate.
  // See lib/map/location-privacy.ts.
  fuzzed_lat: number | null;
  fuzzed_lng: number | null;
  town: string | null;
  nearest_major_road: string | null;
}

const RADII = [10, 25, 50] as const;
type Radius = (typeof RADII)[number];

type SortMode = 'distance' | 'price' | 'rating';

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.background },
    map:       { ...StyleSheet.absoluteFillObject },

    // Floating radius pill (top right, over the map)
    radiusPill: {
      position: 'absolute', overflow: 'hidden', borderRadius: 999,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
    },
    radiusPillInner: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 16, paddingVertical: 10,
      backgroundColor: 'rgba(10,10,10,0.55)',
    },
    radiusPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    // Radius picker sheet (small modal popover)
    pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    pickerCard: {
      position: 'absolute', borderRadius: 16, overflow: 'hidden',
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      minWidth: 140,
    },
    pickerRow: { paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    pickerRowText: { fontSize: 15, fontWeight: '600', color: C.textPrimary },

    // Bottom sheet
    sheetBackground: { backgroundColor: C.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    sheetHandle:     { backgroundColor: C.textMuted, width: 36 },
    sheetPeek: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 20, paddingTop: 2, paddingBottom: 14,
    },
    sheetPeekText: { fontSize: 15, fontWeight: '800', color: C.textPrimary },
    sheetPeekIcon: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

    // Trade chips — fixed height row, never allowed to grow
    tradeRow:  { height: 36, flexGrow: 0, flexShrink: 0 },
    tradeRowContent: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
    tradeChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      height: 32, paddingHorizontal: 12,
      borderRadius: 999, borderWidth: 1,
      flexShrink: 0,
    },
    tradeChipDot:  { width: 8, height: 8, borderRadius: 4 },
    tradeChipText: { fontSize: 12.5, fontWeight: '700' },

    // Sort row (full snap point only)
    sortRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingBottom: 10, paddingTop: 4 },
    sortLabel: { fontSize: 12, color: C.textSecondary, marginRight: 2 },
    sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1 },
    sortChipText: { fontSize: 11.5, fontWeight: '700' },

    // List
    list:    { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 40 },
    card:    {
      backgroundColor: C.surfaceAlt, borderRadius: 16, borderWidth: 1,
      borderColor: C.border, padding: 16, marginBottom: 12,
    },
    cardSelected: { borderWidth: 1.5 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },

    avatar: {
      width: 48, height: 48, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },

    cardInfo:       { flex: 1 },
    cardName:       { fontSize: 15, fontWeight: '800', color: C.textPrimary, marginBottom: 2 },
    cardTrade:      { fontSize: 13, fontWeight: '700' },
    cardLocation:   { fontSize: 12, color: C.textSecondary, marginTop: 1 },

    cardBadges: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    distBadge:  {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: 'rgba(34,197,94,0.10)',
      borderRadius: 999, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)',
      paddingHorizontal: 8, paddingVertical: 3,
    },
    distText:   { fontSize: 11, fontWeight: '700', color: '#22C55E' },
    availBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      borderRadius: 999, borderWidth: 1,
      paddingHorizontal: 8, paddingVertical: 3,
    },
    availDot:   { width: 6, height: 6, borderRadius: 3 },
    availText:  { fontSize: 11, fontWeight: '600' },

    ratingRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 },
    stars:      { fontSize: 12, color: '#FBBF24' },
    ratingVal:  { fontSize: 13, fontWeight: '800', color: C.textPrimary },
    ratingCnt:  { fontSize: 12, color: C.textSecondary },

    // Job card
    jobBadge: {
      paddingHorizontal: 8, paddingVertical: 3,
      borderRadius: 999, borderWidth: 1,
    },
    jobBadgeText: { fontSize: 11, fontWeight: '700' },
    jobDesc:      { fontSize: 13, color: C.textSecondary, lineHeight: 19, marginTop: 4 },
    jobMeta:      { fontSize: 12, color: C.textMuted, marginTop: 6 },
    jobPrice:     { fontSize: 14, fontWeight: '800', color: '#22C55E', marginTop: 4 },

    // Map pins
    myPin: {
      width: 16, height: 16, borderRadius: 8,
      backgroundColor: '#3B82F6', borderWidth: 3, borderColor: '#fff',
    },
    pin: {
      width: 30, height: 30, borderRadius: 15,
      borderWidth: 2, borderColor: '#fff',
      alignItems: 'center', justifyContent: 'center',
    },
    pinSelected: { borderColor: '#fff', borderWidth: 3, transform: [{ scale: 1.15 }] },
    pinAvailDot: {
      position: 'absolute', top: -2, right: -2,
      width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff',
    },

    // Empty-state banner overlaid on the map
    mapEmptyBanner: {
      position: 'absolute', left: 12, right: 12, zIndex: 1,
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: 'rgba(20,20,20,0.92)', borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    },
    mapEmptyBannerText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: '#fff' },

    // Empty / error / loading states (full screen, pre-map)
    center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
    emptyIcon:   { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    emptyTitle:  { fontSize: 20, fontWeight: '800', color: C.textPrimary, textAlign: 'center' },
    emptySub:    { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 21 },
    emptyBtn:    { paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
    emptyBtnText:{ fontSize: 14, fontWeight: '700', color: '#fff' },

    emptyListWrap: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 30, gap: 10 },
    emptyListText: { fontSize: 13.5, color: C.textSecondary, textAlign: 'center', lineHeight: 20 },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distLabel(miles: number) {
  return miles < 1
    ? `${(miles * 5280).toFixed(0)} ft`
    : `${miles.toFixed(1)} mi`;
}

// fromDbValue() already falls back to the same general Trade for an
// unmatched string, but chaining getTrade() too means an unrecognized
// trade can never fail to resolve to *some* valid, renderable Trade.
function jobTrade(tradeValue: string) {
  return fromDbValue(tradeValue) ?? getTrade(tradeValue);
}

// contractors.trade_type can hold a comma-separated list (e.g.
// "HVAC, Electrical") for multi-trade companies — color by the first
// listed trade rather than falling back to the untinted general color
// for every multi-trade contractor.
function contractorTrade(tradeType: string | null): Trade {
  const first = (tradeType ?? '').split(',')[0]?.trim() ?? '';
  return jobTrade(first);
}

function avatarColor(name: string) {
  const colors = ['#FF6200', '#7C3AED', '#0EA5E9', '#10B981', '#F59E0B', '#EF4444'];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}

// ─── Trade chip row ───────────────────────────────────────────────────────────

function TradeChipRow({ active, onSelect, C }: { active: string; onSelect: (dbValue: string) => void; C: AppColors }) {
  const s = makeStyles(C);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.tradeRow}
      contentContainerStyle={s.tradeRowContent}
    >
      <TouchableOpacity
        style={[s.tradeChip, { borderColor: active === 'All' ? C.orange : C.border, backgroundColor: active === 'All' ? `${C.orange}18` : 'transparent' }]}
        onPress={() => onSelect('All')}
      >
        <Text style={[s.tradeChipText, { color: active === 'All' ? C.orange : C.textSecondary }]}>All</Text>
      </TouchableOpacity>
      {FILTERABLE_TRADES.map(t => {
        const isActive = active === t.dbValue;
        return (
          <TouchableOpacity
            key={t.id}
            style={[s.tradeChip, { borderColor: isActive ? t.color : C.border, backgroundColor: isActive ? `${t.color}18` : 'transparent' }]}
            onPress={() => onSelect(t.dbValue!)}
          >
            <View style={[s.tradeChipDot, { backgroundColor: t.color }]} />
            <Text style={[s.tradeChipText, { color: isActive ? t.color : C.textSecondary }]}>{t.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// ─── Customer: Nearby Contractors ─────────────────────────────────────────────

function ContractorCard({ item, onPress, selected, C }: {
  item: NearbyContractor;
  onPress: () => void;
  selected: boolean;
  C: AppColors;
}) {
  const s = makeStyles(C);
  const color = avatarColor(item.company_name);
  const init  = initials(item.company_name);
  const specs = Array.isArray(item.specializations) ? item.specializations.slice(0, 3) : [];
  const trade = contractorTrade(item.trade_type);

  return (
    <TouchableOpacity
      style={[s.card, selected && [s.cardSelected, { borderColor: trade.color }]]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={s.cardTop}>
        <View style={[s.avatar, { backgroundColor: color }]}>
          <Text style={s.avatarText}>{init}</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={s.cardName} numberOfLines={1}>{item.company_name}</Text>
          <Text style={[s.cardTrade, { color: trade.color }]}>{item.trade_type ?? 'General Contractor'}</Text>
          {!!item.location && <Text style={s.cardLocation} numberOfLines={1}>{item.location}</Text>}
        </View>
      </View>

      <View style={s.cardBadges}>
        <View style={s.distBadge}>
          <Text style={{ fontSize: 10 }}>📍</Text>
          <Text style={s.distText}>{distLabel(item.distance_miles)}</Text>
        </View>

        <View style={[s.availBadge, {
          borderColor: item.is_available ? 'rgba(34,197,94,0.3)' : C.border,
          backgroundColor: item.is_available ? 'rgba(34,197,94,0.08)' : 'transparent',
        }]}>
          <View style={[s.availDot, { backgroundColor: item.is_available ? '#22C55E' : C.textMuted }]} />
          <Text style={[s.availText, { color: item.is_available ? '#22C55E' : C.textMuted }]}>
            {item.is_available ? 'Available' : 'Busy'}
          </Text>
        </View>

        {item.verification_status === 'approved' && (
          <View style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Text style={{ fontSize: 11, color: '#22C55E', fontWeight: '700' }}>✓ Verified</Text>
          </View>
        )}
      </View>

      {item.rating != null && (
        <View style={s.ratingRow}>
          <Text style={s.stars}>{'★'.repeat(Math.round(item.rating))}</Text>
          <Text style={s.ratingVal}>{item.rating.toFixed(1)}</Text>
          <Text style={s.ratingCnt}>({item.review_count ?? 0})</Text>
        </View>
      )}

      {specs.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {specs.map(sp => (
            <View key={sp} style={{ backgroundColor: C.background, borderRadius: 999, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, color: C.textSecondary }}>{sp}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Contractor: Nearby Jobs ───────────────────────────────────────────────────

function JobCard({ item, onPress, selected, C }: {
  item: NearbyJob;
  onPress: () => void;
  selected: boolean;
  C: AppColors;
}) {
  const s = makeStyles(C);
  const trade = jobTrade(item.trade);
  const when = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const areaLabel = item.town
    ? (item.nearest_major_road ? `${item.town} — near ${item.nearest_major_road}` : item.town)
    : 'Nearby';

  return (
    <TouchableOpacity
      style={[s.card, selected && [s.cardSelected, { borderColor: trade.color }]]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <View style={[s.jobBadge, { borderColor: `${trade.color}4D`, backgroundColor: `${trade.color}14` }]}>
          <Text style={[s.jobBadgeText, { color: trade.color }]}>{trade.label}</Text>
        </View>
        {item.price_estimate != null && (
          <Text style={s.jobPrice}>${item.price_estimate.toLocaleString()}</Text>
        )}
      </View>
      <Text style={s.jobDesc} numberOfLines={2}>
        Approximate location — exact address shared when you’re hired.
      </Text>
      <Text style={s.jobMeta}>
        {areaLabel}{' · '}{when}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function MapScreen() {
  const { colors: C }      = useTheme();
  const { isContractor }   = useRole();
  const router             = useRouter();
  const s                  = makeStyles(C);

  const [coords,        setCoords]        = useState<Coords | null>(null);
  const [locationLabel, setLocationLabel] = useState<string>('');
  const [locating,      setLocating]      = useState(true);
  const [locErr,        setLocErr]        = useState(false);
  const [radius,        setRadius]        = useState<Radius>(25);
  const [tradeFilter,   setTradeFilter]   = useState('All');
  const [contractors,   setContractors]   = useState<NearbyContractor[]>([]);
  const [jobs,          setJobs]          = useState<NearbyJob[]>([]);
  const [loading,       setLoading]       = useState(false);
  const [refreshing,    setRefreshing]    = useState(false);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

  const [radiusPickerOpen, setRadiusPickerOpen] = useState(false);
  const [sheetIndex,       setSheetIndex]       = useState(0);
  const [selectedId,       setSelectedId]       = useState<string | null>(null);
  const [sortMode,         setSortMode]         = useState<SortMode>('distance');

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ['12%', '45%', '90%'], []);

  // ── Get GPS ───────────────────────────────────────────────────────────────

  const getLocation = useCallback(async () => {
    setLocating(true);
    setLocErr(false);
    const pos = await getCurrentPosition();
    if (!pos) { setLocating(false); setLocErr(true); return; }
    setCoords(pos);

    // Reverse geocode for label
    const addr = await reverseGeocode(pos).catch(() => null);
    if (addr?.city && addr?.state) setLocationLabel(`${addr.city}, ${addr.state}`);
    else setLocationLabel(`${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`);

    setLocating(false);
  }, []);

  useEffect(() => { getLocation(); }, [getLocation]);

  // ── Fetch results ─────────────────────────────────────────────────────────

  const fetchResults = useCallback(async (isRefresh = false) => {
    if (!coords) return;
    isRefresh ? setRefreshing(true) : setLoading(true);

    if (!isContractor) {
      // Customer: nearby contractors
      const { data } = await supabase.rpc('contractors_nearby', {
        user_lat:         coords.lat,
        user_lng:         coords.lng,
        max_miles:        radius,
        trade_filter:     tradeFilter !== 'All' ? tradeFilter : null,
        specialty_filter: null,
      });
      setContractors((data ?? []) as NearbyContractor[]);
    } else {
      // Contractor: public jobs only, server-fuzzed. RLS no longer grants
      // browsing contractors direct table access to bookings — this RPC
      // is the only read path. Filtering (pending, unclaimed, public, not
      // expired) happens server-side. See lib/map/location-privacy.ts.
      const { data } = await supabase.rpc('public_jobs_nearby', {
        user_lat:     coords.lat,
        user_lng:     coords.lng,
        max_miles:    radius,
        trade_filter: tradeFilter !== 'All' ? tradeFilter : null,
      });
      setJobs((data ?? []) as NearbyJob[]);
    }

    setHasFetchedOnce(true);
    isRefresh ? setRefreshing(false) : setLoading(false);
  }, [coords, radius, tradeFilter, isContractor]);

  useEffect(() => {
    if (coords) fetchResults();
  }, [fetchResults, coords]);

  // ── Derived data — must run unconditionally, before any early return,
  // or the hook count changes between renders once `locating`/`locErr` flip. ──

  const results = isContractor ? jobs : contractors;
  const isEmpty = hasFetchedOnce && !loading && results.length === 0;
  const jobPins = isContractor ? jobs.filter(j => j.fuzzed_lat != null && j.fuzzed_lng != null) : [];

  // Presentation-only reordering of the already-fetched results — no new
  // query, no new RPC param. Distance is the RPC's own default order.
  const sortedResults = useMemo(() => {
    const arr = [...results] as (NearbyJob | NearbyContractor)[];
    if (sortMode === 'distance') return arr; // already distance-ordered server-side
    if (sortMode === 'price' && isContractor) {
      return (arr as NearbyJob[]).slice().sort((a, b) => (b.price_estimate ?? -1) - (a.price_estimate ?? -1));
    }
    if (sortMode === 'rating' && !isContractor) {
      return (arr as NearbyContractor[]).slice().sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1));
    }
    return arr;
  }, [results, sortMode, isContractor]);

  // Selected item floats to the top of the list (tapping a pin snaps here).
  const displayResults = useMemo(() => {
    if (!selectedId) return sortedResults;
    const idx = sortedResults.findIndex((r: any) => r.id === selectedId);
    if (idx <= 0) return sortedResults;
    const copy = sortedResults.slice();
    const [hit] = copy.splice(idx, 1);
    return [hit, ...copy];
  }, [sortedResults, selectedId]);

  const cameraBounds = useMemo(() => {
    if (!coords) return null;
    const points: [number, number][] = [[coords.lng, coords.lat]];
    if (isContractor) {
      jobPins.forEach(j => points.push([j.fuzzed_lng!, j.fuzzed_lat!]));
    } else {
      contractors.forEach(c => points.push([c.lng, c.lat]));
    }
    if (points.length === 1) return null; // just the user — use a fixed zoom instead of a zero-size box
    const lngs = points.map(p => p[0]);
    const lats = points.map(p => p[1]);
    return {
      ne: [Math.max(...lngs) + 0.015, Math.max(...lats) + 0.015] as [number, number],
      sw: [Math.min(...lngs) - 0.015, Math.min(...lats) - 0.015] as [number, number],
    };
  }, [coords, contractors, jobPins, isContractor]);

  const handlePinPress = useCallback((id: string) => {
    setSelectedId(id);
    bottomSheetRef.current?.snapToIndex(1);
  }, []);

  const goToDetail = useCallback((id: string) => {
    router.push((isContractor ? `/job/${id}` : `/company/${id}`) as any);
  }, [isContractor, router]);

  // ── States ────────────────────────────────────────────────────────────────

  if (locating) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}>
          <ActivityIndicator color={C.orange} size="large" />
          <Text style={[s.emptySub, { marginTop: 8 }]}>Getting your location…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (locErr) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}>
          <View style={[s.emptyIcon, { borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' }]}>
            <Ionicons name="location-outline" size={36} color="#EF4444" />
          </View>
          <Text style={s.emptyTitle}>Location Required</Text>
          <Text style={s.emptySub}>
            Allow location access so we can find {isContractor ? 'jobs' : 'contractors'} near you.
          </Text>
          <TouchableOpacity style={[s.emptyBtn, { backgroundColor: C.orange }]} onPress={getLocation}>
            <Text style={s.emptyBtnText}>Enable Location</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const peekLabel = `${results.length} ${isContractor ? 'open job' : 'contractor'}${results.length !== 1 ? 's' : ''} within ${radius} mi`;

  return (
    <View style={s.container}>
      {/* ── Map, edge to edge, behind everything ── */}
      <MapboxGL.MapView
        style={s.map}
        styleURL={MapboxGL.StyleURL.Dark}
        pitchEnabled={false}
        rotateEnabled={false}
      >
        {cameraBounds ? (
          <MapboxGL.Camera
            bounds={cameraBounds}
            padding={{ paddingLeft: 40, paddingRight: 40, paddingTop: 60, paddingBottom: 220 }}
            animationMode="none"
          />
        ) : (
          <MapboxGL.Camera
            centerCoordinate={coords ? [coords.lng, coords.lat] : DEFAULT_MAP_REGION.centerCoordinate}
            zoomLevel={coords ? 12 : DEFAULT_MAP_REGION.zoomLevel}
            animationMode="none"
          />
        )}

        {coords && (
          <MapboxGL.PointAnnotation id="myPin" coordinate={[coords.lng, coords.lat]}>
            <View style={s.myPin} />
          </MapboxGL.PointAnnotation>
        )}

        {isContractor
          ? jobPins.map(j => {
              const trade = jobTrade(j.trade);
              const selected = selectedId === j.id;
              return (
                <MapboxGL.MarkerView key={j.id} id={`job-${j.id}`} coordinate={[j.fuzzed_lng!, j.fuzzed_lat!]}>
                  <TouchableOpacity onPress={() => handlePinPress(j.id)} activeOpacity={0.8}>
                    <View style={[s.pin, selected && s.pinSelected, { backgroundColor: trade.color }]}>
                      <Ionicons name="briefcase" size={14} color="#fff" />
                    </View>
                  </TouchableOpacity>
                </MapboxGL.MarkerView>
              );
            })
          : contractors.map(c => {
              const trade = contractorTrade(c.trade_type);
              const selected = selectedId === c.id;
              return (
                <MapboxGL.MarkerView key={c.id} id={`contractor-${c.id}`} coordinate={[c.lng, c.lat]}>
                  <TouchableOpacity onPress={() => handlePinPress(c.id)} activeOpacity={0.8}>
                    <View style={[s.pin, selected && s.pinSelected, { backgroundColor: trade.color }]}>
                      <Ionicons name="person" size={14} color="#fff" />
                      <View style={[s.pinAvailDot, { backgroundColor: c.is_available ? '#22C55E' : '#6B7280' }]} />
                    </View>
                  </TouchableOpacity>
                </MapboxGL.MarkerView>
              );
            })
        }
      </MapboxGL.MapView>

      {isEmpty && (
        <View style={[s.mapEmptyBanner, { top: 12 }]}>
          <Ionicons name={isContractor ? 'briefcase-outline' : 'person-outline'} size={15} color={C.textSecondary} />
          <Text style={s.mapEmptyBannerText} numberOfLines={2}>
            {isContractor
              ? 'No pending jobs right now — check back soon.'
              : `No ${tradeFilter !== 'All' ? tradeFilter + ' ' : ''}contractors within ${radius} miles.`}
          </Text>
        </View>
      )}

      {loading && !refreshing && (
        <View style={{ position: 'absolute', top: 14, left: 14 }}>
          <ActivityIndicator color={C.orange} size="small" />
        </View>
      )}

      {/* ── Floating radius pill, top right — the only thing floating up here ── */}
      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, right: 0 }} pointerEvents="box-none">
        <TouchableOpacity
          style={[s.radiusPill, { marginTop: 8, marginRight: 16 }]}
          activeOpacity={0.85}
          onPress={() => setRadiusPickerOpen(true)}
        >
          <BlurView intensity={40} tint="dark" style={s.radiusPillInner}>
            <Text style={s.radiusPillText}>{radius} mi</Text>
            <Ionicons name="chevron-down" size={14} color="#fff" />
          </BlurView>
        </TouchableOpacity>
      </SafeAreaView>

      {/* ── Radius picker ── */}
      <Modal visible={radiusPickerOpen} transparent animationType="fade" onRequestClose={() => setRadiusPickerOpen(false)}>
        <Pressable style={s.pickerBackdrop} onPress={() => setRadiusPickerOpen(false)}>
          <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 56, right: 16 }}>
            <View style={s.pickerCard}>
              {RADII.map(r => (
                <TouchableOpacity key={r} style={s.pickerRow} onPress={() => { setRadius(r); setRadiusPickerOpen(false); }}>
                  <Text style={[s.pickerRowText, { color: r === radius ? C.orange : C.textPrimary }]}>{r} mi</Text>
                  {r === radius && <Ionicons name="checkmark" size={16} color={C.orange} />}
                </TouchableOpacity>
              ))}
            </View>
          </SafeAreaView>
        </Pressable>
      </Modal>

      {/* ── Draggable results sheet ── */}
      <BottomSheet
        ref={bottomSheetRef}
        index={0}
        snapPoints={snapPoints}
        onChange={setSheetIndex}
        backgroundStyle={s.sheetBackground}
        handleIndicatorStyle={s.sheetHandle}
      >
        <BottomSheetView style={s.sheetPeek}>
          <Text style={s.sheetPeekText}>{peekLabel}</Text>
          <TouchableOpacity
            style={[s.sheetPeekIcon, { backgroundColor: `${C.orange}18` }]}
            onPress={() => bottomSheetRef.current?.snapToIndex(sheetIndex >= 1 ? 0 : 1)}
          >
            <Ionicons name={sheetIndex >= 1 ? 'chevron-down' : 'chevron-up'} size={18} color={C.orange} />
          </TouchableOpacity>
        </BottomSheetView>

        {sheetIndex >= 1 && !isContractor && (
          <TradeChipRow active={tradeFilter} onSelect={setTradeFilter} C={C} />
        )}

        {sheetIndex >= 2 && (
          <View style={s.sortRow}>
            <Text style={s.sortLabel}>Sort</Text>
            {(['distance', isContractor ? 'price' : 'rating'] as SortMode[]).map(mode => {
              const active = sortMode === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  style={[s.sortChip, { borderColor: active ? C.orange : C.border, backgroundColor: active ? `${C.orange}18` : 'transparent' }]}
                  onPress={() => setSortMode(mode)}
                >
                  <Text style={[s.sortChipText, { color: active ? C.orange : C.textSecondary }]}>
                    {mode === 'distance' ? 'Distance' : mode === 'price' ? 'Price' : 'Rating'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {sheetIndex >= 1 ? (
          <BottomSheetFlatList
            data={displayResults as any[]}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            refreshing={refreshing}
            onRefresh={() => fetchResults(true)}
            ListEmptyComponent={
              isEmpty ? (
                <View style={s.emptyListWrap}>
                  <Ionicons name={isContractor ? 'briefcase-outline' : 'person-outline'} size={30} color={C.textMuted} />
                  <Text style={s.emptyListText}>
                    {isContractor
                      ? 'No pending jobs right now. Check back soon or expand your radius.'
                      : `No ${tradeFilter !== 'All' ? tradeFilter + ' ' : ''}contractors within ${radius} miles.`}
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) =>
              isContractor
                ? <JobCard item={item} C={C} selected={selectedId === item.id} onPress={() => goToDetail(item.id)} />
                : <ContractorCard item={item} C={C} selected={selectedId === item.id} onPress={() => goToDetail(item.id)} />
            }
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </BottomSheet>
    </View>
  );
}
