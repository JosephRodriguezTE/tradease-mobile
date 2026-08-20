// app/work-order/contractor.tsx
// Contractor Live Work Order — Phase 2
// FlatList of collapsible sections · sticky action footer · Mapbox route · location tracking

import MapboxGL from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActionSheetIOS, ActivityIndicator, Alert, Animated, AppState, FlatList,
  Image, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showToast } from '@/components/Toast';
import { Skeleton, SkeletonBillSection, SkeletonChecklist, SkeletonSectionCard } from '@/components/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import { usePrimaryAction } from '@/hooks/usePrimaryAction';
import { enqueueOffline, flushOfflineQueue } from '@/lib/offlineQueue';
import { MAPBOX_ACCESS_TOKEN } from '@/lib/mapConfig';
import { supabase } from '@/lib/supabase';

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

// ─── Theme ────────────────────────────────────────────────────────────────────

const G = {
  bg:          '#0D0D0D',
  card:        '#161616',
  cardAlt:     '#1C1C1C',
  border:      '#262626',
  borderLight: '#333333',
  green:       '#22C55E',
  greenMuted:  'rgba(34,197,94,0.12)',
  greenGlow:   'rgba(34,197,94,0.25)',
  orange:      '#FF6200',
  amber:       '#FBBF24',
  blue:        '#38BDF8',
  red:         '#EF4444',
  txt:         '#F0F0F0',
  txt2:        '#9A9A9A',
  txt3:        '#555555',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type WoStatus =
  | 'submitted' | 'accepted' | 'deposit_secured'
  | 'en_route' | 'arrived' | 'in_progress'
  | 'waiting_for_customer' | 'materials_needed'
  | 'change_order_pending' | 'awaiting_approval'
  | 'payment_releasing' | 'completed' | 'cancelled' | 'disputed';

type SectionKey = 'stepper' | 'bill' | 'checklist' | 'customer' | 'map' | 'media' | 'timeline' | 'payment' | 'support';
const ALL_SECTIONS: SectionKey[] = ['stepper', 'bill', 'checklist', 'customer', 'map', 'media', 'timeline', 'payment', 'support'];

interface WoData {
  id: string; booking_id: string; contractor_id: string; customer_id: string;
  work_order_number: string; wo_status: WoStatus; service_type: string;
  job_address: string; contractor_name: string; customer_name: string;
  scheduled_date: string | null; arrival_window_start: string | null; arrival_window_end: string | null;
  is_emergency: boolean; estimated_completion: string | null;
  special_instructions: string | null; gate_code: string | null;
  pets_note: string | null; parking_note: string | null;
  auto_approve_under_cents: number; payment_intent_id: string | null; created_at: string;
  early_start_requested: boolean; early_start_approved: boolean; hold_failed_at: string | null;
  booking?: {
    trade: string; description: string; price_estimate: number | null;
    customer_id: string; customer_name: string; customer_rating: number | null;
    job_lat: number | null; job_lng: number | null; job_address: string | null;
  };
}

interface LineItem {
  id: string; label: string; quantity: number; unit_price_cents: number;
  amount_cents: number; item_type: string; approval_status: string;
  requires_approval: boolean; added_by: string | null; created_at: string;
}

interface ProgressItem {
  id: string; label: string; sort_order: number; is_done: boolean; done_at: string | null;
}

interface WoEvent {
  id: string; event_type: string; actor_role: string | null;
  label: string; payload: Record<string, unknown>; created_at: string;
}

interface WoMedia {
  id: string; kind: string; storage_path: string; caption: string | null;
  uploaded_by: string; created_at: string; _publicUrl?: string;
}

interface PaymentIntent {
  id: string; status: string; amount_cents: number; captured_at: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEPPER_NODES: { key: WoStatus; label: string }[] = [
  { key: 'accepted',          label: 'Accepted'    },
  { key: 'en_route',          label: 'En Route'    },
  { key: 'arrived',           label: 'Arrived'     },
  { key: 'in_progress',       label: 'In Progress' },
  { key: 'awaiting_approval', label: 'Approval'    },
  { key: 'completed',         label: 'Complete'    },
];

function stepIdx(s: WoStatus): number {
  const m: Partial<Record<WoStatus, number>> = {
    submitted: -1, accepted: 0, deposit_secured: 0,
    en_route: 1,
    arrived: 2,
    in_progress: 3, waiting_for_customer: 3, materials_needed: 3, change_order_pending: 3,
    awaiting_approval: 4, payment_releasing: 4,
    completed: 5,
  };
  return m[s] ?? 0;
}



const ITEM_TYPES = [
  { v: 'labor',     l: '🔧 Labor'     },
  { v: 'material',  l: '🪛 Material'  },
  { v: 'equipment', l: '🚜 Equipment' },
  { v: 'disposal',  l: '🗑 Disposal'  },
  { v: 'travel',    l: '🚗 Travel'    },
  { v: 'permit',    l: '📋 Permit'    },
  { v: 'other',     l: '📦 Other'     },
] as const;

const MEDIA_KINDS = ['before', 'progress', 'after', 'receipt', 'document'] as const;
type MediaKind = typeof MEDIA_KINDS[number];

const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  HVAC:        ['Remove old condenser', 'Set pad', 'Install unit', 'Pressure test', 'Vacuum lines', 'Charge system', 'Startup', 'Test operation', 'Cleanup', 'Walkthrough'],
  Plumbing:    ['Shut off water', 'Remove old fixture', 'Install new fixture', 'Test for leaks', 'Restore water', 'Cleanup', 'Walkthrough'],
  Electrical:  ['Cut power', 'Remove old wiring', 'Run new wiring', 'Connect panels', 'Test circuits', 'Restore power', 'Label breaker', 'Cleanup'],
  Roofing:     ['Inspect damage', 'Remove old shingles', 'Inspect deck', 'Install underlayment', 'Install shingles', 'Flash penetrations', 'Final inspection', 'Cleanup'],
  Painting:    ['Prep surfaces', 'Tape and cover', 'Prime', 'First coat', 'Second coat', 'Touch-ups', 'Remove tape', 'Cleanup', 'Walkthrough'],
  Landscaping: ['Review plan', 'Mark layout', 'Prepare ground', 'Install plants/sod', 'Irrigation check', 'Final grade', 'Cleanup'],
  Carpentry:   ['Measure and mark', 'Cut materials', 'Install framing', 'Install finish', 'Sand and smooth', 'Hardware install', 'Walkthrough'],
  Handyman:    ['Inspect issue', 'Gather materials', 'Complete repair', 'Test', 'Cleanup', 'Walkthrough'],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const φ1 = lat1 * Math.PI / 180, φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180, Δλ = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function fmtElapsed(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, '0')}s`;
  return `${sec}s`;
}

function fmtEta(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function fmt$(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function fetchRoute(sLat: number, sLng: number, eLat: number, eLng: number) {
  try {
    const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${sLng},${sLat};${eLng},${eLat}?access_token=${MAPBOX_ACCESS_TOKEN}&geometries=geojson&overview=full`;
    const res = await fetch(url);
    const json = await res.json();
    if (!json.routes?.[0]) return null;
    return { geometry: json.routes[0].geometry as object, duration: json.routes[0].duration as number };
  } catch { return null; }
}

async function navigateTo(lat: number | null, lng: number | null, address: string | null) {
  if (!lat || !lng) {
    if (address) Linking.openURL(`https://maps.google.com/maps?daddr=${encodeURIComponent(address)}`);
    return;
  }
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options: ['Apple Maps', 'Google Maps', 'Cancel'], cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) Linking.openURL(`maps://?daddr=${lat},${lng}`);
        if (i === 1) {
          Linking.openURL(`comgooglemaps://?daddr=${lat},${lng}`).catch(() =>
            Linking.openURL(`https://maps.google.com/maps?daddr=${lat},${lng}`)
          );
        }
      }
    );
  } else {
    Linking.openURL(`google.navigation:q=${lat},${lng}`).catch(() =>
      Linking.openURL(`https://maps.google.com/maps?daddr=${lat},${lng}`)
    );
  }
}

// ─── PulseRing ────────────────────────────────────────────────────────────────

function PulseRing({ color }: { color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 600, useNativeDriver: true }),
      ])
    ).start();
  }, [anim]);
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const opacity = anim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] });
  return (
    <Animated.View style={{
      position: 'absolute', width: 20, height: 20, borderRadius: 10,
      borderWidth: 2, borderColor: color,
      transform: [{ scale }], opacity,
    }} />
  );
}

// ─── SectionCard ─────────────────────────────────────────────────────────────

function SectionCard({ title, icon, badge, collapsed, onToggle, accent, children }: {
  title: string; icon: string; badge?: string | number;
  collapsed: boolean; onToggle: () => void; accent?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.card}>
      <TouchableOpacity
        style={s.cardHead}
        onPress={onToggle}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`${title}${badge != null ? `, ${badge}` : ''}`}
        accessibilityHint={collapsed ? 'Double tap to expand' : 'Double tap to collapse'}
        accessibilityState={{ expanded: !collapsed }}
      >
        <View style={s.cardHeadLeft}>
          <Text style={s.cardIcon}>{icon}</Text>
          <Text style={[s.cardTitle, accent ? { color: accent } : null]}>{title}</Text>
          {badge != null && (
            <View style={[s.cardBadge, { backgroundColor: accent ? `${accent}20` : G.greenMuted }]}>
              <Text style={[s.cardBadgeTxt, { color: accent ?? G.green }]}>{badge}</Text>
            </View>
          )}
        </View>
        <Ionicons
          name={collapsed ? 'chevron-down' : 'chevron-up'}
          size={16} color={G.txt3}
        />
      </TouchableOpacity>
      {!collapsed && <View style={s.cardBody}>{children}</View>}
    </View>
  );
}

// ─── StepperSection ──────────────────────────────────────────────────────────

function StepperSection({ status }: { status: WoStatus }) {
  const cur = stepIdx(status);
  const isCancelled = status === 'cancelled' || status === 'disputed';

  return (
    <View style={s.card}>
      <View style={s.stepperRow}>
        {STEPPER_NODES.map((node, i) => {
          const done    = cur > i;
          const active  = cur === i;
          const isLast  = i === STEPPER_NODES.length - 1;
          const nodeColor = isCancelled ? G.red : (done || active ? G.green : G.border);

          return (
            <React.Fragment key={node.key}>
              <View style={s.stepNode}>
                <View style={[s.stepCircle, { borderColor: nodeColor, backgroundColor: done ? nodeColor : 'transparent' }]}>
                  {active && !isCancelled && <PulseRing color={G.green} />}
                  {done ? (
                    <Ionicons name="checkmark" size={11} color="#fff" />
                  ) : (
                    <View style={[s.stepDot, { backgroundColor: active ? G.green : G.txt3 }]} />
                  )}
                </View>
                <Text style={[s.stepLabel, { color: active ? G.green : (done ? G.txt2 : G.txt3) }]}>
                  {node.label}
                </Text>
              </View>
              {!isLast && (
                <View style={[s.stepLine, { backgroundColor: done || cur > i ? G.green : G.border }]} />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
}

// ─── BillSection ─────────────────────────────────────────────────────────────

function BillSection({
  items, basePrice, autoApproveUnder, onAddWork, collapsed, onToggle,
}: {
  items: LineItem[]; basePrice: number; autoApproveUnder: number;
  onAddWork: () => void; collapsed: boolean; onToggle: () => void;
}) {
  const grouped = useMemo(() => {
    const map: Record<string, LineItem[]> = {};
    for (const it of items) {
      const t = it.item_type ?? 'other';
      if (!map[t]) map[t] = [];
      map[t].push(it);
    }
    return map;
  }, [items]);

  const approvedTotal = useMemo(
    () => items.filter(i => i.approval_status !== 'rejected')
              .reduce((s, i) => s + i.amount_cents, 0),
    [items]
  );
  const total = basePrice * 100 + approvedTotal;
  const pendingCount = items.filter(i => i.approval_status === 'pending').length;

  const badge = pendingCount > 0 ? `${pendingCount} pending` : undefined;

  return (
    <SectionCard
      title="The Check"
      icon="📋"
      badge={badge}
      collapsed={collapsed}
      onToggle={onToggle}
      accent={pendingCount > 0 ? G.amber : undefined}
    >
      {/* Base price */}
      <View style={s.billRow}>
        <Text style={s.billLabel}>Base job price</Text>
        <Text style={[s.billAmt, { color: G.orange }]}>{fmt$(basePrice * 100)}</Text>
      </View>

      {/* Line items by type */}
      {Object.entries(grouped).map(([type, typeItems]) => (
        <View key={type} style={{ marginTop: 8 }}>
          <Text style={s.billGroupLabel}>{type.toUpperCase()}</Text>
          {typeItems.map(item => (
            <View key={item.id} style={[s.billRow, item.approval_status === 'rejected' && { opacity: 0.4 }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.billLabel, item.approval_status === 'rejected' && { textDecorationLine: 'line-through' }]}>
                  {item.label}
                </Text>
                <Text style={s.billMeta}>
                  {Number(item.quantity).toFixed(item.quantity % 1 === 0 ? 0 : 1)} × {fmt$(item.unit_price_cents ?? item.amount_cents)}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 2 }}>
                <Text style={[s.billAmt, { color: G.orange }]}>{fmt$(item.amount_cents)}</Text>
                {item.approval_status === 'pending' && (
                  <View style={[s.statusPill, { backgroundColor: 'rgba(251,191,36,0.12)' }]}>
                    <Text style={[s.statusPillTxt, { color: G.amber }]}>Awaiting approval</Text>
                  </View>
                )}
                {item.approval_status === 'auto_approved' && (
                  <View style={[s.statusPill, { backgroundColor: G.greenMuted }]}>
                    <Text style={[s.statusPillTxt, { color: G.green }]}>Auto-approved</Text>
                  </View>
                )}
                {item.approval_status === 'approved' && (
                  <View style={[s.statusPill, { backgroundColor: G.greenMuted }]}>
                    <Text style={[s.statusPillTxt, { color: G.green }]}>Approved</Text>
                  </View>
                )}
                {item.approval_status === 'rejected' && (
                  <View style={[s.statusPill, { backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                    <Text style={[s.statusPillTxt, { color: G.red }]}>Rejected</Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>
      ))}

      {/* Divider + running total */}
      <View style={[s.divider, { marginVertical: 12 }]} />
      <View style={s.billRow}>
        <Text style={[s.billLabel, { fontWeight: '800', color: G.txt }]}>Running Total</Text>
        <Text style={[s.billAmt, { fontSize: 22, color: G.orange }]}>{fmt$(total)}</Text>
      </View>

      {autoApproveUnder > 0 && (
        <Text style={s.billNote}>
          ⚡ Items under {fmt$(autoApproveUnder)} are auto-approved
        </Text>
      )}

      {/* Add Work */}
      <TouchableOpacity style={s.addWorkBtn} onPress={onAddWork} activeOpacity={0.8}>
        <Ionicons name="add-circle-outline" size={18} color={G.green} />
        <Text style={s.addWorkTxt}>Add Work / Change Order</Text>
      </TouchableOpacity>
    </SectionCard>
  );
}

// ─── ChecklistSection ─────────────────────────────────────────────────────────

function ChecklistSection({
  items, trade, woId, collapsed, onToggle,
  onAdd, onToggleItem,
}: {
  items: ProgressItem[]; trade: string; woId: string;
  collapsed: boolean; onToggle: () => void;
  onAdd: (label: string) => Promise<void>;
  onToggleItem: (id: string, done: boolean) => Promise<void>;
}) {
  const [newItem, setNewItem] = useState('');
  const [adding, setAdding] = useState(false);
  const doneCount = items.filter(i => i.is_done).length;

  async function handleAdd() {
    const label = newItem.trim();
    if (!label) return;
    setAdding(true);
    await onAdd(label);
    setNewItem('');
    setAdding(false);
  }

  const tpl = CHECKLIST_TEMPLATES[trade];

  async function applyTemplate() {
    if (!tpl) return;
    Alert.alert('Apply Template', `Load ${trade} template (${tpl.length} items)?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Apply', onPress: async () => {
          for (let i = 0; i < tpl.length; i++) {
            await supabase.from('work_progress_items').insert({
              work_order_id: woId, label: tpl[i], sort_order: (items.length + i),
            });
          }
        },
      },
    ]);
  }

  return (
    <SectionCard
      title="Checklist"
      icon="✅"
      badge={`${doneCount}/${items.length}`}
      collapsed={collapsed}
      onToggle={onToggle}
      accent={G.green}
    >
      {items.length === 0 && tpl && (
        <TouchableOpacity style={s.tplBtn} onPress={applyTemplate} activeOpacity={0.8}>
          <Text style={s.tplBtnTxt}>⚡ Load {trade} template ({tpl.length} items)</Text>
        </TouchableOpacity>
      )}

      {items.map(item => (
        <TouchableOpacity
          key={item.id}
          style={s.checkRow}
          onPress={() => onToggleItem(item.id, !item.is_done)}
          activeOpacity={0.75}
          accessibilityRole="checkbox"
          accessibilityLabel={item.label}
          accessibilityState={{ checked: item.is_done }}
          accessibilityHint={item.is_done ? 'Double tap to mark incomplete' : 'Double tap to mark complete'}
        >
          <View style={[s.checkBox, item.is_done && { backgroundColor: G.green, borderColor: G.green }]}>
            {item.is_done && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
          <Text style={[s.checkLabel, item.is_done && { color: G.txt3, textDecorationLine: 'line-through' }]}>
            {item.label}
          </Text>
          {item.done_at && (
            <Text style={s.checkTime}>{timeLabel(item.done_at)}</Text>
          )}
        </TouchableOpacity>
      ))}

      <View style={s.addRow}>
        <TextInput
          style={s.addInput}
          value={newItem}
          onChangeText={setNewItem}
          placeholder="Add item…"
          placeholderTextColor={G.txt3}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity
          style={s.addBtn}
          onPress={handleAdd}
          disabled={adding || !newItem.trim()}
          accessibilityRole="button"
          accessibilityLabel="Add checklist item"
        >
          {adding
            ? <ActivityIndicator size="small" color={G.green} />
            : <Ionicons name="add" size={20} color={G.green} />}
        </TouchableOpacity>
      </View>

      {items.length > 0 && tpl && (
        <TouchableOpacity onPress={applyTemplate} style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          <Text style={[s.billNote, { color: G.txt3 }]}>+ Load {trade} template</Text>
        </TouchableOpacity>
      )}
    </SectionCard>
  );
}

// ─── CustomerSection ──────────────────────────────────────────────────────────

function CustomerSection({
  wo, customer, collapsed, onToggle,
}: {
  wo: WoData; customer: any; collapsed: boolean; onToggle: () => void;
}) {
  const router = useRouter();
  const jobLat = wo.booking?.job_lat ?? null;
  const jobLng = wo.booking?.job_lng ?? null;
  const address = wo.job_address || wo.booking?.job_address || null;
  const avatarUrl = customer?.avatar_url?.trim() || null;
  const displayName = customer?.full_name ?? wo.customer_name ?? 'Customer';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const phone = customer?.phone ?? null;

  return (
    <SectionCard title="Customer & Location" icon="📍" collapsed={collapsed} onToggle={onToggle}>
      {/* Customer row */}
      <View style={s.custRow}>
        <View style={s.custAvatar}>
          {avatarUrl
            ? <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
            : <Text style={s.custInitials}>{initials}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.custName}>{displayName}</Text>
          {wo.booking?.customer_rating != null && (
            <Text style={s.custRating}>⭐ {wo.booking.customer_rating.toFixed(1)} customer</Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {phone && (
            <TouchableOpacity style={s.contactBtn} onPress={() => Linking.openURL(`tel:${phone}`)}>
              <Ionicons name="call-outline" size={18} color={G.green} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[s.contactBtn, { borderColor: 'rgba(255,98,0,0.3)', backgroundColor: 'rgba(255,98,0,0.12)' }]}
            onPress={() => router.push(`/work-order/chat?work_order_id=${wo.id}` as any)}
          >
            <Ionicons name="chatbubble-outline" size={18} color={G.orange} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Address + Navigate */}
      {address && (
        <View style={[s.addressCard, { backgroundColor: G.cardAlt, borderColor: G.greenGlow, borderWidth: 1 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.addressLabel}>JOB ADDRESS</Text>
            <Text style={s.addressTxt}>{address}</Text>
          </View>
          <TouchableOpacity
            style={s.navigateBtn}
            onPress={() => navigateTo(jobLat, jobLng, address)}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={16} color="#fff" />
            <Text style={s.navigateTxt}>Navigate</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Access notes — BIG and visible */}
      {(wo.gate_code || wo.pets_note || wo.parking_note || wo.special_instructions) && (
        <View style={s.accessCard}>
          <Text style={s.accessHeader}>ACCESS NOTES</Text>
          {wo.gate_code && (
            <View style={s.accessRow}>
              <Text style={s.accessIcon}>🔑</Text>
              <View>
                <Text style={s.accessKey}>Gate Code</Text>
                <Text style={s.accessVal}>{wo.gate_code}</Text>
              </View>
            </View>
          )}
          {wo.pets_note && (
            <View style={s.accessRow}>
              <Text style={s.accessIcon}>🐾</Text>
              <View>
                <Text style={s.accessKey}>Pets</Text>
                <Text style={s.accessVal}>{wo.pets_note}</Text>
              </View>
            </View>
          )}
          {wo.parking_note && (
            <View style={s.accessRow}>
              <Text style={s.accessIcon}>🅿️</Text>
              <View>
                <Text style={s.accessKey}>Parking</Text>
                <Text style={s.accessVal}>{wo.parking_note}</Text>
              </View>
            </View>
          )}
          {wo.special_instructions && (
            <View style={s.accessRow}>
              <Text style={s.accessIcon}>📝</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.accessKey}>Special Instructions</Text>
                <Text style={s.accessVal}>{wo.special_instructions}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      {/* Arrival window */}
      {(wo.scheduled_date || wo.arrival_window_start) && (
        <View style={[s.billRow, { marginTop: 8 }]}>
          <Ionicons name="calendar-outline" size={14} color={G.txt2} />
          <Text style={s.billLabel}>
            {wo.scheduled_date ?? ''}
            {wo.arrival_window_start
              ? `  ·  ${wo.arrival_window_start}${wo.arrival_window_end ? ` – ${wo.arrival_window_end}` : ''}`
              : ''}
          </Text>
        </View>
      )}
    </SectionCard>
  );
}

// ─── MapSection ───────────────────────────────────────────────────────────────

function MapSection({
  wo, myLoc, routeGeoJSON, eta, collapsed, onToggle,
}: {
  wo: WoData; myLoc: { lat: number; lng: number } | null;
  routeGeoJSON: object | null; eta: number | null;
  collapsed: boolean; onToggle: () => void;
}) {
  const jobLat = wo.booking?.job_lat;
  const jobLng = wo.booking?.job_lng;
  const address = wo.job_address || wo.booking?.job_address;
  const hasCoords = !!jobLat && !!jobLng;

  const bounds = useMemo(() => {
    if (!hasCoords || !myLoc) return null;
    const minLng = Math.min(myLoc.lng, jobLng!) - 0.005;
    const maxLng = Math.max(myLoc.lng, jobLng!) + 0.005;
    const minLat = Math.min(myLoc.lat, jobLat!) - 0.005;
    const maxLat = Math.max(myLoc.lat, jobLat!) + 0.005;
    return { ne: [maxLng, maxLat] as [number, number], sw: [minLng, minLat] as [number, number] };
  }, [myLoc, jobLat, jobLng, hasCoords]);

  return (
    <SectionCard title="Route Overview" icon="🗺️" collapsed={collapsed} onToggle={onToggle}>
      {eta != null && (
        <View style={s.etaChip}>
          <Text style={s.etaTxt}>ETA: {fmtEta(eta)}</Text>
        </View>
      )}

      {hasCoords ? (
        <View style={s.mapWrap}>
          <MapboxGL.MapView
            style={s.map}
            styleURL={MapboxGL.StyleURL.Dark}
            pitchEnabled={false}
            rotateEnabled={false}
            scrollEnabled={false}
            zoomEnabled={false}
          >
            {bounds ? (
              <MapboxGL.Camera
                bounds={bounds}
                padding={{ paddingLeft: 32, paddingRight: 32, paddingTop: 32, paddingBottom: 32 }}
                animationMode="none"
              />
            ) : (
              <MapboxGL.Camera
                centerCoordinate={[jobLng!, jobLat!]}
                zoomLevel={13}
                animationMode="none"
              />
            )}

            {routeGeoJSON && (
              <MapboxGL.ShapeSource id="route" shape={{ type: 'Feature', properties: {}, geometry: routeGeoJSON } as any}>
                <MapboxGL.LineLayer
                  id="routeLine"
                  style={{ lineColor: G.green, lineWidth: 3.5, lineOpacity: 0.9 }}
                />
              </MapboxGL.ShapeSource>
            )}

            {/* Job pin */}
            <MapboxGL.PointAnnotation id="jobPin" coordinate={[jobLng!, jobLat!]}>
              <View style={s.mapPin}>
                <View style={s.mapPinInner} />
              </View>
            </MapboxGL.PointAnnotation>

            {/* Contractor current position */}
            {myLoc && (
              <MapboxGL.PointAnnotation id="myPin" coordinate={[myLoc.lng, myLoc.lat]}>
                <View style={s.myPin} />
              </MapboxGL.PointAnnotation>
            )}
          </MapboxGL.MapView>

          <TouchableOpacity
            style={s.mapNavBtn}
            onPress={() => navigateTo(jobLat!, jobLng!, address ?? null)}
            activeOpacity={0.85}
          >
            <Ionicons name="navigate" size={16} color="#fff" />
            <Text style={s.mapNavTxt}>Navigate</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={s.mapPlaceholder}>
          <Text style={s.mapPlaceholderTxt}>
            {address ?? 'No address on file'}
          </Text>
          {address && (
            <TouchableOpacity style={[s.mapNavBtn, { position: 'relative', bottom: 0, right: 0, marginTop: 10 }]}
              onPress={() => navigateTo(null, null, address)}>
              <Ionicons name="navigate" size={16} color="#fff" />
              <Text style={s.mapNavTxt}>Navigate</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </SectionCard>
  );
}

// ─── MediaSection ─────────────────────────────────────────────────────────────

function MediaSection({
  items, woId, collapsed, onToggle, onUploaded,
}: {
  items: WoMedia[]; woId: string; collapsed: boolean; onToggle: () => void;
  onUploaded: (m: WoMedia) => void;
}) {
  const [kind, setKind] = useState<MediaKind>('before');
  const [uploading, setUploading] = useState(false);
  const { user } = useAuth();

  async function pickAndUpload(fromCamera: boolean) {
    const perm = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', fromCamera ? 'Allow camera access.' : 'Allow photo library access.');
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.85, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: false });

    if (result.canceled || !result.assets[0]) return;
    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `${woId}/${kind}/${Date.now()}.${ext}`;
      const blob = await (await fetch(asset.uri)).blob();
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';

      const { error: upErr } = await supabase.storage.from('work-orders').upload(path, blob, { contentType: mime, upsert: false });
      if (upErr) throw upErr;

      const { data: signedData } = await supabase.storage.from('work-orders').createSignedUrl(path, 3600);
      const { data: row, error: dbErr } = await supabase.from('work_order_media').insert({
        work_order_id: woId, kind, storage_path: path, uploaded_by: user!.id,
      }).select().single();
      if (dbErr) throw dbErr;

      onUploaded({ ...row, _publicUrl: signedData?.signedUrl ?? null });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Try again.');
    }
    setUploading(false);
  }

  function promptUpload() {
    Alert.alert('Add Photo', '', [
      { text: 'Camera', onPress: () => pickAndUpload(true) },
      { text: 'Photo Library', onPress: () => pickAndUpload(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const byKind = MEDIA_KINDS.map(k => ({ k, items: items.filter(m => m.kind === k) })).filter(g => g.items.length > 0 || g.k === kind);

  return (
    <SectionCard title="Photos" icon="📷" badge={items.length || undefined} collapsed={collapsed} onToggle={onToggle}>
      {/* Kind selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
        {MEDIA_KINDS.map(k => (
          <TouchableOpacity
            key={k}
            style={[s.kindChip, kind === k && s.kindChipActive]}
            onPress={() => setKind(k)}
          >
            <Text style={[s.kindChipTxt, kind === k && s.kindChipTxtActive]}>
              {k.charAt(0).toUpperCase() + k.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Gallery */}
      {byKind.map(({ k, items: kItems }) => kItems.length > 0 && (
        <View key={k} style={{ marginBottom: 12 }}>
          <Text style={s.billGroupLabel}>{k.toUpperCase()}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 6 }}>
            {kItems.map(m => (
              <Image
                key={m.id}
                source={{ uri: m._publicUrl }}
                style={s.photoThumb}
              />
            ))}
          </ScrollView>
        </View>
      ))}

      {/* Upload button */}
      <TouchableOpacity
        style={s.cameraBtn}
        onPress={promptUpload}
        disabled={uploading}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Add ${kind} photo`}
      >
        {uploading
          ? <ActivityIndicator color={G.green} />
          : <>
              <Ionicons name="camera" size={20} color={G.green} />
              <Text style={s.cameraBtnTxt}>Add {kind.charAt(0).toUpperCase() + kind.slice(1)} Photo</Text>
            </>
        }
      </TouchableOpacity>
    </SectionCard>
  );
}

// ─── TimelineSection ──────────────────────────────────────────────────────────

function TimelineSection({ events, collapsed, onToggle }: { events: WoEvent[]; collapsed: boolean; onToggle: () => void }) {
  return (
    <SectionCard title="Timeline" icon="🕐" badge={events.length || undefined} collapsed={collapsed} onToggle={onToggle}>
      {events.length === 0 ? (
        <Text style={[s.billNote, { textAlign: 'center', paddingVertical: 8 }]}>No events yet.</Text>
      ) : (
        events.map((ev, i) => (
          <View key={ev.id} style={[s.timelineRow, i < events.length - 1 && s.timelineRowBorder]}>
            <View style={[s.timelineDot, { backgroundColor: ev.actor_role === 'system' ? G.txt3 : G.green }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.timelineLabel}>{ev.label}</Text>
              <Text style={s.timelineTime}>{timeLabel(ev.created_at)}</Text>
            </View>
          </View>
        ))
      )}
    </SectionCard>
  );
}

// ─── PaymentSection ───────────────────────────────────────────────────────────

function PaymentSection({ pi, basePrice, collapsed, onToggle }: { pi: PaymentIntent | null; basePrice: number; collapsed: boolean; onToggle: () => void }) {
  const held = pi?.amount_cents ?? basePrice * 100;
  const piStatus = pi?.status ?? 'pending_hold';

  const statusColor: Record<string, string> = {
    held: G.green, in_progress: G.blue, contractor_completed: G.amber,
    customer_finished: G.orange, captured: G.green, released: G.txt3,
  };

  return (
    <SectionCard title="Payment" icon="💳" collapsed={collapsed} onToggle={onToggle}>
      <View style={[s.payCard, { borderColor: G.greenGlow }]}>
        <Text style={s.payLabel}>CUSTOMER'S CARD HOLD</Text>
        <Text style={[s.payAmt, { color: G.orange }]}>{fmt$(held)}</Text>
        <Text style={s.payNote}>
          This amount is protected on the customer's card. Funds release to you once the customer approves the completed work.
        </Text>
        <View style={[s.statusPill, { alignSelf: 'flex-start', marginTop: 8, backgroundColor: `${statusColor[piStatus] ?? G.txt3}20` }]}>
          <Text style={[s.statusPillTxt, { color: statusColor[piStatus] ?? G.txt3 }]}>
            {piStatus.replace(/_/g, ' ')}
          </Text>
        </View>
      </View>
    </SectionCard>
  );
}

// ─── SupportSection ───────────────────────────────────────────────────────────

function SupportSection({ wo, collapsed, onToggle }: { wo: WoData; collapsed: boolean; onToggle: () => void }) {
  const canDispute = ['awaiting_approval', 'payment_releasing', 'completed'].includes(wo.wo_status);
  const [disputing, setDisputing] = useState(false);

  async function openDispute() {
    Alert.alert(
      'Open a Dispute',
      'This will notify Tradease and pause payment release. You can describe the issue by email.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Dispute', style: 'destructive',
          onPress: async () => {
            setDisputing(true);
            const { error } = await supabase.functions.invoke('work-order-dispute', {
              body: { work_order_id: wo.id, reason: 'Contractor opened dispute' },
            });
            setDisputing(false);
            if (error) { Alert.alert('Error', 'Could not open dispute. Please email support@tradease.app'); return; }
            Alert.alert('Dispute Opened', 'Our team will review within 24 hours.');
          },
        },
      ]
    );
  }

  function reportIssue() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Report a Safety Issue', 'Report a Quality Issue', 'Other', 'Cancel'], cancelButtonIndex: 3 },
        (i) => { if (i < 3) Linking.openURL(`mailto:support@tradease.app?subject=Issue%20Report%20%E2%80%94%20${wo.work_order_number}`); }
      );
    } else {
      Linking.openURL(`mailto:support@tradease.app?subject=Issue%20Report%20%E2%80%94%20${wo.work_order_number}`);
    }
  }

  return (
    <SectionCard title="Help & Support" icon="🛟" collapsed={collapsed} onToggle={onToggle}>
      <TouchableOpacity style={s.supportRow} onPress={reportIssue}>
        <Ionicons name="flag-outline" size={18} color={G.amber} />
        <View style={{ flex: 1 }}>
          <Text style={[s.supportLabel, { color: G.amber }]}>Report an Issue</Text>
          <Text style={s.supportSub}>Safety, quality concerns, or anything else</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={G.txt3} />
      </TouchableOpacity>

      <View style={s.divider} />

      <TouchableOpacity
        style={[s.supportRow, !canDispute && { opacity: 0.4 }]}
        onPress={canDispute ? openDispute : undefined}
        disabled={!canDispute || disputing}
      >
        {disputing
          ? <ActivityIndicator size="small" color={G.red} />
          : <Ionicons name="alert-circle-outline" size={18} color={G.red} />
        }
        <View style={{ flex: 1 }}>
          <Text style={[s.supportLabel, { color: G.red }]}>Open a Dispute</Text>
          <Text style={s.supportSub}>
            {canDispute ? 'Pause payment and escalate to Tradease' : 'Available after the job is marked complete'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={G.txt3} />
      </TouchableOpacity>

      <View style={[s.divider, { marginVertical: 4 }]} />

      <TouchableOpacity style={s.supportRow} onPress={() => Linking.openURL('mailto:support@tradease.app')}>
        <Ionicons name="mail-outline" size={18} color={G.txt2} />
        <View style={{ flex: 1 }}>
          <Text style={s.supportLabel}>Contact Tradease Support</Text>
          <Text style={s.supportSub}>support@tradease.app</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={G.txt3} />
      </TouchableOpacity>
    </SectionCard>
  );
}

// ─── Change Order Modal ───────────────────────────────────────────────────────

function ChangeOrderModal({
  visible, woId, autoApproveUnder, contractorId, onClose, onSubmitted,
}: {
  visible: boolean; woId: string; autoApproveUnder: number;
  contractorId: string; onClose: () => void; onSubmitted: () => void;
}) {
  const [desc, setDesc]     = useState('');
  const [itemType, setType] = useState<string>('labor');
  const [qty, setQty]       = useState('1');
  const [price, setPrice]   = useState('');
  const [saving, setSaving] = useState(false);

  function reset() { setDesc(''); setType('labor'); setQty('1'); setPrice(''); }

  const totalCents = Math.round((parseFloat(qty) || 1) * (parseFloat(price) || 0) * 100);
  const willAutoApprove = autoApproveUnder > 0 && totalCents > 0 && totalCents <= autoApproveUnder;

  async function submit() {
    if (!desc.trim()) { Alert.alert('', 'Describe the additional work.'); return; }
    if (totalCents <= 0) { Alert.alert('', 'Enter the unit price.'); return; }
    setSaving(true);
    const { error } = await supabase.from('payment_line_items').insert({
      work_order_id:    woId,
      label:            desc.trim(),
      quantity:         parseFloat(qty) || 1,
      unit_price_cents: Math.round((parseFloat(price) || 0) * 100),
      amount_cents:     totalCents,
      item_type:        itemType,
      requires_approval: !willAutoApprove,
      approval_status:  willAutoApprove ? 'auto_approved' : 'pending',
      added_by:         contractorId,
    });
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    reset();
    onSubmitted();
    onClose();
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: 'flex-end' }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} />
        <View style={m.sheet}>
          <View style={m.handle} />
          <Text style={m.title}>Add Work</Text>
          <Text style={m.subtitle}>Describe first — then price.</Text>

          {/* Description — first and biggest */}
          <TextInput
            style={m.descInput}
            value={desc}
            onChangeText={setDesc}
            placeholder="What additional work is needed?"
            placeholderTextColor={G.txt3}
            multiline
            numberOfLines={3}
            autoFocus
            textAlignVertical="top"
          />

          {/* Item type */}
          <Text style={m.label}>TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }} contentContainerStyle={{ gap: 8 }}>
            {ITEM_TYPES.map(t => (
              <TouchableOpacity key={t.v} style={[m.typeChip, itemType === t.v && m.typeChipActive]} onPress={() => setType(t.v)}>
                <Text style={[m.typeChipTxt, itemType === t.v && m.typeChipTxtActive]}>{t.l}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Qty + unit price */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: 80 }}>
              <Text style={m.label}>QTY</Text>
              <TextInput style={m.input} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={m.label}>UNIT PRICE</Text>
              <View style={[m.input, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12 }]}>
                <Text style={{ color: G.txt2, fontSize: 16, marginRight: 4 }}>$</Text>
                <TextInput
                  style={{ flex: 1, color: G.txt, fontSize: 17, fontWeight: '700', paddingVertical: 0 }}
                  value={price}
                  onChangeText={setPrice}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={G.txt3}
                />
              </View>
            </View>
          </View>

          {/* Total */}
          {totalCents > 0 && (
            <View style={[s.billRow, { marginTop: 12 }]}>
              <Text style={[s.billLabel, { fontWeight: '700' }]}>Total</Text>
              <Text style={[s.billAmt, { color: G.orange, fontSize: 20 }]}>{fmt$(totalCents)}</Text>
            </View>
          )}

          {willAutoApprove && (
            <Text style={[s.billNote, { color: G.green, marginTop: 4 }]}>
              ⚡ Under {fmt$(autoApproveUnder)} threshold — will be auto-approved
            </Text>
          )}
          {!willAutoApprove && totalCents > 0 && (
            <Text style={[s.billNote, { marginTop: 4 }]}>
              Customer will be notified to approve this change order.
            </Text>
          )}

          <TouchableOpacity style={[m.submitBtn, saving && { opacity: 0.5 }]} onPress={submit} disabled={saving} activeOpacity={0.85}>
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={m.submitTxt}>
                  {willAutoApprove ? 'Add (Auto-approved)' : 'Request Approval'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ContractorWorkOrderScreen() {
  const { id: paramId, booking_id: paramBookingId } = useLocalSearchParams<{ id?: string; booking_id?: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const { user } = useAuth();

  // ── Data state ────────────────────────────────────────────────────────────
  const [wo,          setWo]          = useState<WoData | null>(null);
  const [customer,    setCustomer]    = useState<any>(null);
  const [lineItems,   setLineItems]   = useState<LineItem[]>([]);
  const [progressItems, setProgress] = useState<ProgressItem[]>([]);
  const [events,      setEvents]      = useState<WoEvent[]>([]);
  const [media,       setMedia]       = useState<WoMedia[]>([]);
  const [paymentIntent, setPI]        = useState<PaymentIntent | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [loading,      setLoading]      = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [showCO,       setShowCO]       = useState(false);
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(
    new Set(['timeline', 'payment', 'map', 'support'] as SectionKey[])
  );

  // ── Location / map ────────────────────────────────────────────────────────
  const [myLoc,       setMyLoc]       = useState<{ lat: number; lng: number } | null>(null);
  const [routeGeoJSON, setRouteGeoJSON] = useState<object | null>(null);
  const [etaSec,      setEtaSec]      = useState<number | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const arrivalAlertedRef = useRef(false);

  // ── Elapsed timer ─────────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Countdown clock (ticks every 30s for scheduled-window display) ─────────
  const [now, setNow] = useState(() => new Date());

  // ── Payday overlay (shown when Realtime fires completed) ───────────────────
  const [showPayday, setShowPayday] = useState(false);
  const [paydayCents, setPaydayCents] = useState(0);

  // ── Add to Portfolio prompt ──────────────────────────────────────────────
  const [portfolioPromptDismissed, setPortfolioPromptDismissed] = useState(false);
  const [showPortfolioCuration,    setShowPortfolioCuration]    = useState(false);
  const [portfolioSelectedIds,     setPortfolioSelectedIds]     = useState<Set<string>>(new Set());
  const [portfolioTitle,           setPortfolioTitle]           = useState('');
  const [portfolioDescription,     setPortfolioDescription]     = useState('');
  const [portfolioPublishing,      setPortfolioPublishing]      = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Load
  // ─────────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const filter = paramId
      ? { col: 'id', val: paramId }
      : { col: 'booking_id', val: paramBookingId! };

    const { data: woData } = await supabase
      .from('work_orders')
      .select('*, booking:bookings(trade,description,price_estimate,customer_id,customer_name,customer_rating,job_lat,job_lng,job_address,notes)')
      .eq(filter.col, filter.val)
      .maybeSingle();

    if (!woData) { setLoading(false); return; }
    setWo(woData);

    const [custRes, liRes, piRes, progRes, evRes, mediaRes] = await Promise.all([
      supabase.from('users').select('id,full_name,avatar_url,phone').eq('id', woData.customer_id).maybeSingle(),
      supabase.from('payment_line_items').select('*').eq('work_order_id', woData.id).order('created_at'),
      woData.payment_intent_id
        ? supabase.from('payment_intents').select('id,status,amount_cents,captured_at').eq('id', woData.payment_intent_id).maybeSingle()
        : { data: null },
      supabase.from('work_progress_items').select('*').eq('work_order_id', woData.id).order('sort_order'),
      supabase.from('work_order_events').select('*').eq('work_order_id', woData.id).order('created_at', { ascending: false }),
      supabase.from('work_order_media').select('*').eq('work_order_id', woData.id).order('created_at'),
    ]);

    setCustomer(custRes.data ?? null);
    setLineItems((liRes.data ?? []) as LineItem[]);
    setPI(piRes.data ?? null);
    setProgress((progRes.data ?? []) as ProgressItem[]);
    setEvents((evRes.data ?? []) as WoEvent[]);

    // Attach signed URLs to media
    const mediaWithUrls = await Promise.all((mediaRes.data ?? []).map(async (m: any) => ({
      ...m,
      _publicUrl: (await supabase.storage.from('work-orders').createSignedUrl(m.storage_path, 3600)).data?.signedUrl ?? null,
    })));
    setMedia(mediaWithUrls as WoMedia[]);
    setLoading(false);
  }, [paramId, paramBookingId]);

  useEffect(() => { load(); }, [load]);

  // Flush queued offline mutations on app foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        flushOfflineQueue().then(({ flushed }) => {
          if (flushed > 0) showToast({ type: 'success', title: `${flushed} offline change${flushed > 1 ? 's' : ''} synced` });
        });
      }
    });
    return () => sub.remove();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime subscriptions
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wo?.id) return;

    const channelName = `wo_contractor_${wo.id}`;

    // Purge any stale channel with the same name before subscribing.
    // React StrictMode double-invokes effects; Supabase throws if .on() is
    // called on an already-subscribed channel, which is what caused the
    // "cannot add postgres_changes callbacks after subscribe()" crash.
    supabase.getChannels().forEach(ch => {
      if (ch.topic === `realtime:${channelName}`) supabase.removeChannel(ch);
    });

    const ch = supabase
      .channel(channelName)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'work_orders', filter: `id=eq.${wo.id}` },
        (p) => {
          const updated = p.new as any;
          setWo(prev => prev ? { ...prev, ...updated } : prev);
          if (updated.wo_status === 'completed') {
            supabase.from('payment_intents').select('id,status,amount_cents,captured_at').eq('id', updated.payment_intent_id ?? '').maybeSingle()
              .then(({ data }) => {
                setPI(data ?? null);
                setPaydayCents(data?.amount_cents ?? 0);
                setShowPayday(true);
              });
          }
        })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_events', filter: `work_order_id=eq.${wo.id}` },
        () => supabase.from('work_order_events').select('*').eq('work_order_id', wo.id).order('created_at', { ascending: false })
               .then(({ data }) => data && setEvents(data as WoEvent[])))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_progress_items', filter: `work_order_id=eq.${wo.id}` },
        () => supabase.from('work_progress_items').select('*').eq('work_order_id', wo.id).order('sort_order')
               .then(({ data }) => data && setProgress(data as ProgressItem[])))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_line_items', filter: `work_order_id=eq.${wo.id}` },
        () => supabase.from('payment_line_items').select('*').eq('work_order_id', wo.id).order('created_at')
               .then(({ data }) => data && setLineItems(data as LineItem[])))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [wo?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Elapsed timer (in_progress only)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (wo?.wo_status !== 'in_progress') {
      setElapsed(0);
      if (elapsedRef.current) { clearInterval(elapsedRef.current); elapsedRef.current = null; }
      return;
    }
    const startEvent = events.find(e => (e.payload as any)?.to === 'in_progress');
    const startMs = startEvent ? new Date(startEvent.created_at).getTime() : Date.now();
    setElapsed(Math.floor((Date.now() - startMs) / 1000));
    elapsedRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => { if (elapsedRef.current) clearInterval(elapsedRef.current); };
  }, [wo?.wo_status, events]);

  // ── Countdown clock ticker ────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Location tracking (active during en_route only)
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wo?.id) return;
    const active = wo.wo_status === 'en_route';
    if (!active) {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      return;
    }
    const jobLat = wo.booking?.job_lat;
    const jobLng = wo.booking?.job_lng;

    (async () => {
      const { status: fPerm } = await Location.requestForegroundPermissionsAsync();
      if (fPerm !== 'granted') {
        Alert.alert('Location needed', 'Allow location access to track your route to the job.');
        return;
      }
      await Location.requestBackgroundPermissionsAsync(); // best-effort, OK if denied

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 25 },
        async (loc) => {
          const { latitude, longitude, heading } = loc.coords;
          setMyLoc({ lat: latitude, lng: longitude });

          // UPSERT location
          await supabase.from('contractor_locations').upsert({
            contractor_id: user!.id,
            work_order_id: wo.id,
            lat: latitude,
            lng: longitude,
            heading: heading ?? null,
            is_online: true,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'contractor_id' });

          // Arrival geofence — 150m
          if (jobLat && jobLng && !arrivalAlertedRef.current) {
            const dist = haversineM(latitude, longitude, jobLat, jobLng);
            if (dist <= 150) {
              arrivalAlertedRef.current = true;
              Alert.alert(
                "Looks like you've arrived!",
                'Update your status to Arrived?',
                [
                  { text: 'Not yet', style: 'cancel' },
                  { text: 'Yes, arrived', onPress: () => transition('arrived') },
                ]
              );
            }
          }
        }
      );
    })();

    return () => {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
    };
  }, [wo?.wo_status, wo?.id, user?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Fetch route whenever myLoc updates during en_route
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (wo?.wo_status !== 'en_route' || !myLoc) return;
    const jobLat = wo.booking?.job_lat, jobLng = wo.booking?.job_lng;
    if (!jobLat || !jobLng) return;
    fetchRoute(myLoc.lat, myLoc.lng, jobLat, jobLng).then(r => {
      if (!r) return;
      setRouteGeoJSON(r.geometry);
      setEtaSec(r.duration);
    });
  }, [myLoc, wo?.wo_status]);

  // ─────────────────────────────────────────────────────────────────────────
  // Transition helper
  // ─────────────────────────────────────────────────────────────────────────
  const transition = useCallback(async (nextStatus: WoStatus, extra?: object) => {
    if (!wo) return;
    setTransitioning(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const { data, error } = await supabase.functions.invoke('work-order-transition', {
        body: { work_order_id: wo.id, new_status: nextStatus, extra_columns: extra ?? {} },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setWo(prev => prev ? { ...prev, wo_status: nextStatus } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Auto-expand map on en_route, collapse it on arrived
      if (nextStatus === 'en_route') {
        setCollapsed(prev => { const n = new Set(prev); n.delete('map'); return n; });
        arrivalAlertedRef.current = false;
      }
      if (nextStatus === 'arrived') {
        locationSubRef.current?.remove(); locationSubRef.current = null;
        setCollapsed(prev => { const n = new Set(prev); n.add('map'); return n; });
      }
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Could not update status. Try again.');
    }
    setTransitioning(false);
  }, [wo]);

  // ─────────────────────────────────────────────────────────────────────────
  // Early start request
  // ─────────────────────────────────────────────────────────────────────────
  const requestEarlyStart = useCallback(async () => {
    if (!wo) return;
    try {
      const { data, error } = await supabase.functions.invoke('work-order-transition', {
        body: { work_order_id: wo.id, new_status: 'early_start_request' },
      });
      if (error || data?.error) throw new Error(data?.error ?? error?.message);
      setWo(prev => prev ? { ...prev, early_start_requested: true } : prev);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast({ type: 'success', title: 'Early start requested', message: 'Customer has been notified.' });
    } catch (e: any) {
      showToast({ type: 'error', title: 'Request failed', message: e.message });
    }
  }, [wo]);

  // ─────────────────────────────────────────────────────────────────────────
  // Overflow sheet (secondary actions)
  // ─────────────────────────────────────────────────────────────────────────
  function showOverflow() {
    if (!wo) return;
    const opts: { text: string; onPress: () => void; style?: 'destructive' | 'cancel' }[] = [];
    if (wo.wo_status === 'in_progress') {
      opts.push({ text: 'Waiting on Customer', onPress: () => transition('waiting_for_customer') });
      opts.push({ text: 'Need Materials', onPress: () => transition('materials_needed') });
    }
    const cancelable = ['submitted', 'accepted', 'deposit_secured', 'en_route', 'arrived', 'in_progress',
                        'waiting_for_customer', 'materials_needed'];
    if (cancelable.includes(wo.wo_status)) {
      opts.push({
        text: 'Cancel Job', style: 'destructive',
        onPress: () => Alert.alert('Cancel Job', 'Are you sure you want to cancel this job?', [
          { text: 'Keep Job', style: 'cancel' },
          { text: 'Cancel Job', style: 'destructive', onPress: () => transition('cancelled') },
        ]),
      });
    }
    if (opts.length === 0) return;
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...opts.map(o => o.text), 'Cancel'],
          destructiveButtonIndex: opts.findIndex(o => o.style === 'destructive'),
          cancelButtonIndex: opts.length,
        },
        (i) => { if (i < opts.length) opts[i].onPress(); }
      );
    } else {
      Alert.alert('Options', '', [
        ...opts.map(o => ({ text: o.text, style: o.style, onPress: o.onPress })),
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Checklist handlers
  // ─────────────────────────────────────────────────────────────────────────
  const addProgressItem = useCallback(async (label: string) => {
    if (!wo) return;
    const tempId = `temp_${Date.now()}`;
    const sortOrder = progressItems.length;
    // Optimistic add
    setProgress(prev => [...prev, { id: tempId, label, sort_order: sortOrder, is_done: false, done_at: null }]);

    const { data, error } = await supabase.from('work_progress_items').insert({
      work_order_id: wo.id, label, sort_order: sortOrder,
    }).select().single();

    if (error) {
      await enqueueOffline({ kind: 'checklist_add', work_order_id: wo.id, label, sort_order: sortOrder });
      showToast({ type: 'warning', title: 'Saved offline', message: 'Will sync when connection returns.' });
    } else if (data) {
      setProgress(prev => prev.map(p => p.id === tempId ? (data as ProgressItem) : p));
    }
  }, [wo, progressItems.length]);

  const toggleProgressItem = useCallback(async (id: string, done: boolean) => {
    // Optimistic update immediately
    setProgress(prev => prev.map(p => p.id === id ? { ...p, is_done: done, done_at: done ? new Date().toISOString() : null } : p));
    Haptics.impactAsync(done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Soft);

    const { error } = await supabase.from('work_progress_items').update({ is_done: done }).eq('id', id);
    if (error) {
      await enqueueOffline({ kind: 'checklist_check', work_order_id: wo?.id ?? '', item_id: id, completed: done });
      showToast({ type: 'warning', title: 'Saved offline', message: 'Will sync when connection returns.' });
    }
  }, [wo?.id]);

  // ─────────────────────────────────────────────────────────────────────────
  // Section toggle
  // ─────────────────────────────────────────────────────────────────────────
  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsed(prev => {
      const n = new Set(prev);
      n.has(key) ? n.delete(key) : n.add(key);
      return n;
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.container}>
        <View style={[s.header, { paddingTop: insets.top + 6 }]}>
          <Skeleton width={32} height={32} borderRadius={8} />
          <View style={{ flex: 1, marginHorizontal: 12 }}>
            <Skeleton width="50%" height={14} style={{ marginBottom: 6 }} />
            <Skeleton width="35%" height={12} />
          </View>
          <Skeleton width={60} height={24} borderRadius={12} />
        </View>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8 }}>
          <SkeletonSectionCard />
          <SkeletonBillSection />
          <SkeletonChecklist />
          <SkeletonSectionCard />
        </ScrollView>
      </View>
    );
  }

  if (!wo) {
    return (
      <View style={s.container}>
        <View style={s.center}>
          <Text style={s.txt2}>Work order not found.</Text>
          <TouchableOpacity style={{ marginTop: 16 }} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={{ color: G.green, fontWeight: '700' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const action    = usePrimaryAction(wo, now);
  const basePrice = wo.booking?.price_estimate ?? 0;
  const trade     = wo.booking?.trade ?? wo.service_type ?? '';
  const isActive  = wo.wo_status === 'in_progress';
  const FOOTER_H  = action.kind === 'countdown' ? 210 + insets.bottom : 100 + insets.bottom;

  // Both required — completed alone doesn't mean payment was ever captured.
  const canAddToPortfolio = wo.wo_status === 'completed' && paymentIntent?.status === 'captured';

  // Same formula BillSection displays to the contractor — the real final price,
  // not payment_intents.amount_cents (which can be stale/zero if capture was skipped).
  const approvedLineItemsTotal = lineItems
    .filter(i => i.approval_status !== 'rejected')
    .reduce((s, i) => s + i.amount_cents, 0);
  const jobTotalCents = basePrice * 100 + approvedLineItemsTotal;

  // City only — never the street address.
  const generalLocation = (() => {
    const addr = wo.booking?.job_address;
    if (!addr) return null;
    const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
    return parts.length >= 2 ? parts[parts.length - 2] : (parts[0] ?? null);
  })();

  // Never receipt/document — those aren't safe to show publicly.
  const portfolioMedia = media.filter(m => m.kind === 'before' || m.kind === 'after' || m.kind === 'progress');

  function openPortfolioCuration() {
    setPortfolioSelectedIds(new Set(portfolioMedia.filter(m => m.kind === 'after').map(m => m.id)));
    setPortfolioTitle(trade);
    setPortfolioDescription('');
    setShowPortfolioCuration(true);
  }

  function togglePortfolioPhoto(id: string) {
    setPortfolioSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function publishToPortfolio() {
    if (!wo || !user) return;
    const selected = portfolioMedia.filter(m => portfolioSelectedIds.has(m.id));
    if (selected.length === 0) {
      Alert.alert('Pick at least one photo', 'Select at least one before/after photo to publish.');
      return;
    }
    setPortfolioPublishing(true);
    try {
      const photoUrls: string[] = [];
      for (const item of selected) {
        if (!item._publicUrl) continue;
        const blob = await (await fetch(item._publicUrl)).blob();
        const ext  = item.storage_path.split('.').pop()?.toLowerCase() ?? 'jpg';
        const path = `${user.id}/${wo.id}/${item.id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('portfolio-completed')
          .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('portfolio-completed').getPublicUrl(path);
        if (urlData?.publicUrl) photoUrls.push(urlData.publicUrl);
      }

      const { error: insErr } = await supabase.from('portfolio_jobs').insert({
        contractor_id:            user.id,
        original_work_order_id:   wo.id,
        service_type:             wo.service_type ?? trade,
        title:                    portfolioTitle.trim() || trade,
        description:              portfolioDescription.trim() || null,
        completed_price:          jobTotalCents / 100,
        completed_at:             paymentIntent?.captured_at ?? new Date().toISOString(),
        general_location:         generalLocation,
        photos:                   photoUrls,
        is_published:             true,
      });
      if (insErr) throw insErr;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowPortfolioCuration(false);
      setPortfolioPromptDismissed(true);
      showToast({ type: 'success', title: 'Added to your portfolio' });
    } catch (e: any) {
      Alert.alert('Could not publish', e.message ?? 'Try again.');
    } finally {
      setPortfolioPublishing(false);
    }
  }

  function renderSection({ item: key }: { item: SectionKey }) {
    switch (key) {
      case 'stepper':
        return <StepperSection status={wo!.wo_status} />;
      case 'bill':
        return (
          <BillSection
            items={lineItems}
            basePrice={basePrice}
            autoApproveUnder={wo!.auto_approve_under_cents}
            onAddWork={() => setShowCO(true)}
            collapsed={collapsed.has('bill')}
            onToggle={() => toggleSection('bill')}
          />
        );
      case 'checklist':
        return (
          <ChecklistSection
            items={progressItems}
            trade={trade}
            woId={wo!.id}
            collapsed={collapsed.has('checklist')}
            onToggle={() => toggleSection('checklist')}
            onAdd={addProgressItem}
            onToggleItem={toggleProgressItem}
          />
        );
      case 'customer':
        return (
          <CustomerSection
            wo={wo!}
            customer={customer}
            collapsed={collapsed.has('customer')}
            onToggle={() => toggleSection('customer')}
          />
        );
      case 'map':
        return (
          <MapSection
            wo={wo!}
            myLoc={myLoc}
            routeGeoJSON={routeGeoJSON}
            eta={etaSec}
            collapsed={collapsed.has('map')}
            onToggle={() => toggleSection('map')}
          />
        );
      case 'media':
        return (
          <MediaSection
            items={media}
            woId={wo!.id}
            collapsed={collapsed.has('media')}
            onToggle={() => toggleSection('media')}
            onUploaded={(m) => setMedia(prev => [...prev, m])}
          />
        );
      case 'timeline':
        return (
          <TimelineSection
            events={events}
            collapsed={collapsed.has('timeline')}
            onToggle={() => toggleSection('timeline')}
          />
        );
      case 'payment':
        return (
          <PaymentSection
            pi={paymentIntent}
            basePrice={basePrice}
            collapsed={collapsed.has('payment')}
            onToggle={() => toggleSection('payment')}
          />
        );
      case 'support':
        return (
          <SupportSection
            wo={wo!}
            collapsed={collapsed.has('support')}
            onToggle={() => toggleSection('support')}
          />
        );
      default:
        return null;
    }
  }

  return (
    <View style={s.container}>

      {/* ── Fixed header ───────────────────────────────────────────────────── */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={G.txt} />
        </TouchableOpacity>

        <View style={s.headerCenter}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={s.woNum}>{wo.work_order_number}</Text>
            {wo.is_emergency && (
              <View style={[s.pill, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)' }]}>
                <Text style={[s.pillTxt, { color: G.red }]}>🚨 ASAP</Text>
              </View>
            )}
          </View>
          <Text style={s.tradeTxt}>{trade}</Text>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {isActive && (
            <View style={[s.pill, { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: G.greenGlow }]}>
              <View style={[s.liveDot, { backgroundColor: G.green }]} />
              <Text style={[s.pillTxt, { color: G.green }]}>{fmtElapsed(elapsed)}</Text>
            </View>
          )}
          <View style={[s.statusDot, { backgroundColor: `${G.green}20` }]}>
            <View style={[s.statusDotInner, {
              backgroundColor: wo.wo_status === 'cancelled' ? G.red : wo.wo_status === 'completed' ? G.green : G.green,
            }]} />
          </View>
        </View>
      </View>

      {/* ── Sections FlatList ──────────────────────────────────────────────── */}
      <FlatList
        data={ALL_SECTIONS}
        keyExtractor={k => k}
        renderItem={renderSection}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: FOOTER_H, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          canAddToPortfolio && !portfolioPromptDismissed ? (
            <View style={s.portfolioCard}>
              <Text style={s.portfolioCardTitle}>Add this job to your portfolio?</Text>
              <Text style={s.portfolioCardSub}>
                Show this completed job on your public profile to help win future customers.
              </Text>
              <View style={s.portfolioBtnRow}>
                <TouchableOpacity style={s.portfolioNotNowBtn} onPress={() => setPortfolioPromptDismissed(true)}>
                  <Text style={s.portfolioNotNowTxt}>Not Now</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.portfolioAddBtn} onPress={openPortfolioCuration}>
                  <Text style={s.portfolioAddBtnTxt}>Add to Portfolio</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null
        }
      />

      {/* ── Sticky action footer ───────────────────────────────────────────── */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {action.kind === 'countdown' && (
          <View style={s.countdownWrap}>
            <Text style={s.countdownDate}>{action.label.split('\n')[0]}</Text>
            <Text style={s.countdownTimer}>{action.label.split('\n')[1]}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
              {action.canRequestEarly && (
                <TouchableOpacity
                  style={s.earlyStartBtn}
                  onPress={requestEarlyStart}
                  accessibilityRole="button"
                  accessibilityLabel="Request early start from customer"
                >
                  <Ionicons name="flash" size={14} color={G.amber} />
                  <Text style={s.earlyStartTxt}>Request Early Start</Text>
                </TouchableOpacity>
              )}
              {wo.early_start_requested && !wo.early_start_approved && (
                <View style={[s.earlyStartBtn, { backgroundColor: 'rgba(251,191,36,0.08)' }]}>
                  <Ionicons name="time-outline" size={14} color={G.txt2} />
                  <Text style={[s.earlyStartTxt, { color: G.txt2 }]}>Waiting for approval...</Text>
                </View>
              )}
            </View>
            <View style={[s.primaryBtn, { backgroundColor: G.cardAlt, marginTop: 10 }]}>
              <Text style={[s.primaryBtnTxt, { color: G.txt3 }]}>Start Driving (not yet)</Text>
            </View>
          </View>
        )}

        {action.kind === 'action' && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: action.color }, transitioning && { opacity: 0.6 }]}
              onPress={() => transition(action.next as WoStatus)}
              disabled={transitioning}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={action.label.replace(/[^\w\s]/g, '').trim()}
              accessibilityHint={`Moves job status to ${action.next.replace(/_/g, ' ')}`}
            >
              {transitioning
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnTxt}>{action.label}</Text>
              }
            </TouchableOpacity>
            <TouchableOpacity
              style={s.overflowBtn}
              onPress={showOverflow}
              accessibilityRole="button"
              accessibilityLabel="More options"
            >
              <Ionicons name="ellipsis-horizontal" size={20} color={G.txt2} />
            </TouchableOpacity>
          </View>
        )}

        {action.kind === 'blocked' && (
          <View style={[s.primaryBtn, { backgroundColor: G.cardAlt }]}>
            <Text style={[s.primaryBtnTxt, { color: G.txt3 }]}>{action.label}</Text>
          </View>
        )}

        {action.kind === 'hold_failed' && (
          <View style={[s.primaryBtn, { backgroundColor: 'rgba(239,68,68,0.15)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)' }]}>
            <Ionicons name="card-outline" size={18} color={G.red} style={{ marginRight: 8 }} />
            <Text style={[s.primaryBtnTxt, { color: G.red }]}>Payment hold failed — customer action needed</Text>
          </View>
        )}

        {action.kind === 'none' && null}
      </View>

      {/* ── Change Order Modal ─────────────────────────────────────────────── */}
      <ChangeOrderModal
        visible={showCO}
        woId={wo.id}
        autoApproveUnder={wo.auto_approve_under_cents}
        contractorId={wo.contractor_id}
        onClose={() => setShowCO(false)}
        onSubmitted={() => supabase.from('payment_line_items').select('*').eq('work_order_id', wo.id).order('created_at')
          .then(({ data }) => data && setLineItems(data as LineItem[]))}
      />

      {/* ── Payday overlay ─────────────────────────────────────────────────── */}
      <Modal visible={showPayday} transparent animationType="fade">
        <View style={s.paydayOverlay}>
          <View style={s.paydayCard}>
            <Text style={s.paydayEmoji}>🎉</Text>
            <Text style={s.paydayTitle}>Job Complete!</Text>
            <Text style={s.paydayAmt}>${(paydayCents / 100).toFixed(2)}</Text>
            <Text style={s.paydaySub}>Payment released to your account</Text>
            <TouchableOpacity
              style={s.paydayBtn}
              onPress={() => { setShowPayday(false); router.replace('/(tabs)'); }}
              accessibilityRole="button"
              accessibilityLabel="Return to jobs list"
            >
              <Text style={s.paydayBtnTxt}>Back to Jobs</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add to Portfolio curation sheet */}
      <Modal visible={showPortfolioCuration} transparent animationType="slide" onRequestClose={() => setShowPortfolioCuration(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <TouchableOpacity style={s.modalBackdrop} onPress={() => setShowPortfolioCuration(false)} activeOpacity={1} />
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>Add to Portfolio</Text>
            <Text style={s.modalSub}>
              {(wo.service_type ?? trade)} · ${(jobTotalCents / 100).toFixed(2)}
              {generalLocation ? ` · ${generalLocation}` : ''}
              {paymentIntent?.captured_at
                ? ` · ${new Date(paymentIntent.captured_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : ''}
            </Text>

            <View style={s.privacyNotice}>
              <Ionicons name="shield-checkmark-outline" size={14} color={G.txt2} />
              <Text style={s.privacyNoticeTxt}>
                This will be shown publicly on your profile. Only the trade, price, city, date, and the photos you select below are included — the customer's name, address, and contact details are never shown.
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              <Text style={s.curationLabel}>PHOTOS</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 4 }}>
                {portfolioMedia.map(m => {
                  const isSelected = portfolioSelectedIds.has(m.id);
                  return (
                    <TouchableOpacity key={m.id} onPress={() => togglePortfolioPhoto(m.id)} activeOpacity={0.8}>
                      <Image source={{ uri: m._publicUrl }} style={[s.curationThumb, isSelected && s.curationThumbSelected]} />
                      {isSelected && (
                        <View style={s.curationCheckBadge}>
                          <Ionicons name="checkmark" size={12} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
              {portfolioMedia.length === 0 && (
                <Text style={s.txt2}>No before/after photos on this job to publish.</Text>
              )}

              <Text style={[s.curationLabel, { marginTop: 14 }]}>TITLE</Text>
              <TextInput
                style={s.curationInput}
                value={portfolioTitle}
                onChangeText={setPortfolioTitle}
                placeholder={trade}
                placeholderTextColor={G.txt2}
              />

              <Text style={[s.curationLabel, { marginTop: 10 }]}>DESCRIPTION (OPTIONAL)</Text>
              <TextInput
                style={[s.curationInput, { height: 80, textAlignVertical: 'top' }]}
                value={portfolioDescription}
                onChangeText={setPortfolioDescription}
                placeholder="What did you do on this job?"
                placeholderTextColor={G.txt2}
                multiline
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={s.curationCancelBtn} onPress={() => setShowPortfolioCuration(false)} disabled={portfolioPublishing}>
                <Text style={s.curationCancelTxt}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.curationPublishBtn} onPress={publishToPortfolio} disabled={portfolioPublishing}>
                {portfolioPublishing
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.curationPublishTxt}>Publish</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: G.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  txt2:         { color: G.txt2, fontSize: 14 },
  divider:      { height: StyleSheet.hairlineWidth, backgroundColor: G.border },
  supportRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  supportLabel: { fontSize: 14, fontWeight: '700', color: G.txt },
  supportSub:   { fontSize: 12, color: G.txt2, marginTop: 1 },

  // Header
  header:       { backgroundColor: G.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: G.border, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn:      { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1 },
  woNum:        { fontSize: 15, fontWeight: '800', color: G.txt, letterSpacing: 0.5 },
  tradeTxt:     { fontSize: 12, color: G.txt2, marginTop: 1 },
  pill:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  pillTxt:      { fontSize: 11, fontWeight: '700' },
  liveDot:      { width: 6, height: 6, borderRadius: 3 },
  statusDot:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusDotInner: { width: 10, height: 10, borderRadius: 5 },

  // Cards
  card:         { backgroundColor: G.card, borderRadius: 16, borderWidth: 1, borderColor: G.border, marginBottom: 10, overflow: 'hidden' },
  cardHead:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 14 },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardIcon:     { fontSize: 16 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: G.txt, flex: 1 },
  cardBadge:    { borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
  cardBadgeTxt: { fontSize: 11, fontWeight: '700' },
  cardBody:     { paddingHorizontal: 16, paddingBottom: 16 },

  // Stepper
  stepperRow:   { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 },
  stepNode:     { alignItems: 'center', gap: 5 },
  stepCircle:   { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepDot:      { width: 6, height: 6, borderRadius: 3 },
  stepLabel:    { fontSize: 9, fontWeight: '700', letterSpacing: 0.3, textAlign: 'center', maxWidth: 44 },
  stepLine:     { flex: 1, height: 2, marginBottom: 14 },

  // Bill
  billRow:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 },
  billLabel:    { fontSize: 13, color: G.txt2, flex: 1 },
  billMeta:     { fontSize: 11, color: G.txt3, marginTop: 1 },
  billAmt:      { fontSize: 15, fontWeight: '800', color: G.orange },
  billGroupLabel: { fontSize: 10, fontWeight: '800', color: G.txt3, letterSpacing: 0.8, marginBottom: 6, marginTop: 4 },
  billNote:     { fontSize: 11, color: G.txt3, marginTop: 4 },
  statusPill:   { borderRadius: 100, paddingHorizontal: 6, paddingVertical: 2 },
  statusPillTxt:{ fontSize: 10, fontWeight: '700' },
  addWorkBtn:   { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: `${G.green}40`, backgroundColor: G.greenMuted, paddingVertical: 11, paddingHorizontal: 14, marginTop: 12, justifyContent: 'center' },
  addWorkTxt:   { fontSize: 14, fontWeight: '700', color: G.green },

  // Checklist
  tplBtn:       { borderRadius: 10, borderWidth: 1, borderColor: G.border, backgroundColor: G.cardAlt, padding: 12, marginBottom: 12, alignItems: 'center' },
  tplBtnTxt:    { fontSize: 13, fontWeight: '600', color: G.green },
  checkRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: G.border },
  checkBox:     { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: G.border, alignItems: 'center', justifyContent: 'center' },
  checkLabel:   { flex: 1, fontSize: 14, color: G.txt },
  checkTime:    { fontSize: 10, color: G.txt3 },
  addRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  addInput:     { flex: 1, height: 44, backgroundColor: G.cardAlt, borderRadius: 10, borderWidth: 1, borderColor: G.border, paddingHorizontal: 12, fontSize: 14, color: G.txt },
  addBtn:       { width: 44, height: 44, backgroundColor: G.greenMuted, borderRadius: 10, borderWidth: 1, borderColor: `${G.green}30`, alignItems: 'center', justifyContent: 'center' },

  // Customer
  custRow:      { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  custAvatar:   { width: 44, height: 44, borderRadius: 14, backgroundColor: `${G.green}20`, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  custInitials: { fontSize: 15, fontWeight: '800', color: G.green },
  custName:     { fontSize: 15, fontWeight: '700', color: G.txt },
  custRating:   { fontSize: 12, color: G.txt2, marginTop: 2 },
  contactBtn:   { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: `${G.green}30`, backgroundColor: G.greenMuted, alignItems: 'center', justifyContent: 'center' },
  addressCard:  { borderRadius: 12, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  addressLabel: { fontSize: 10, fontWeight: '800', color: G.green, letterSpacing: 0.5, marginBottom: 3 },
  addressTxt:   { fontSize: 14, fontWeight: '600', color: G.txt },
  navigateBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: G.green, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  navigateTxt:  { fontSize: 13, fontWeight: '800', color: '#fff' },
  accessCard:   { backgroundColor: G.cardAlt, borderRadius: 12, borderWidth: 1, borderColor: G.border, padding: 14, gap: 10 },
  accessHeader: { fontSize: 10, fontWeight: '800', color: G.txt3, letterSpacing: 0.8, marginBottom: 2 },
  accessRow:    { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  accessIcon:   { fontSize: 18 },
  accessKey:    { fontSize: 11, fontWeight: '700', color: G.txt3, letterSpacing: 0.3 },
  accessVal:    { fontSize: 15, fontWeight: '700', color: G.txt, marginTop: 1 },

  // Map
  mapWrap:      { borderRadius: 12, overflow: 'hidden', height: 220, position: 'relative' },
  map:          { ...StyleSheet.absoluteFillObject },
  mapPin:       { width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: '#fff', backgroundColor: G.green, alignItems: 'center', justifyContent: 'center' },
  mapPinInner:  { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  myPin:        { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff', backgroundColor: G.blue },
  mapNavBtn:    { position: 'absolute', bottom: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: G.green, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  mapNavTxt:    { fontSize: 13, fontWeight: '800', color: '#fff' },
  mapPlaceholder: { height: 80, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapPlaceholderTxt: { fontSize: 13, color: G.txt2, textAlign: 'center' },
  etaChip:      { alignSelf: 'flex-start', backgroundColor: G.greenMuted, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 10, borderWidth: 1, borderColor: `${G.green}30` },
  etaTxt:       { fontSize: 12, fontWeight: '700', color: G.green },

  // Media
  kindChip:     { borderRadius: 100, borderWidth: 1, borderColor: G.border, paddingHorizontal: 12, paddingVertical: 6 },
  kindChipActive: { borderColor: G.green, backgroundColor: G.greenMuted },
  kindChipTxt:  { fontSize: 12, fontWeight: '600', color: G.txt3 },
  kindChipTxtActive: { color: G.green },
  photoThumb:   { width: 100, height: 100, borderRadius: 10, backgroundColor: G.cardAlt },
  cameraBtn:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, borderColor: `${G.green}40`, backgroundColor: G.greenMuted, paddingVertical: 11, paddingHorizontal: 14, marginTop: 8, justifyContent: 'center' },
  cameraBtnTxt: { fontSize: 14, fontWeight: '700', color: G.green },

  // Timeline
  timelineRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  timelineRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: G.border },
  timelineDot:  { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  timelineLabel: { fontSize: 13, color: G.txt, fontWeight: '500' },
  timelineTime: { fontSize: 11, color: G.txt3, marginTop: 2 },

  // Payment
  payCard:      { borderRadius: 12, borderWidth: 1, padding: 16, gap: 6 },
  payLabel:     { fontSize: 10, fontWeight: '800', color: G.txt3, letterSpacing: 0.8 },
  payAmt:       { fontSize: 28, fontWeight: '900' },
  payNote:      { fontSize: 12, color: G.txt2, lineHeight: 18 },

  // Footer
  footer:         { backgroundColor: G.card, borderTopWidth: 1, borderTopColor: G.border, paddingHorizontal: 16, paddingTop: 14 },
  primaryBtn:     { flex: 1, flexDirection: 'row', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center' },
  primaryBtnTxt:  { fontSize: 16, fontWeight: '800', color: '#fff', letterSpacing: 0.2 },
  overflowBtn:    { width: 50, borderRadius: 14, borderWidth: 1, borderColor: G.border, backgroundColor: G.cardAlt, alignItems: 'center', justifyContent: 'center' },

  // Countdown footer
  countdownWrap:  { gap: 2 },
  countdownDate:  { fontSize: 16, fontWeight: '800', color: G.txt, textAlign: 'center' },
  countdownTimer: { fontSize: 13, color: G.txt2, textAlign: 'center' },
  earlyStartBtn:  { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: `${G.amber}40`, backgroundColor: 'rgba(251,191,36,0.1)', paddingVertical: 10 },
  earlyStartTxt:  { fontSize: 13, fontWeight: '700', color: G.amber },

  // Payday overlay
  paydayOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' },
  paydayCard:     { backgroundColor: G.card, borderRadius: 24, padding: 32, alignItems: 'center', width: '80%', gap: 8, borderWidth: 1, borderColor: `${G.green}30` },
  paydayEmoji:    { fontSize: 56, marginBottom: 4 },
  paydayTitle:    { fontSize: 24, fontWeight: '900', color: G.txt },
  paydayAmt:      { fontSize: 48, fontWeight: '900', color: G.green, letterSpacing: -1 },
  paydaySub:      { fontSize: 13, color: G.txt2, textAlign: 'center' },
  paydayBtn:      { marginTop: 16, backgroundColor: G.green, borderRadius: 14, paddingHorizontal: 32, paddingVertical: 14 },
  paydayBtnTxt:   { fontSize: 16, fontWeight: '800', color: '#fff' },

  // Add to Portfolio prompt card
  portfolioCard:      { backgroundColor: G.cardAlt, borderRadius: 16, borderWidth: 1, borderColor: `${G.orange}40`, padding: 16, marginHorizontal: 14, marginTop: 10, marginBottom: 4, gap: 10 },
  portfolioCardTitle: { fontSize: 15, fontWeight: '800', color: G.txt },
  portfolioCardSub:   { fontSize: 13, color: G.txt2, lineHeight: 18 },
  portfolioBtnRow:    { flexDirection: 'row', gap: 10, marginTop: 4 },
  portfolioAddBtn:    { flex: 1, backgroundColor: G.orange, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  portfolioAddBtnTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },
  portfolioNotNowBtn: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: G.border, paddingVertical: 12, alignItems: 'center' },
  portfolioNotNowTxt: { fontSize: 14, fontWeight: '700', color: G.txt2 },

  // Add to Portfolio curation sheet
  modalOverlay:  { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet:    { backgroundColor: G.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, borderWidth: 0.5, borderColor: G.border, borderBottomWidth: 0, maxHeight: '90%' },
  modalHandle:   { width: 40, height: 4, borderRadius: 2, backgroundColor: G.border, alignSelf: 'center', marginBottom: 14 },
  modalTitle:    { fontSize: 20, fontWeight: '800', color: G.txt, marginBottom: 2 },
  modalSub:      { fontSize: 13, color: G.txt2, marginBottom: 12 },
  privacyNotice:    { flexDirection: 'row', gap: 8, backgroundColor: G.cardAlt, borderRadius: 10, padding: 10, marginBottom: 14, alignItems: 'flex-start' },
  privacyNoticeTxt: { flex: 1, fontSize: 11.5, color: G.txt2, lineHeight: 16 },
  curationLabel: { fontSize: 10, fontWeight: '800', color: G.txt3, letterSpacing: 0.8, marginBottom: 6 },
  curationThumb: { width: 72, height: 72, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  curationThumbSelected: { borderColor: G.orange },
  curationCheckBadge: { position: 'absolute', top: 4, right: 4, width: 18, height: 18, borderRadius: 9, backgroundColor: G.orange, alignItems: 'center', justifyContent: 'center' },
  curationInput: { backgroundColor: G.cardAlt, borderRadius: 10, borderWidth: 1, borderColor: G.border, padding: 12, fontSize: 15, color: G.txt },
  curationCancelBtn:  { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: G.border, paddingVertical: 14, alignItems: 'center' },
  curationCancelTxt:  { fontSize: 15, fontWeight: '700', color: G.txt2 },
  curationPublishBtn: { flex: 1, backgroundColor: G.orange, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  curationPublishTxt: { fontSize: 15, fontWeight: '800', color: '#fff' },
});

// Change Order Modal styles
const m = StyleSheet.create({
  sheet:        { backgroundColor: G.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, borderWidth: 0.5, borderColor: G.border, borderBottomWidth: 0, maxHeight: '90%' },
  handle:       { width: 40, height: 4, borderRadius: 2, backgroundColor: G.border, alignSelf: 'center', marginBottom: 14 },
  title:        { fontSize: 20, fontWeight: '800', color: G.txt, marginBottom: 2 },
  subtitle:     { fontSize: 13, color: G.txt2, marginBottom: 16 },
  label:        { fontSize: 10, fontWeight: '800', color: G.txt3, letterSpacing: 0.8, marginBottom: 6, marginTop: 10 },
  descInput:    { backgroundColor: G.cardAlt, borderRadius: 14, borderWidth: 1, borderColor: G.border, padding: 14, fontSize: 15, color: G.txt, lineHeight: 22, textAlignVertical: 'top', minHeight: 90, marginBottom: 4 },
  input:        { backgroundColor: G.cardAlt, borderRadius: 10, borderWidth: 1, borderColor: G.border, height: 48, paddingHorizontal: 12, fontSize: 16, color: G.txt, fontWeight: '700' },
  typeChip:     { borderRadius: 100, borderWidth: 1, borderColor: G.border, paddingHorizontal: 12, paddingVertical: 6 },
  typeChipActive: { borderColor: G.green, backgroundColor: G.greenMuted },
  typeChipTxt:  { fontSize: 12, fontWeight: '600', color: G.txt3 },
  typeChipTxtActive: { color: G.green },
  submitBtn:    { backgroundColor: G.green, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  submitTxt:    { fontSize: 16, fontWeight: '800', color: '#fff' },
});
