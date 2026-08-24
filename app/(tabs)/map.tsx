// app/(tabs)/map.tsx
// GPS-powered proximity search. Customers (and guests) see nearby contractors
// on a real Mapbox map; contractors see open jobs near them. List view stays
// available as a toggle for the detail-rich cards (ratings, specialties, etc).

import { useTheme, AppColors } from '@/context/ThemeContext';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/lib/supabase';
import { getCurrentPosition, reverseGeocode, Coords } from '@/lib/locationService';
import { MAPBOX_ACCESS_TOKEN, DEFAULT_MAP_REGION } from '@/lib/mapConfig';
import { ALL_TRADES, TRADE_ICONS } from '@/lib/tradeJobs';
import { Ionicons } from '@expo/vector-icons';
import MapboxGL from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
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
  description: string;
  status: string;
  created_at: string;
  customer: { full_name: string | null; location: string | null } | null;
  price_estimate: number | null;
  job_lat: number | null;
  job_lng: number | null;
}

const RADII = [10, 25, 50] as const;
type Radius = (typeof RADII)[number];

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(C: AppColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: C.background },
    header:       {
      paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: C.border,
    },
    titleRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    title:        { fontSize: 26, fontWeight: '900', color: C.textPrimary },
    locationRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
    locationPin:  { fontSize: 13 },
    locationText: { fontSize: 13, color: C.textSecondary, flex: 1 },
    refreshIcon:  { padding: 4 },

    // Radius chips
    chipRow:  { flexDirection: 'row', gap: 8, marginBottom: 10 },
    chip:     {
      paddingHorizontal: 14, paddingVertical: 6,
      borderRadius: 999, borderWidth: 1,
    },
    chipText: { fontSize: 12, fontWeight: '700' },

    // Trade scroll
    tradeRow: { flexDirection: 'row', gap: 8 },
    tradeChip: {
      paddingHorizontal: 12, paddingVertical: 5,
      borderRadius: 999, borderWidth: 1,
      flexShrink: 0,
    },
    tradeChipText: { fontSize: 12, fontWeight: '600' },

    // List
    list:    { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
    card:    {
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1,
      borderColor: C.border, padding: 16, marginBottom: 12,
    },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },

    avatar: {
      width: 48, height: 48, borderRadius: 12,
      alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarText: { fontSize: 18, fontWeight: '900', color: '#fff' },

    cardInfo:       { flex: 1 },
    cardName:       { fontSize: 15, fontWeight: '800', color: C.textPrimary, marginBottom: 2 },
    cardTrade:      { fontSize: 13, color: C.orange, fontWeight: '600' },
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
      borderColor: 'rgba(255,98,0,0.3)',
      backgroundColor: 'rgba(255,98,0,0.08)',
    },
    jobBadgeText: { fontSize: 11, fontWeight: '700', color: C.orange },
    jobDesc:      { fontSize: 13, color: C.textSecondary, lineHeight: 19, marginTop: 4 },
    jobMeta:      { fontSize: 12, color: C.textMuted, marginTop: 6 },
    jobPrice:     { fontSize: 14, fontWeight: '800', color: '#22C55E', marginTop: 4 },

    // Map pins
    myPin: {
      width: 16, height: 16, borderRadius: 8,
      backgroundColor: '#3B82F6', borderWidth: 3, borderColor: '#fff',
    },
    jobPin: {
      width: 30, height: 30, borderRadius: 15,
      backgroundColor: C.orange, borderWidth: 2, borderColor: '#fff',
      alignItems: 'center', justifyContent: 'center',
    },
    contractorPin: {
      width: 30, height: 30, borderRadius: 15,
      borderWidth: 2, borderColor: '#fff',
      alignItems: 'center', justifyContent: 'center',
    },

    // Map/list toggle
    listToggle: {
      position: 'absolute', bottom: 24, alignSelf: 'center',
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: 'rgba(20,20,20,0.92)', borderRadius: 999,
      paddingHorizontal: 18, paddingVertical: 12,
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
      shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    },
    listToggleText: { fontSize: 13, fontWeight: '700', color: '#fff' },
    listModeHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
    },
    mapToggle: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 10, paddingVertical: 5,
      borderRadius: 999, borderWidth: 1, borderColor: C.orange,
    },
    mapToggleText: { fontSize: 12, fontWeight: '700', color: C.orange },

    // Empty / error states
    center:      { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 40 },
    emptyIcon:   { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
    emptyTitle:  { fontSize: 20, fontWeight: '800', color: C.textPrimary, textAlign: 'center' },
    emptySub:    { fontSize: 14, color: C.textSecondary, textAlign: 'center', lineHeight: 21 },
    emptyBtn:    {
      paddingHorizontal: 24, paddingVertical: 12,
      borderRadius: 12, marginTop: 4,
    },
    emptyBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

    count: { fontSize: 13, color: C.textSecondary },
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function distLabel(miles: number) {
  return miles < 1
    ? `${(miles * 5280).toFixed(0)} ft`
    : `${miles.toFixed(1)} mi`;
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

// ─── Customer: Nearby Contractors ─────────────────────────────────────────────

function ContractorCard({ item, onPress, C }: {
  item: NearbyContractor;
  onPress: () => void;
  C: AppColors;
}) {
  const s = makeStyles(C);
  const color = avatarColor(item.company_name);
  const init  = initials(item.company_name);
  const specs = Array.isArray(item.specializations) ? item.specializations.slice(0, 3) : [];

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.75}>
      <View style={s.cardTop}>
        <View style={[s.avatar, { backgroundColor: color }]}>
          <Text style={s.avatarText}>{init}</Text>
        </View>
        <View style={s.cardInfo}>
          <Text style={s.cardName} numberOfLines={1}>{item.company_name}</Text>
          <Text style={s.cardTrade}>{item.trade_type ?? 'General Contractor'}</Text>
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
          {specs.map(s => (
            <View key={s} style={{ backgroundColor: C.background, borderRadius: 999, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: 8, paddingVertical: 3 }}>
              <Text style={{ fontSize: 11, color: C.textSecondary }}>{s}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Contractor: Nearby Jobs ───────────────────────────────────────────────────

function JobCard({ item, onPress, C }: {
  item: NearbyJob;
  onPress: () => void;
  C: AppColors;
}) {
  const s = makeStyles(C);
  const when = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.75}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <View style={s.jobBadge}><Text style={s.jobBadgeText}>{item.trade}</Text></View>
        {item.price_estimate != null && (
          <Text style={s.jobPrice}>${item.price_estimate.toLocaleString()}</Text>
        )}
      </View>
      <Text style={s.jobDesc} numberOfLines={2}>{item.description}</Text>
      <Text style={s.jobMeta}>
        {item.customer?.full_name ?? 'Customer'}
        {item.customer?.location ? ` · ${item.customer.location}` : ''}
        {' · '}{when}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

const TRADE_ALL = { trade: 'All', emoji: '🔍' };

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
  const [viewMode,      setViewMode]      = useState<'map' | 'list'>('map');

  const trades = [TRADE_ALL, ...ALL_TRADES.map((trade: string) => ({ trade, emoji: TRADE_ICONS[trade] ?? '🔧' }))];

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
      // Contractor: open jobs (pending, not yet assigned, request/post window not expired)
      const { data } = await supabase
        .from('bookings')
        .select('id, trade, description, status, created_at, price_estimate, request_expires_at, job_lat, job_lng, customer:customer_id(full_name, location)')
        .eq('status', 'pending')
        .is('contractor_id', null)
        .or(`request_expires_at.gt.${new Date().toISOString()},request_expires_at.is.null`)
        .order('created_at', { ascending: false })
        .limit(50);
      setJobs((data ?? []) as unknown as NearbyJob[]);
    }

    isRefresh ? setRefreshing(false) : setLoading(false);
  }, [coords, radius, tradeFilter, isContractor]);

  useEffect(() => {
    if (coords) fetchResults();
  }, [fetchResults, coords]);

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

  const results = isContractor ? jobs : contractors;
  const isEmpty = !loading && results.length === 0;
  const jobPins = isContractor ? jobs.filter(j => j.job_lat != null && j.job_lng != null) : [];

  const cameraBounds = useMemo(() => {
    if (!coords) return null;
    const points: [number, number][] = [[coords.lng, coords.lat]];
    if (isContractor) {
      jobPins.forEach(j => points.push([j.job_lng!, j.job_lat!]));
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

  return (
    <SafeAreaView style={s.container} edges={['top']}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.titleRow}>
          <Text style={s.title}>{isContractor ? 'Open Jobs' : 'Near You'}</Text>
          {loading && !refreshing && <ActivityIndicator color={C.orange} size="small" />}
        </View>

        {/* Location label */}
        <View style={s.locationRow}>
          <Text style={s.locationPin}>📍</Text>
          <Text style={s.locationText} numberOfLines={1}>
            {locationLabel || 'Your location'}
          </Text>
          <TouchableOpacity style={s.refreshIcon} onPress={() => { getLocation(); }}>
            <Ionicons name="refresh-outline" size={16} color={C.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Radius chips */}
        <View style={s.chipRow}>
          {RADII.map(r => {
            const active = radius === r;
            return (
              <TouchableOpacity
                key={r}
                style={[s.chip, {
                  borderColor: active ? C.orange : C.border,
                  backgroundColor: active ? `${C.orange}18` : 'transparent',
                }]}
                onPress={() => setRadius(r)}
              >
                <Text style={[s.chipText, { color: active ? C.orange : C.textSecondary }]}>
                  {r} mi
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Trade filter (customers only) */}
        {!isContractor && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tradeRow}>
            {trades.map(t => {
              const active = tradeFilter === t.trade;
              return (
                <TouchableOpacity
                  key={t.trade}
                  style={[s.tradeChip, {
                    borderColor: active ? C.orange : C.border,
                    backgroundColor: active ? `${C.orange}18` : 'transparent',
                  }]}
                  onPress={() => setTradeFilter(t.trade)}
                >
                  <Text style={[s.tradeChipText, { color: active ? C.orange : C.textSecondary }]}>
                    {t.emoji} {t.trade}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* ── Results ── */}
      {isEmpty ? (
        <View style={s.center}>
          <View style={[s.emptyIcon, { borderColor: `${C.orange}30`, backgroundColor: `${C.orange}10` }]}>
            <Ionicons name={isContractor ? 'briefcase-outline' : 'person-outline'} size={36} color={C.orange} />
          </View>
          <Text style={s.emptyTitle}>
            {isContractor ? 'No Open Jobs' : 'No Contractors Found'}
          </Text>
          <Text style={s.emptySub}>
            {isContractor
              ? 'No pending jobs right now. Check back soon or expand to a wider radius.'
              : `No ${tradeFilter !== 'All' ? tradeFilter + ' ' : ''}contractors within ${radius} miles. Try expanding your search radius.`}
          </Text>
          {!isContractor && tradeFilter !== 'All' && (
            <TouchableOpacity style={[s.emptyBtn, { backgroundColor: C.orange }]} onPress={() => setTradeFilter('All')}>
              <Text style={s.emptyBtnText}>Clear Filter</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : viewMode === 'map' ? (
        <View style={{ flex: 1 }}>
          <MapboxGL.MapView
            style={{ flex: 1 }}
            styleURL={MapboxGL.StyleURL.Dark}
            pitchEnabled={false}
            rotateEnabled={false}
          >
            {cameraBounds ? (
              <MapboxGL.Camera
                bounds={cameraBounds}
                padding={{ paddingLeft: 40, paddingRight: 40, paddingTop: 60, paddingBottom: 60 }}
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
              ? jobPins.map(j => (
                  <MapboxGL.MarkerView key={j.id} id={`job-${j.id}`} coordinate={[j.job_lng!, j.job_lat!]}>
                    <TouchableOpacity onPress={() => router.push(`/job/${j.id}` as any)} activeOpacity={0.8}>
                      <View style={s.jobPin}>
                        <Ionicons name="briefcase" size={14} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  </MapboxGL.MarkerView>
                ))
              : contractors.map(c => (
                  <MapboxGL.MarkerView key={c.id} id={`contractor-${c.id}`} coordinate={[c.lng, c.lat]}>
                    <TouchableOpacity onPress={() => router.push(`/company/${c.id}` as any)} activeOpacity={0.8}>
                      <View style={[s.contractorPin, { backgroundColor: c.is_available ? '#22C55E' : '#6B7280' }]}>
                        <Ionicons name="person" size={14} color="#fff" />
                      </View>
                    </TouchableOpacity>
                  </MapboxGL.MarkerView>
                ))
            }
          </MapboxGL.MapView>

          <TouchableOpacity style={s.listToggle} onPress={() => setViewMode('list')} activeOpacity={0.85}>
            <Ionicons name="list" size={16} color="#fff" />
            <Text style={s.listToggleText}>
              {results.length} {isContractor ? 'job' : 'contractor'}{results.length !== 1 ? 's' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.listModeHeader}>
            <Text style={s.count}>
              {results.length} {isContractor ? 'job' : 'contractor'}{results.length !== 1 ? 's' : ''}{' '}
              {!isContractor ? `within ${radius} miles` : 'available'}
            </Text>
            <TouchableOpacity style={s.mapToggle} onPress={() => setViewMode('map')} activeOpacity={0.85}>
              <Ionicons name="map-outline" size={14} color={C.orange} />
              <Text style={s.mapToggleText}>Map</Text>
            </TouchableOpacity>
          </View>
          <FlatList
            data={results as any[]}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchResults(true)}
                tintColor={C.orange}
              />
            }
            renderItem={({ item }) =>
              isContractor
                ? <JobCard item={item} C={C} onPress={() => router.push(`/job/${item.id}` as any)} />
                : <ContractorCard item={item} C={C} onPress={() => router.push(`/company/${item.id}` as any)} />
            }
          />
        </>
      )}
    </SafeAreaView>
  );
}
