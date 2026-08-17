// app/work-order/customer.tsx
// Customer Live Work Order — Phase 3
// Trust hero · animated contractor marker · change order approval · completion flow

import MapboxGL from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActionSheetIOS, ActivityIndicator, Alert, Animated, FlatList,
  Image, Linking, Modal, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Skeleton, SkeletonBillSection, SkeletonChecklist, SkeletonContractorCard, SkeletonHero } from '@/components/Skeleton';
import { WorkOrderSheet } from '@/components/WorkOrderSheet';
import { useAuth } from '@/hooks/useAuth';
import { DEFAULT_MAP_REGION, MAPBOX_ACCESS_TOKEN } from '@/lib/mapConfig';
import { supabase } from '@/lib/supabase';

MapboxGL.setAccessToken(MAPBOX_ACCESS_TOKEN);

// ─── Theme ────────────────────────────────────────────────────────────────────

const O = {
  bg:       '#0D0D0D',
  card:     '#161616',
  cardAlt:  '#1C1C1C',
  border:   '#262626',
  orange:   '#FF6200',
  orangeMu: 'rgba(255,98,0,0.12)',
  orangeGl: 'rgba(255,98,0,0.25)',
  green:    '#22C55E',
  greenMu:  'rgba(34,197,94,0.12)',
  blue:     '#38BDF8',
  amber:    '#FBBF24',
  red:      '#EF4444',
  txt:      '#F0F0F0',
  txt2:     '#9A9A9A',
  txt3:     '#555555',
};

// ─── Types ────────────────────────────────────────────────────────────────────

type WoStatus =
  | 'submitted' | 'accepted' | 'deposit_secured'
  | 'en_route' | 'arrived' | 'in_progress'
  | 'waiting_for_customer' | 'materials_needed'
  | 'change_order_pending' | 'awaiting_approval'
  | 'payment_releasing' | 'completed' | 'cancelled' | 'disputed';

type SectionKey = 'hero' | 'map' | 'contractor' | 'bill' | 'progress' | 'media' | 'timeline' | 'support';
const ALL_SECTIONS: SectionKey[] = ['hero', 'map', 'contractor', 'bill', 'progress', 'media', 'timeline', 'support'];

interface WoData {
  id: string; booking_id: string; contractor_id: string; customer_id: string;
  work_order_number: string; wo_status: WoStatus; service_type: string;
  job_address: string; contractor_name: string; customer_name: string;
  is_emergency: boolean; auto_approve_under_cents: number;
  payment_intent_id: string | null; created_at: string;
  early_start_requested: boolean; early_start_approved: boolean;
  hold_failed_at: string | null;
  booking?: {
    trade: string; description: string; price_estimate: number | null;
    customer_id: string; job_lat: number | null; job_lng: number | null;
  };
}

interface LineItem {
  id: string; label: string; quantity: number; unit_price_cents: number;
  amount_cents: number; item_type: string; approval_status: string;
  requires_approval: boolean; created_at: string;
}

interface ProgressItem {
  id: string; label: string; sort_order: number; is_done: boolean; done_at: string | null;
}

interface WoEvent {
  id: string; event_type: string; actor_role: string | null;
  label: string; payload: Record<string, unknown>; created_at: string;
}

interface WoMedia {
  id: string; kind: string; storage_path: string; created_at: string; _publicUrl?: string;
}

interface PaymentIntent {
  id: string; status: string; amount_cents: number;
}

interface ContractorProfile {
  id: string; company_name: string | null; username: string | null;
  avatar_url: string | null; rating: number | null;
  total_bookings: number | null; acceptance_rate: number | null;
  verification_status: string | null; license_verified: boolean | null;
  insured: boolean | null; trade_type: string | null; phone: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

function statusText(status: WoStatus, contractorName: string, eta?: string | null): string {
  const name = contractorName || 'Your contractor';
  switch (status) {
    case 'submitted':            return `${name} has received your request.`;
    case 'accepted':             return `${name} has accepted your job and will be in touch.`;
    case 'deposit_secured':      return `Payment held securely. ${name} is preparing to head out.`;
    case 'en_route':             return eta ? `${name} is on the way — arriving ~${eta}` : `${name} is on the way to you.`;
    case 'arrived':              return `${name} has arrived at your location.`;
    case 'in_progress':          return `${name} is working on your job right now.`;
    case 'waiting_for_customer': return `${name} needs your attention — check the chat.`;
    case 'materials_needed':     return `${name} stepped out to grab materials and will be right back.`;
    case 'change_order_pending': return `${name} is requesting additional work. Review below.`;
    case 'awaiting_approval':    return `${name} says the job is done. Please review and approve.`;
    case 'payment_releasing':    return 'Payment is being released to the contractor.';
    case 'completed':            return 'Job complete. Your payment has been processed. ✅';
    case 'cancelled':            return 'This job was cancelled.';
    case 'disputed':             return 'This job is under dispute. Our team is reviewing.';
    default:                     return `${name} is working on your job.`;
  }
}

const STATUS_COLOR: Partial<Record<WoStatus, string>> = {
  submitted: O.txt2, accepted: O.blue, deposit_secured: O.blue,
  en_route: O.orange, arrived: O.orange, in_progress: O.green,
  waiting_for_customer: O.amber, materials_needed: O.amber,
  change_order_pending: O.amber, awaiting_approval: O.orange,
  payment_releasing: O.green, completed: O.green,
  cancelled: O.red, disputed: O.red,
};

function fmt$(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtEta(sec: number): string {
  const m = Math.round(sec / 60);
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
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
      borderWidth: 2, borderColor: color, transform: [{ scale }], opacity,
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
            <View style={[s.cardBadge, { backgroundColor: accent ? `${accent}20` : O.orangeMu }]}>
              <Text style={[s.cardBadgeTxt, { color: accent ?? O.orange }]}>{badge}</Text>
            </View>
          )}
        </View>
        <Ionicons name={collapsed ? 'chevron-down' : 'chevron-up'} size={16} color={O.txt3} />
      </TouchableOpacity>
      {!collapsed && <View style={s.cardBody}>{children}</View>}
    </View>
  );
}

// ─── LearnMore Sheet ──────────────────────────────────────────────────────────

function LearnMoreSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <TouchableOpacity style={lm.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={lm.sheet}>
        <View style={lm.handle} />
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <View style={lm.shieldWrap}>
            <Ionicons name="shield-checkmark" size={40} color={O.green} />
          </View>
          <Text style={lm.title}>Payment Protection</Text>
        </View>
        {([
          { icon: '🔒', head: 'Held on your card', body: 'When you book, we place a hold on your card — not a charge. Your money doesn\'t move until you say so.' },
          { icon: '🔧', head: 'Contractor works, you watch', body: 'Your contractor works and marks the job complete. Only then are you asked to review and approve.' },
          { icon: '✅', head: 'You approve, then we release', body: 'When you tap "Approve & Pay," funds are released to the contractor. If you have concerns, open a dispute instead.' },
          { icon: '⚖️', head: '72-hour dispute window', body: 'Changed your mind? You have 72 hours after the job is marked complete to open a dispute before funds auto-release.' },
        ] as const).map(item => (
          <View key={item.head} style={lm.row}>
            <Text style={lm.rowIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={lm.rowHead}>{item.head}</Text>
              <Text style={lm.rowBody}>{item.body}</Text>
            </View>
          </View>
        ))}
        <TouchableOpacity style={lm.closeBtn} onPress={onClose} activeOpacity={0.85}>
          <Text style={lm.closeTxt}>Got it</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const lm = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet:      { backgroundColor: O.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 0.5, borderColor: O.border, borderBottomWidth: 0, position: 'absolute', bottom: 0, left: 0, right: 0 },
  handle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: O.border, alignSelf: 'center', marginBottom: 20 },
  shieldWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: O.greenMu, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title:      { fontSize: 20, fontWeight: '800', color: O.txt },
  row:        { flexDirection: 'row', gap: 14, marginBottom: 18 },
  rowIcon:    { fontSize: 22, marginTop: 2 },
  rowHead:    { fontSize: 14, fontWeight: '700', color: O.txt, marginBottom: 3 },
  rowBody:    { fontSize: 13, color: O.txt2, lineHeight: 19 },
  closeBtn:   { backgroundColor: O.green, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  closeTxt:   { fontSize: 16, fontWeight: '800', color: '#fff' },
});

// ─── HeroSection ─────────────────────────────────────────────────────────────

function HeroSection({ wo, eta, onLearnMore, heldCents, onSecurePayment, securingPayment }: {
  wo: WoData; eta: number | null; onLearnMore: () => void; heldCents: number;
  onSecurePayment?: () => void; securingPayment?: boolean;
}) {
  const color      = STATUS_COLOR[wo.wo_status] ?? O.txt2;
  const etaStr     = eta ? fmtEta(eta) : null;
  const isActive   = !['completed', 'cancelled', 'disputed', 'submitted'].includes(wo.wo_status);
  const isApproval = wo.wo_status === 'awaiting_approval';
  const needsHold  = wo.wo_status === 'accepted' && !wo.payment_intent_id;

  return (
    <View style={s.card}>
      <View style={s.cardBody}>
        {/* Status pill */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <View style={[s.heroPill, { backgroundColor: `${color}15`, borderColor: `${color}30` }]}>
            {isActive && <PulseRing color={color} />}
            <View style={[s.heroDot, { backgroundColor: color }]} />
            <Text style={[s.heroPillTxt, { color }]}>
              {wo.wo_status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </Text>
          </View>
          {wo.is_emergency && (
            <View style={[s.heroPill, { backgroundColor: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.25)' }]}>
              <Text style={[s.heroPillTxt, { color: O.red }]}>🚨 Emergency</Text>
            </View>
          )}
        </View>

        {/* Plain-language status */}
        <Text style={s.heroStatusLine}>
          {statusText(wo.wo_status, wo.contractor_name, etaStr)}
        </Text>

        {/* Confirm Payment CTA — only shown when accepted but no hold yet */}
        {needsHold && onSecurePayment ? (
          <TouchableOpacity
            style={s.securePayBtn}
            onPress={onSecurePayment}
            disabled={securingPayment}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Confirm and secure payment"
          >
            {securingPayment
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="shield-checkmark" size={18} color="#fff" />
                  <Text style={s.securePayTxt}>Confirm & Secure Payment</Text>
                </>
            }
          </TouchableOpacity>
        ) : (
          /* Payment Protected box */
          <View style={s.protectedBox}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="shield-checkmark" size={24} color={O.green} />
              <View style={{ flex: 1 }}>
                <Text style={s.protectedLabel}>PAYMENT PROTECTED</Text>
                <Text style={[s.protectedAmt, { color: O.orange }]}>{fmt$(heldCents)}</Text>
              </View>
              <TouchableOpacity onPress={onLearnMore} style={s.learnMoreBtn}>
                <Text style={s.learnMoreTxt}>How it works</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.protectedSub}>
              {isApproval
                ? 'Ready to release — pending your approval below'
                : wo.wo_status === 'completed'
                  ? 'Released to contractor'
                  : 'Held securely — releases only when you approve'}
            </Text>
          </View>
        )}

        <Text style={s.woNumLine}>Work Order {wo.work_order_number}</Text>
      </View>
    </View>
  );
}

// ─── MapSection ───────────────────────────────────────────────────────────────

function MapSection({
  wo, contractorCoord, etaSec, distanceM, myLoc, shareLocation, onToggleShare, collapsed, onToggle,
}: {
  wo: WoData; contractorCoord: [number, number] | null;
  etaSec: number | null; distanceM: number | null;
  myLoc: { lat: number; lng: number } | null;
  shareLocation: boolean; onToggleShare: () => void;
  collapsed: boolean; onToggle: () => void;
}) {
  const jobLat = wo.booking?.job_lat;
  const jobLng = wo.booking?.job_lng;
  const hasJob = !!jobLat && !!jobLng;

  const bounds = useMemo(() => {
    if (!hasJob || !contractorCoord) return null;
    const lats = [jobLat!, contractorCoord[1]];
    const lngs = [jobLng!, contractorCoord[0]];
    if (myLoc && shareLocation) { lats.push(myLoc.lat); lngs.push(myLoc.lng); }
    return {
      ne: [Math.max(...lngs) + 0.005, Math.max(...lats) + 0.005] as [number, number],
      sw: [Math.min(...lngs) - 0.005, Math.min(...lats) - 0.005] as [number, number],
    };
  }, [contractorCoord, jobLat, jobLng, myLoc, shareLocation, hasJob]);

  if (wo.wo_status === 'arrived') {
    return (
      <View style={[s.card, { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12 }]}>
        <View style={[s.heroDot, { backgroundColor: O.green, width: 10, height: 10, borderRadius: 5 }]} />
        <Text style={[s.cardTitle, { color: O.green, flex: 1 }]}>Arrived ✓ — contractor is on-site</Text>
      </View>
    );
  }

  if (!hasJob && !contractorCoord) return null;

  return (
    <SectionCard title="Live Tracking" icon="🗺️" collapsed={collapsed} onToggle={onToggle}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        {etaSec != null && (
          <View style={s.mapChip}>
            <Ionicons name="time-outline" size={12} color={O.orange} />
            <Text style={s.mapChipTxt}>ETA: {fmtEta(etaSec)}</Text>
          </View>
        )}
        {distanceM != null && (
          <View style={s.mapChip}>
            <Ionicons name="location-outline" size={12} color={O.orange} />
            <Text style={s.mapChipTxt}>{(distanceM / 1609.34).toFixed(1)} mi away</Text>
          </View>
        )}
      </View>

      <View style={s.mapWrap}>
        <MapboxGL.MapView style={s.map} styleURL={MapboxGL.StyleURL.Dark} pitchEnabled={false} rotateEnabled={false} scrollEnabled={false} zoomEnabled={false}>
          {bounds ? (
            <MapboxGL.Camera bounds={bounds} padding={{ paddingLeft: 40, paddingRight: 40, paddingTop: 40, paddingBottom: 40 }} animationMode="easeTo" animationDuration={1000} />
          ) : hasJob ? (
            <MapboxGL.Camera centerCoordinate={[jobLng!, jobLat!]} zoomLevel={13} animationMode="none" />
          ) : (
            <MapboxGL.Camera centerCoordinate={DEFAULT_MAP_REGION.centerCoordinate} zoomLevel={DEFAULT_MAP_REGION.zoomLevel} animationMode="none" />
          )}

          {hasJob && (
            <MapboxGL.PointAnnotation id="jobPin" coordinate={[jobLng!, jobLat!]}>
              <View style={s.jobPin}><View style={s.jobPinInner} /></View>
            </MapboxGL.PointAnnotation>
          )}

          {contractorCoord && (
            <MapboxGL.PointAnnotation id="truckMarker" coordinate={contractorCoord}>
              <View style={s.truckMarker}><Text style={{ fontSize: 20 }}>🚚</Text></View>
            </MapboxGL.PointAnnotation>
          )}

          {myLoc && shareLocation && (
            <MapboxGL.PointAnnotation id="myDot" coordinate={[myLoc.lng, myLoc.lat]}>
              <View style={s.myDot} />
            </MapboxGL.PointAnnotation>
          )}
        </MapboxGL.MapView>

        <TouchableOpacity
          style={s.shareBtn}
          onPress={onToggleShare}
          accessibilityRole="switch"
          accessibilityLabel="Share my location with contractor"
          accessibilityState={{ checked: shareLocation }}
        >
          <Ionicons name={shareLocation ? 'location' : 'location-outline'} size={14} color={shareLocation ? O.orange : O.txt2} />
          <Text style={[s.shareTxt, { color: shareLocation ? O.orange : O.txt2 }]}>
            {shareLocation ? 'Sharing my location' : 'Share my location'}
          </Text>
        </TouchableOpacity>
      </View>
    </SectionCard>
  );
}

// ─── ContractorCard ───────────────────────────────────────────────────────────

function ContractorCard({ contractor, woId, collapsed, onToggle }: {
  contractor: ContractorProfile | null; woId: string;
  collapsed: boolean; onToggle: () => void;
}) {
  const router = useRouter();
  if (!contractor) return null;
  const name      = contractor.company_name ?? contractor.username ?? 'Contractor';
  const avatarUrl = contractor.avatar_url?.trim() || null;
  const initials  = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);

  return (
    <SectionCard title="Your Contractor" icon="👷" collapsed={collapsed} onToggle={onToggle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <View style={s.contractorAvatar}>
          {avatarUrl
            ? <Image source={{ uri: avatarUrl }} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
            : <Text style={s.contractorInitials}>{initials}</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.contractorName}>{name}</Text>
          {contractor.trade_type && <Text style={s.contractorTrade}>{contractor.trade_type}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 }}>
            {contractor.rating != null && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Ionicons name="star" size={13} color={O.amber} />
                <Text style={s.contractorMeta}>{contractor.rating.toFixed(1)}</Text>
              </View>
            )}
            {contractor.total_bookings != null && (
              <Text style={s.contractorMeta}>{contractor.total_bookings} jobs</Text>
            )}
            {contractor.acceptance_rate != null && (
              <Text style={s.contractorMeta}>{Math.round(contractor.acceptance_rate)}% response</Text>
            )}
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
        {contractor.verification_status === 'approved' && (
          <View style={s.badge}><Ionicons name="checkmark-circle" size={12} color={O.green} /><Text style={[s.badgeTxt, { color: O.green }]}>Verified</Text></View>
        )}
        {contractor.license_verified && (
          <View style={s.badge}><Ionicons name="document-text-outline" size={12} color={O.blue} /><Text style={[s.badgeTxt, { color: O.blue }]}>Licensed</Text></View>
        )}
        {contractor.insured && (
          <View style={s.badge}><Ionicons name="shield-outline" size={12} color={O.orange} /><Text style={[s.badgeTxt, { color: O.orange }]}>Insured</Text></View>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        {contractor.phone && (
          <TouchableOpacity style={s.cActionBtn} onPress={() => Linking.openURL(`tel:${contractor.phone!}`)}>
            <Ionicons name="call-outline" size={16} color={O.orange} />
            <Text style={s.cActionTxt}>Call</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={s.cActionBtn} onPress={() => router.push(`/chat/${woId}` as any)}>
          <Ionicons name="chatbubble-outline" size={16} color={O.orange} />
          <Text style={s.cActionTxt}>Message</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.cActionBtn, { flex: 1 }]} onPress={() => router.push(`/company/${contractor.id}` as any)}>
          <Text style={s.cActionTxt}>View Full Profile →</Text>
        </TouchableOpacity>
      </View>
    </SectionCard>
  );
}

// ─── BillSection ─────────────────────────────────────────────────────────────

function BillSection({
  items, basePrice, collapsed, onToggle, onApprove, onReject,
}: {
  items: LineItem[]; basePrice: number;
  collapsed: boolean; onToggle: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}) {
  const pending  = items.filter(i => i.approval_status === 'pending');
  const approved = items.filter(i => i.approval_status !== 'pending' && i.approval_status !== 'rejected');
  const approvedTotal = approved.reduce((sum, i) => sum + i.amount_cents, 0);
  const pendingTotal  = pending.reduce((sum, i) => sum + i.amount_cents, 0);
  const total = basePrice * 100 + approvedTotal;
  const badge = pending.length > 0 ? `${pending.length} need approval` : undefined;

  const [approvingId, setApprovingId] = useState<string | null>(null);

  async function handleApprove(id: string) {
    setApprovingId(id);
    await onApprove(id);
    setApprovingId(null);
  }

  async function handleReject(id: string) {
    Alert.alert('Reject this work?', 'The contractor will be notified and cannot charge for this item.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reject', style: 'destructive', onPress: async () => {
        setApprovingId(id);
        await onReject(id);
        setApprovingId(null);
      }},
    ]);
  }

  return (
    <SectionCard
      title="Job Total"
      icon="📋"
      badge={badge}
      collapsed={collapsed}
      onToggle={onToggle}
      accent={pending.length > 0 ? O.amber : undefined}
    >
      <View style={s.billRow}>
        <Text style={s.billLabel}>Base job price</Text>
        <Text style={s.billAmt}>{fmt$(basePrice * 100)}</Text>
      </View>

      {approved.map(item => (
        <View key={item.id} style={s.billRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.billLabel}>{item.label}</Text>
            <Text style={s.billMeta}>{item.item_type} · {item.approval_status}</Text>
          </View>
          <Text style={s.billAmt}>{fmt$(item.amount_cents)}</Text>
        </View>
      ))}

      {pending.map(item => (
        <View key={item.id} style={s.changeOrderCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <View style={s.changeOrderBadge}>
              <Text style={s.changeOrderBadgeTxt}>NEW WORK REQUEST</Text>
            </View>
          </View>

          <Text style={s.changeOrderDesc}>{item.label}</Text>
          <Text style={s.changeOrderMeta}>{item.item_type}</Text>

          <View style={s.changeOrderTotals}>
            <View style={{ flex: 1 }}>
              <Text style={s.changeOrderTotalLabel}>CURRENT TOTAL</Text>
              <Text style={[s.changeOrderTotalAmt, { color: O.txt2 }]}>{fmt$(total)}</Text>
            </View>
            <View style={s.changeOrderArrow}><Text style={{ color: O.txt3, fontSize: 18 }}>→</Text></View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={s.changeOrderTotalLabel}>NEW TOTAL</Text>
              <Text style={[s.changeOrderTotalAmt, { color: O.orange }]}>{fmt$(total + item.amount_cents)}</Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[s.changeOrderBtn, s.changeOrderBtnDecline]}
              onPress={() => handleReject(item.id)}
              disabled={approvingId === item.id}
              accessibilityRole="button"
              accessibilityLabel="Reject change order"
            >
              <Text style={s.changeOrderBtnDeclineTxt}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.changeOrderBtn, { flex: 1, backgroundColor: O.green }]}
              onPress={() => handleApprove(item.id)}
              disabled={approvingId === item.id}
              accessibilityRole="button"
              accessibilityLabel={`Approve change order, adds ${fmt$(item.amount_cents)}`}
            >
              {approvingId === item.id
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.changeOrderBtnApproveTxt}>Approve +{fmt$(item.amount_cents)}</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      ))}

      <View style={[s.divider, { marginVertical: 12 }]} />
      <View style={s.billRow}>
        <Text style={[s.billLabel, { fontWeight: '800', color: O.txt }]}>
          Total{pending.length > 0 ? ' (if all approved)' : ''}
        </Text>
        <Text style={[s.billAmt, { fontSize: 22 }]}>
          {pending.length > 0 ? fmt$(total + pendingTotal) : fmt$(total)}
        </Text>
      </View>
    </SectionCard>
  );
}

// ─── ProgressSection ──────────────────────────────────────────────────────────

function ProgressSection({ items, media, collapsed, onToggle }: {
  items: ProgressItem[]; media: WoMedia[]; collapsed: boolean; onToggle: () => void;
}) {
  const doneCount = items.filter(i => i.is_done).length;
  const pct = items.length > 0 ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <SectionCard title="Progress" icon="📊" badge={`${pct}%`} collapsed={collapsed} onToggle={onToggle} accent={O.orange}>
      {items.length > 0 && (
        <View style={{ marginBottom: 14 }}>
          <View style={s.progressBar}>
            <View style={[s.progressFill, { width: `${pct}%` as any }]} />
          </View>
          <Text style={[s.billMeta, { marginTop: 4 }]}>{doneCount} of {items.length} tasks complete</Text>
        </View>
      )}

      {items.map(item => (
        <View key={item.id} style={s.checkRow}>
          <View style={[s.checkBox, item.is_done && { backgroundColor: O.orange, borderColor: O.orange }]}>
            {item.is_done && <Ionicons name="checkmark" size={12} color="#fff" />}
          </View>
          <Text style={[s.checkLabel, item.is_done && { color: O.txt3, textDecorationLine: 'line-through' }]}>
            {item.label}
          </Text>
          {item.done_at && <Text style={s.checkTime}>{timeLabel(item.done_at)}</Text>}
        </View>
      ))}

      {media.length > 0 && (
        <View style={{ marginTop: 14 }}>
          <Text style={s.billGroupLabel}>JOB PHOTOS</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 8 }}>
            {media.map(m => (
              <Image key={m.id} source={{ uri: m._publicUrl }} style={s.photoThumb} />
            ))}
          </ScrollView>
        </View>
      )}

      {items.length === 0 && media.length === 0 && (
        <Text style={[s.billMeta, { textAlign: 'center', paddingVertical: 8 }]}>
          Progress updates will appear here as the contractor works.
        </Text>
      )}
    </SectionCard>
  );
}

// ─── TimelineSection ──────────────────────────────────────────────────────────

function TimelineSection({ events, collapsed, onToggle }: { events: WoEvent[]; collapsed: boolean; onToggle: () => void }) {
  return (
    <SectionCard title="Activity" icon="🕐" badge={events.length || undefined} collapsed={collapsed} onToggle={onToggle}>
      {events.length === 0
        ? <Text style={[s.billMeta, { textAlign: 'center', paddingVertical: 8 }]}>No activity yet.</Text>
        : events.map((ev, i) => (
          <View key={ev.id} style={[s.timelineRow, i < events.length - 1 && s.timelineRowBorder]}>
            <View style={[s.timelineDot, { backgroundColor: ev.actor_role === 'contractor' ? O.orange : O.txt3 }]} />
            <View style={{ flex: 1 }}>
              <Text style={s.timelineLabel}>{ev.label}</Text>
              <Text style={s.timelineTime}>{timeLabel(ev.created_at)}</Text>
            </View>
          </View>
        ))
      }
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
              body: { work_order_id: wo.id, reason: 'Customer opened dispute' },
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
        <Ionicons name="flag-outline" size={18} color={O.amber} />
        <View style={{ flex: 1 }}>
          <Text style={[s.supportLabel, { color: O.amber }]}>Report an Issue</Text>
          <Text style={s.supportSub}>Safety, quality concerns, or anything else</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={O.txt3} />
      </TouchableOpacity>

      <View style={s.divider} />

      <TouchableOpacity
        style={[s.supportRow, !canDispute && { opacity: 0.4 }]}
        onPress={canDispute ? openDispute : undefined}
        disabled={!canDispute || disputing}
      >
        {disputing
          ? <ActivityIndicator size="small" color={O.red} />
          : <Ionicons name="alert-circle-outline" size={18} color={O.red} />
        }
        <View style={{ flex: 1 }}>
          <Text style={[s.supportLabel, { color: O.red }]}>Open a Dispute</Text>
          <Text style={s.supportSub}>
            {canDispute ? 'Pause payment and escalate to Tradease' : 'Available after contractor marks job complete'}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={O.txt3} />
      </TouchableOpacity>

      <View style={[s.divider, { marginVertical: 4 }]} />

      <TouchableOpacity style={s.supportRow} onPress={() => Linking.openURL('mailto:support@tradease.app')}>
        <Ionicons name="mail-outline" size={18} color={O.txt2} />
        <View style={{ flex: 1 }}>
          <Text style={s.supportLabel}>Contact Tradease Support</Text>
          <Text style={s.supportSub}>support@tradease.app</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={O.txt3} />
      </TouchableOpacity>
    </SectionCard>
  );
}

// ─── Star Rating ──────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => { onChange(n); Haptics.selectionAsync(); }}>
          <Ionicons name={n <= value ? 'star' : 'star-outline'} size={36} color={n <= value ? O.amber : O.txt3} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ─── Completion Sheet ─────────────────────────────────────────────────────────

type CompletionPhase = 'review' | 'processing' | 'success';
type TipMode = 'none' | '10' | '15' | '20' | 'custom';

function CompletionSheet({
  visible, wo, items, basePrice, pi, onClose, onCompleted,
}: {
  visible: boolean; wo: WoData | null; items: LineItem[];
  basePrice: number; pi: PaymentIntent | null;
  onClose: () => void; onCompleted: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [phase, setPhase]         = useState<CompletionPhase>('review');
  const [tipMode, setTipMode]     = useState<TipMode>('none');
  const [customTip, setCustomTip] = useState('');
  const [stars, setStars]         = useState(0);
  const [review, setReview]       = useState('');
  const successScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) { setPhase('review'); setTipMode('none'); setCustomTip(''); setStars(0); setReview(''); }
  }, [visible]);

  useEffect(() => {
    if (phase === 'success') {
      Animated.spring(successScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }).start();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [phase, successScale]);

  if (!wo) return null;

  const approvedTotal = items
    .filter(i => i.approval_status !== 'rejected' && i.approval_status !== 'pending')
    .reduce((sum, i) => sum + i.amount_cents, 0);
  const jobTotal  = basePrice * 100 + approvedTotal;
  const heldAmt   = pi?.amount_cents ?? jobTotal;

  const tipCents: number = (() => {
    switch (tipMode) {
      case '10':     return Math.round(jobTotal * 0.1);
      case '15':     return Math.round(jobTotal * 0.15);
      case '20':     return Math.round(jobTotal * 0.2);
      case 'custom': return Math.round((parseFloat(customTip) || 0) * 100);
      default:       return 0;
    }
  })();

  const grandTotal = jobTotal + tipCents;

  async function handleApprove() {
    if (!wo) return;
    if (stars === 0) { Alert.alert('', 'Please rate the contractor before approving.'); return; }
    setPhase('processing');
    try {
      // 1. Submit review
      await supabase.from('reviews').insert({
        work_order_id: wo.id,
        contractor_id: wo.contractor_id,
        customer_id:   wo.customer_id,
        rating:        stars,
        body:          review.trim() || null,
      });

      // 2. Capture payment (mock) — stores both grand total and tip for receipt
      if (pi) {
        await supabase.from('payment_intents').update({
          status: 'captured', captured_at: new Date().toISOString(),
          amount_cents: grandTotal, tip_cents: tipCents,
        }).eq('id', pi.id);
      }

      // 3. Transition to completed
      const { error } = await supabase.functions.invoke('work-order-transition', {
        body: { work_order_id: wo.id, new_status: 'completed' },
      });
      if (error) throw error;
      setPhase('success');
    } catch (e: any) {
      setPhase('review');
      Alert.alert('Error', e.message ?? 'Could not process. Please try again.');
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={phase === 'review' ? onClose : undefined}>
      <View style={[cs.container, { paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>

        {phase === 'processing' && (
          <View style={cs.centeredWrap}>
            <ActivityIndicator color={O.orange} size="large" />
            <Text style={cs.processingTxt}>Processing payment…</Text>
          </View>
        )}

        {phase === 'success' && (
          <View style={cs.centeredWrap}>
            <Animated.View style={{ transform: [{ scale: successScale }], marginBottom: 24 }}>
              <View style={cs.successIcon}>
                <Ionicons name="checkmark" size={52} color="#fff" />
              </View>
            </Animated.View>
            <Text style={cs.successTitle}>Payment Approved!</Text>
            <Text style={cs.successSub}>{fmt$(grandTotal)} released to {wo.contractor_name}</Text>
            {stars > 0 && (
              <Text style={[cs.successSub, { marginTop: 4 }]}>
                {'⭐'.repeat(stars)} — thanks for the review!
              </Text>
            )}
            <View style={{ gap: 12, width: '100%', marginTop: 40, paddingHorizontal: 24 }}>
              <TouchableOpacity style={cs.primaryBtn} onPress={onCompleted} activeOpacity={0.85}>
                <Text style={cs.primaryBtnTxt}>View Receipt</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {phase === 'review' && (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
              <TouchableOpacity onPress={onClose}>
                <Ionicons name="close" size={24} color={O.txt2} />
              </TouchableOpacity>
              <Text style={cs.sheetTitle}>Review & Approve</Text>
            </View>

            {/* Final bill */}
            <Text style={cs.label}>FINAL BILL</Text>
            <View style={cs.billCard}>
              <View style={s.billRow}>
                <Text style={s.billLabel}>Base job price</Text>
                <Text style={s.billAmt}>{fmt$(basePrice * 100)}</Text>
              </View>
              {items.filter(i => i.approval_status !== 'rejected').map(item => (
                <View key={item.id} style={s.billRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.billLabel}>{item.label}</Text>
                    <Text style={s.billMeta}>{item.item_type}</Text>
                  </View>
                  <Text style={s.billAmt}>{fmt$(item.amount_cents)}</Text>
                </View>
              ))}
              <View style={[s.divider, { marginVertical: 10 }]} />
              <View style={s.billRow}>
                <Text style={[s.billLabel, { fontWeight: '800', color: O.txt }]}>Subtotal</Text>
                <Text style={[s.billAmt, { fontSize: 18 }]}>{fmt$(jobTotal)}</Text>
              </View>
              {heldAmt !== jobTotal && (
                <Text style={[s.billMeta, { marginTop: 2 }]}>{fmt$(heldAmt)} was held on your card</Text>
              )}
            </View>

            {/* Tip */}
            <Text style={[cs.label, { marginTop: 20 }]}>TIP (OPTIONAL)</Text>
            <View style={cs.tipGrid}>
              {(['none', '10', '15', '20', 'custom'] as TipMode[]).map(m => (
                <TouchableOpacity
                  key={m}
                  style={[cs.tipChip, tipMode === m && cs.tipChipActive]}
                  onPress={() => setTipMode(m)}
                >
                  <Text style={[cs.tipChipTxt, tipMode === m && cs.tipChipTxtActive]}>
                    {m === 'none' ? 'None' : m === 'custom' ? 'Custom' : `${m}%`}
                  </Text>
                  {m !== 'none' && m !== 'custom' && (
                    <Text style={[cs.tipChipSub, tipMode === m && { color: O.orange }]}>
                      {fmt$(Math.round(jobTotal * Number(m) / 100))}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
            {tipMode === 'custom' && (
              <View style={[cs.inputWrap, { flexDirection: 'row', alignItems: 'center', marginTop: 10 }]}>
                <Text style={{ color: O.txt2, fontSize: 18, marginRight: 6 }}>$</Text>
                <TextInput
                  style={{ flex: 1, fontSize: 20, fontWeight: '700', color: O.txt, paddingVertical: 0 }}
                  value={customTip}
                  onChangeText={setCustomTip}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  placeholderTextColor={O.txt3}
                  autoFocus
                />
              </View>
            )}

            {/* Stars */}
            <Text style={[cs.label, { marginTop: 20 }]}>RATE YOUR CONTRACTOR</Text>
            <View style={[cs.billCard, { alignItems: 'center', paddingVertical: 20 }]}>
              <StarRating value={stars} onChange={setStars} />
              {stars > 0 && (
                <Text style={{ marginTop: 10, fontSize: 14, color: O.txt2 }}>
                  {['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent!'][stars]}
                </Text>
              )}
            </View>

            {/* Review */}
            <Text style={[cs.label, { marginTop: 16 }]}>LEAVE A REVIEW (OPTIONAL)</Text>
            <TextInput
              style={cs.reviewInput}
              value={review}
              onChangeText={setReview}
              placeholder="Share your experience with this contractor..."
              placeholderTextColor={O.txt3}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            {/* Grand total + CTA */}
            <View style={[cs.billCard, { marginTop: 20 }]}>
              <View style={s.billRow}><Text style={s.billLabel}>Job total</Text><Text style={s.billAmt}>{fmt$(jobTotal)}</Text></View>
              {tipCents > 0 && <View style={s.billRow}><Text style={s.billLabel}>Tip</Text><Text style={s.billAmt}>+{fmt$(tipCents)}</Text></View>}
              <View style={[s.divider, { marginVertical: 8 }]} />
              <View style={s.billRow}>
                <Text style={[s.billLabel, { fontWeight: '900', color: O.txt, fontSize: 16 }]}>Total</Text>
                <Text style={[s.billAmt, { fontSize: 24, color: O.orange }]}>{fmt$(grandTotal)}</Text>
              </View>
            </View>

            <TouchableOpacity
              style={cs.approveBtn}
              onPress={handleApprove}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Approve and pay ${fmt$(grandTotal)}`}
              accessibilityHint="Releases payment to contractor and completes the job"
            >
              <Ionicons name="shield-checkmark" size={20} color="#fff" />
              <Text style={cs.approveBtnTxt}>Approve & Pay {fmt$(grandTotal)}</Text>
            </TouchableOpacity>

            <Text style={[s.billMeta, { textAlign: 'center', marginTop: 14, paddingBottom: 16 }]}>
              By approving, you release payment to the contractor. This cannot be undone.
            </Text>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const cs = StyleSheet.create({
  container:     { flex: 1, backgroundColor: O.bg },
  centeredWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  processingTxt: { fontSize: 16, color: O.txt2, fontWeight: '600', marginTop: 12 },
  successIcon:   { width: 100, height: 100, borderRadius: 50, backgroundColor: O.green, alignItems: 'center', justifyContent: 'center', shadowColor: O.green, shadowOpacity: 0.35, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  successTitle:  { fontSize: 28, fontWeight: '900', color: O.txt, textAlign: 'center' },
  successSub:    { fontSize: 15, color: O.txt2, textAlign: 'center' },
  primaryBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: O.orange, borderRadius: 14, paddingVertical: 15 },
  primaryBtnTxt: { fontSize: 16, fontWeight: '800', color: '#fff' },
  sheetTitle:    { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: O.txt },
  label:         { fontSize: 10, fontWeight: '800', color: O.txt3, letterSpacing: 0.8, marginBottom: 8 },
  billCard:      { backgroundColor: O.card, borderRadius: 14, borderWidth: 1, borderColor: O.border, padding: 14 },
  tipGrid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tipChip:       { flex: 1, minWidth: '18%', borderRadius: 12, borderWidth: 1.5, borderColor: O.border, backgroundColor: O.cardAlt, paddingVertical: 10, paddingHorizontal: 8, alignItems: 'center' },
  tipChipActive: { borderColor: O.orange, backgroundColor: O.orangeMu },
  tipChipTxt:    { fontSize: 14, fontWeight: '700', color: O.txt3 },
  tipChipTxtActive: { color: O.orange },
  tipChipSub:    { fontSize: 11, color: O.txt3, marginTop: 2 },
  inputWrap:     { backgroundColor: O.cardAlt, borderRadius: 12, borderWidth: 1, borderColor: O.border, paddingHorizontal: 14, height: 52 },
  reviewInput:   { backgroundColor: O.cardAlt, borderRadius: 12, borderWidth: 1, borderColor: O.border, padding: 14, fontSize: 14, color: O.txt, lineHeight: 20, minHeight: 80 },
  approveBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: O.orange, borderRadius: 16, paddingVertical: 18, marginTop: 16 },
  approveBtnTxt: { fontSize: 17, fontWeight: '900', color: '#fff' },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CustomerWorkOrderScreen() {
  const { id: paramId, booking_id: paramBookingId } = useLocalSearchParams<{ id?: string; booking_id?: string }>();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  useAuth();

  // ── Data state ────────────────────────────────────────────────────────────
  const [wo,            setWo]         = useState<WoData | null>(null);
  const [contractor,    setContractor] = useState<ContractorProfile | null>(null);
  const [lineItems,     setLineItems]  = useState<LineItem[]>([]);
  const [progressItems, setProgress]  = useState<ProgressItem[]>([]);
  const [events,        setEvents]    = useState<WoEvent[]>([]);
  const [media,         setMedia]     = useState<WoMedia[]>([]);
  const [paymentIntent, setPI]        = useState<PaymentIntent | null>(null);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [loading,          setLoading]         = useState(true);
  const [showCompletion,   setShowCompletion]   = useState(false);
  const [showLearnMore,    setShowLearnMore]    = useState(false);
  const [shareLocation,    setShareLocation]    = useState(false);
  const [securingPayment,  setSecuringPayment]  = useState(false);
  const [myLoc,            setMyLoc]            = useState<{ lat: number; lng: number } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<SectionKey>>(
    new Set(['timeline', 'media', 'support'] as SectionKey[])
  );

  // ── Contractor live location ───────────────────────────────────────────────
  const [contractorCoord, setContractorCoord] = useState<[number, number] | null>(null);
  const [etaSec,  setEtaSec]  = useState<number | null>(null);
  const [distanceM, setDistM] = useState<number | null>(null);

  const currentPosRef = useRef<{ lat: number; lng: number } | null>(null);
  const interpRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  const interpolateTo = useCallback((toLat: number, toLng: number) => {
    if (interpRef.current) clearInterval(interpRef.current);
    const from = currentPosRef.current ?? { lat: toLat, lng: toLng };
    const start = Date.now();
    const DURATION = 9000;
    interpRef.current = setInterval(() => {
      const t   = Math.min((Date.now() - start) / DURATION, 1);
      const lat = from.lat + (toLat - from.lat) * t;
      const lng = from.lng + (toLng - from.lng) * t;
      currentPosRef.current = { lat, lng };
      setContractorCoord([lng, lat]);
      if (t >= 1) { clearInterval(interpRef.current!); interpRef.current = null; }
    }, 100);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Load
  // ─────────────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    const filter = paramId
      ? { col: 'id', val: paramId }
      : { col: 'booking_id', val: paramBookingId! };

    const { data: woData } = await supabase
      .from('work_orders')
      .select('*, booking:bookings(trade,description,price_estimate,customer_id,job_lat,job_lng)')
      .eq(filter.col, filter.val)
      .maybeSingle();

    if (!woData) { setLoading(false); return; }
    setWo(woData);

    if (woData.wo_status === 'awaiting_approval') setShowCompletion(true);

    const [ctRes, liRes, piRes, progRes, evRes, mediaRes, locRes] = await Promise.all([
      supabase.from('contractors_public').select('id,company_name,username,avatar_url,rating,total_bookings,acceptance_rate,verification_status,license_verified,insured,trade_type,phone').eq('id', woData.contractor_id).maybeSingle(),
      supabase.from('payment_line_items').select('*').eq('work_order_id', woData.id).order('created_at'),
      woData.payment_intent_id
        ? supabase.from('payment_intents').select('id,status,amount_cents').eq('id', woData.payment_intent_id).maybeSingle()
        : { data: null },
      supabase.from('work_progress_items').select('*').eq('work_order_id', woData.id).order('sort_order'),
      supabase.from('work_order_events').select('*').eq('work_order_id', woData.id).order('created_at', { ascending: false }),
      supabase.from('work_order_media').select('*').eq('work_order_id', woData.id).order('created_at'),
      supabase.from('contractor_locations').select('lat,lng,heading').eq('work_order_id', woData.id).maybeSingle(),
    ]);

    setContractor(ctRes.data as ContractorProfile | null);
    setLineItems((liRes.data ?? []) as LineItem[]);
    setPI(piRes.data ?? null);
    setProgress((progRes.data ?? []) as ProgressItem[]);
    setEvents((evRes.data ?? []) as WoEvent[]);
    setMedia(await Promise.all((mediaRes.data ?? []).map(async (m: any) => ({
      ...m,
      _publicUrl: (await supabase.storage.from('work-orders').createSignedUrl(m.storage_path, 3600)).data?.signedUrl ?? null,
    }))) as WoMedia[]);

    if (locRes.data) {
      const loc = locRes.data as any;
      if (loc.lat && loc.lng) interpolateTo(loc.lat, loc.lng);
    }

    setLoading(false);
  }, [paramId, paramBookingId, interpolateTo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { if (interpRef.current) clearInterval(interpRef.current); }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!wo?.id) return;

    const ch = supabase
      .channel(`wo_customer_${wo.id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'work_orders', filter: `id=eq.${wo.id}` },
        (p) => {
          const updated = p.new as any;
          setWo(prev => prev ? { ...prev, ...updated } : prev);
          if (updated.wo_status === 'awaiting_approval') {
            setShowCompletion(true);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          // Contractor requested early start — show approval alert
          if (updated.early_start_requested && !updated.early_start_approved) {
            Alert.alert(
              'Early start requested',
              `${updated.contractor_name || 'Your contractor'} wants to start early. Approve?`,
              [
                { text: 'Decline', style: 'cancel' },
                {
                  text: 'Approve',
                  onPress: async () => {
                    await supabase.functions.invoke('work-order-transition', {
                      body: { work_order_id: updated.id, new_status: 'early_start_approve' },
                    });
                  },
                },
              ]
            );
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'work_order_media', filter: `work_order_id=eq.${wo.id}` },
        () => supabase.from('work_order_media').select('*').eq('work_order_id', wo.id).order('created_at')
               .then(async ({ data }) => {
                 if (!data) return;
                 const withUrls = await Promise.all(data.map(async (m: any) => ({
                   ...m,
                   _publicUrl: (await supabase.storage.from('work-orders').createSignedUrl(m.storage_path, 3600)).data?.signedUrl ?? null,
                 })));
                 setMedia(withUrls as WoMedia[]);
               }))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'contractor_locations', filter: `work_order_id=eq.${wo.id}` },
        (p) => {
          const loc = p.new as any;
          if (!loc?.lat || !loc?.lng) return;
          interpolateTo(loc.lat, loc.lng);
          const jobLat = wo.booking?.job_lat;
          const jobLng = wo.booking?.job_lng;
          if (jobLat && jobLng) {
            const R = 6371000;
            const f1 = loc.lat * Math.PI / 180, f2 = jobLat * Math.PI / 180;
            const df = (jobLat - loc.lat) * Math.PI / 180, dl = (jobLng - loc.lng) * Math.PI / 180;
            const a  = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
            const d  = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            setDistM(d);
            setEtaSec(Math.round((d / 1000) / 50 * 3600));
          }
        })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [wo?.id, wo?.booking?.job_lat, wo?.booking?.job_lng, interpolateTo]);

  // ── Share location ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!shareLocation) { setMyLoc(null); return; }
    Location.requestForegroundPermissionsAsync().then(({ status }) => {
      if (status !== 'granted') { setShareLocation(false); return; }
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).then(loc => {
        setMyLoc({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      });
    });
  }, [shareLocation]);

  // ── Mock payment hold ─────────────────────────────────────────────────────
  const securePayment = useCallback(async () => {
    if (!wo) return;
    setSecuringPayment(true);
    try {
      const amount_cents = Math.round((wo.booking?.price_estimate ?? 0) * 100);
      const { data: pi, error: piErr } = await supabase
        .from('payment_intents')
        .insert({
          booking_id:   wo.booking_id,
          customer_id:  wo.customer_id,
          contractor_id: wo.contractor_id,
          amount_cents: amount_cents || 0,
          status:       'held',
          held_at:      new Date().toISOString(),
        })
        .select('id,status,amount_cents')
        .single();

      if (piErr || !pi) throw new Error(piErr?.message ?? 'Payment failed');

      const { error: woErr } = await supabase
        .from('work_orders')
        .update({ payment_intent_id: pi.id, wo_status: 'deposit_secured' })
        .eq('id', wo.id);

      if (woErr) throw new Error(woErr.message);

      setWo(prev => prev ? { ...prev, wo_status: 'deposit_secured', payment_intent_id: pi.id } : prev);
      setPI(pi as PaymentIntent);
    } catch (e: any) {
      Alert.alert('Payment Error', e.message ?? 'Could not secure payment. Please try again.');
    }
    setSecuringPayment(false);
  }, [wo]);

  // ── Change order handlers ──────────────────────────────────────────────────
  const approveChangeOrder = useCallback(async (id: string) => {
    const { error } = await supabase.from('payment_line_items').update({ approval_status: 'approved' }).eq('id', id);
    if (error) Alert.alert('Error', error.message);
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const rejectChangeOrder = useCallback(async (id: string) => {
    const { error } = await supabase.from('payment_line_items').update({ approval_status: 'rejected' }).eq('id', id);
    if (error) Alert.alert('Error', error.message);
  }, []);

  // ── Section toggle ─────────────────────────────────────────────────────────
  const toggleSection = useCallback((key: SectionKey) => {
    setCollapsed(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
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
          <SkeletonHero />
          <SkeletonContractorCard />
          <SkeletonBillSection />
          <SkeletonChecklist />
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
            <Text style={{ color: O.orange, fontWeight: '700' }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const basePrice      = wo.booking?.price_estimate ?? 0;
  const heldCents      = paymentIntent?.amount_cents ?? (basePrice * 100);
  const pendingCOCount = lineItems.filter(i => i.approval_status === 'pending').length;
  const isEnRoute      = wo.wo_status === 'en_route';
  const isArrived      = wo.wo_status === 'arrived';
  const isMapStage     = isEnRoute || isArrived;
  const isAwaiting     = wo.wo_status === 'awaiting_approval';
  const FOOTER_H       = isAwaiting ? 90 + insets.bottom : 0;

  const jobLat = wo.booking?.job_lat;
  const jobLng = wo.booking?.job_lng;
  const chatPath = `/work-order/chat?work_order_id=${wo.id}` as any;

  // Shared sections rendered in normal FlatList or sheet body
  function sharedSections() {
    return (
      <>
        <ContractorCard
          contractor={contractor}
          woId={wo!.id}
          collapsed={collapsed.has('contractor')}
          onToggle={() => toggleSection('contractor')}
        />
        <BillSection
          items={lineItems}
          basePrice={basePrice}
          collapsed={collapsed.has('bill')}
          onToggle={() => toggleSection('bill')}
          onApprove={approveChangeOrder}
          onReject={rejectChangeOrder}
        />
        <ProgressSection
          items={progressItems}
          media={media}
          collapsed={collapsed.has('progress')}
          onToggle={() => toggleSection('progress')}
        />
        <TimelineSection
          events={events}
          collapsed={collapsed.has('timeline')}
          onToggle={() => toggleSection('timeline')}
        />
        <SupportSection
          wo={wo!}
          collapsed={collapsed.has('support')}
          onToggle={() => toggleSection('support')}
        />
      </>
    );
  }

  // ── MAP STAGE: full-screen map + bottom sheet (Uber-style) ─────────────────
  if (isMapStage) {
    return (
      <View style={s.container}>

        {/* Full-screen Mapbox map */}
        <MapboxGL.MapView
          style={StyleSheet.absoluteFill}
          styleURL={MapboxGL.StyleURL.Dark}
          pitchEnabled={false}
          rotateEnabled={false}
        >
          {jobLat && jobLng ? (
            <MapboxGL.Camera
              centerCoordinate={
                contractorCoord
                  ? [
                      (contractorCoord[0] + jobLng) / 2,
                      (contractorCoord[1] + jobLat) / 2,
                    ]
                  : [jobLng, jobLat]
              }
              zoomLevel={13}
              animationMode="flyTo"
              animationDuration={800}
            />
          ) : (
            <MapboxGL.Camera
              centerCoordinate={DEFAULT_MAP_REGION.centerCoordinate}
              zoomLevel={DEFAULT_MAP_REGION.zoomLevel}
              animationMode="none"
            />
          )}

          {/* Contractor live position */}
          {contractorCoord && (
            <MapboxGL.PointAnnotation id="contractorLive" coordinate={contractorCoord}>
              <View style={s.contractorDot}>
                <Text style={{ fontSize: 18 }}>🚚</Text>
              </View>
            </MapboxGL.PointAnnotation>
          )}

          {/* Job pin */}
          {jobLat && jobLng && (
            <MapboxGL.PointAnnotation id="jobPin" coordinate={[jobLng, jobLat]}>
              <View style={s.mapPin}>
                <View style={s.mapPinInner} />
              </View>
            </MapboxGL.PointAnnotation>
          )}

          {/* Customer location if sharing */}
          {myLoc && (
            <MapboxGL.PointAnnotation id="customerPin" coordinate={[myLoc.lng, myLoc.lat]}>
              <View style={[s.contractorDot, { backgroundColor: 'rgba(56,189,248,0.2)' }]}>
                <Text style={{ fontSize: 14 }}>📍</Text>
              </View>
            </MapboxGL.PointAnnotation>
          )}
        </MapboxGL.MapView>

        {/* Translucent back button overlay */}
        <View style={[s.mapOverlayBar, { top: insets.top + 8 }]}>
          <TouchableOpacity
            style={s.mapBackBtn}
            onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="chevron-back" size={22} color="#fff" />
          </TouchableOpacity>
          {isArrived && (
            <View style={s.arrivedPill}>
              <Text style={s.arrivedPillTxt}>📍 Arrived</Text>
            </View>
          )}
        </View>

        {/* Bottom sheet */}
        <WorkOrderSheet
          initialSnap="collapsed"
          topInset={insets.top}
          header={
            <View style={s.sheetHeader}>
              {/* Contractor avatar */}
              <View style={s.sheetAvatar}>
                {contractor?.avatar_url
                  ? <Image source={{ uri: contractor.avatar_url }} style={StyleSheet.absoluteFillObject as any} resizeMode="cover" />
                  : <Text style={{ fontSize: 20 }}>👷</Text>}
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.sheetStatusLine}>
                  {isArrived ? 'Arrived at your location' : etaSec != null ? `Arriving in ~${Math.round(etaSec / 60)} min` : 'On the way'}
                </Text>
                <Text style={s.sheetContractorName}>{wo.contractor_name}</Text>
              </View>
              <TouchableOpacity
                style={s.sheetChatBtn}
                onPress={() => router.push(chatPath)}
                accessibilityRole="button"
                accessibilityLabel="Chat with contractor"
              >
                <Ionicons name="chatbubble" size={18} color={O.orange} />
              </TouchableOpacity>
            </View>
          }
        >
          {/* Share location toggle */}
          <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
            <TouchableOpacity
              style={s.sheetShareBtn}
              onPress={() => setShareLocation(v => !v)}
              accessibilityRole="switch"
              accessibilityLabel="Share my location with contractor"
              accessibilityState={{ checked: shareLocation }}
            >
              <Ionicons
                name={shareLocation ? 'location' : 'location-outline'}
                size={14}
                color={shareLocation ? O.orange : O.txt2}
              />
              <Text style={[s.sheetShareTxt, { color: shareLocation ? O.orange : O.txt2 }]}>
                {shareLocation ? 'Sharing my location' : 'Share my location'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* All other sections */}
          <View style={{ paddingHorizontal: 14 }}>
            {sharedSections()}
          </View>
        </WorkOrderSheet>

        <LearnMoreSheet visible={showLearnMore} onClose={() => setShowLearnMore(false)} />
        <CompletionSheet
          visible={showCompletion}
          wo={wo}
          items={lineItems}
          basePrice={basePrice}
          pi={paymentIntent}
          onClose={() => setShowCompletion(false)}
          onCompleted={() => {
            setShowCompletion(false);
            router.replace(`/work-order/receipt?id=${wo.id}` as any);
          }}
        />
      </View>
    );
  }

  // ── NON-MAP STAGES: normal FlatList layout ─────────────────────────────────
  const NON_MAP_SECTIONS: SectionKey[] = ['hero', 'contractor', 'bill', 'progress', 'timeline', 'support'];

  function renderSection({ item: key }: { item: SectionKey }) {
    switch (key) {
      case 'hero':
        return <HeroSection wo={wo!} eta={etaSec} onLearnMore={() => setShowLearnMore(true)} heldCents={heldCents} onSecurePayment={securePayment} securingPayment={securingPayment} />;
      case 'contractor':
        return <ContractorCard contractor={contractor} woId={wo!.id} collapsed={collapsed.has('contractor')} onToggle={() => toggleSection('contractor')} />;
      case 'bill':
        return (
          <BillSection
            items={lineItems}
            basePrice={basePrice}
            collapsed={collapsed.has('bill')}
            onToggle={() => toggleSection('bill')}
            onApprove={approveChangeOrder}
            onReject={rejectChangeOrder}
          />
        );
      case 'progress':
        return <ProgressSection items={progressItems} media={media} collapsed={collapsed.has('progress')} onToggle={() => toggleSection('progress')} />;
      case 'timeline':
        return <TimelineSection events={events} collapsed={collapsed.has('timeline')} onToggle={() => toggleSection('timeline')} />;
      case 'support':
        return <SupportSection wo={wo!} collapsed={collapsed.has('support')} onToggle={() => toggleSection('support')} />;
      default:
        return null;
    }
  }

  return (
    <View style={s.container}>

      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 6 }]}>
        <TouchableOpacity
          style={s.backBtn}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={22} color={O.txt} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{wo.service_type || 'Work Order'}</Text>
          <Text style={s.headerSub}>{wo.work_order_number}</Text>
        </View>
        <TouchableOpacity
          style={s.chatBtn}
          onPress={() => router.push(chatPath)}
          accessibilityRole="button"
          accessibilityLabel="Open chat with contractor"
        >
          <Ionicons name="chatbubble-outline" size={20} color={O.orange} />
        </TouchableOpacity>
      </View>

      {/* Change order banner */}
      {pendingCOCount > 0 && (
        <TouchableOpacity
          style={s.coBanner}
          onPress={() => setCollapsed(prev => { const n = new Set(prev); n.delete('bill'); return n; })}
        >
          <Ionicons name="alert-circle" size={16} color={O.amber} />
          <Text style={s.coBannerTxt}>
            {pendingCOCount} change order{pendingCOCount > 1 ? 's' : ''} need{pendingCOCount === 1 ? 's' : ''} your approval
          </Text>
          <Text style={s.coBannerAction}>Review →</Text>
        </TouchableOpacity>
      )}

      {/* Early start approval banner */}
      {wo.early_start_requested && !wo.early_start_approved && (
        <View style={s.earlyStartBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Ionicons name="flash" size={16} color={O.amber} />
            <Text style={s.earlyStartBannerTitle}>Early start requested</Text>
          </View>
          <Text style={s.earlyStartBannerSub}>{wo.contractor_name} wants to start earlier than scheduled.</Text>
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
            <TouchableOpacity
              style={[s.earlyStartBannerBtn, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }]}
              onPress={() => setWo(prev => prev ? { ...prev, early_start_requested: false } : prev)}
              accessibilityRole="button"
              accessibilityLabel="Decline early start"
            >
              <Text style={[s.earlyStartBannerBtnTxt, { color: O.red }]}>Decline</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.earlyStartBannerBtn, { flex: 1, backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' }]}
              onPress={async () => {
                await supabase.functions.invoke('work-order-transition', {
                  body: { work_order_id: wo.id, new_status: 'early_start_approve' },
                });
                setWo(prev => prev ? { ...prev, early_start_approved: true } : prev);
              }}
              accessibilityRole="button"
              accessibilityLabel="Approve early start"
            >
              <Text style={[s.earlyStartBannerBtnTxt, { color: O.green }]}>Approve Early Start ✓</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <FlatList
        data={NON_MAP_SECTIONS}
        keyExtractor={k => k}
        renderItem={renderSection}
        contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: FOOTER_H + 20, paddingTop: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      />

      {/* Sticky approve footer */}
      {isAwaiting && (
        <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity
            style={s.approveFooterBtn}
            onPress={() => setShowCompletion(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Review and approve job"
            accessibilityHint="Opens the job review screen where you can rate the contractor and release payment"
          >
            <Ionicons name="shield-checkmark" size={20} color="#fff" />
            <Text style={s.approveFooterTxt}>Review & Approve Job</Text>
          </TouchableOpacity>
        </View>
      )}

      <LearnMoreSheet visible={showLearnMore} onClose={() => setShowLearnMore(false)} />

      <CompletionSheet
        visible={showCompletion}
        wo={wo}
        items={lineItems}
        basePrice={basePrice}
        pi={paymentIntent}
        onClose={() => setShowCompletion(false)}
        onCompleted={() => {
          setShowCompletion(false);
          router.replace(`/work-order/receipt?id=${wo.id}` as any);
        }}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: O.bg },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
  txt2:        { color: O.txt2, fontSize: 14 },
  divider:     { height: StyleSheet.hairlineWidth, backgroundColor: O.border },

  // Header
  header:      { backgroundColor: O.bg, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: O.border, paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 15, fontWeight: '800', color: O.txt },
  headerSub:   { fontSize: 11, color: O.txt2, marginTop: 1 },
  chatBtn:     { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: O.orangeGl, backgroundColor: O.orangeMu, alignItems: 'center', justifyContent: 'center' },

  // CO banner
  coBanner:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(251,191,36,0.1)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(251,191,36,0.3)', paddingHorizontal: 16, paddingVertical: 10 },
  coBannerTxt:   { flex: 1, fontSize: 13, fontWeight: '600', color: O.amber },
  coBannerAction:{ fontSize: 13, fontWeight: '800', color: O.amber },

  // Early start banner
  earlyStartBanner:     { backgroundColor: 'rgba(251,191,36,0.07)', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(251,191,36,0.2)', paddingHorizontal: 16, paddingVertical: 12 },
  earlyStartBannerTitle:{ fontSize: 14, fontWeight: '700', color: O.amber },
  earlyStartBannerSub:  { fontSize: 13, color: O.txt2 },
  earlyStartBannerBtn:  { borderRadius: 10, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  earlyStartBannerBtnTxt:{ fontSize: 13, fontWeight: '700' },

  // Hero secure payment CTA
  securePayBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: O.orange, borderRadius: 14, paddingVertical: 14, marginTop: 10, marginBottom: 4 },
  securePayTxt:  { fontSize: 15, fontWeight: '800', color: '#fff' },

  // Cards
  card:        { backgroundColor: O.card, borderRadius: 16, borderWidth: 1, borderColor: O.border, marginBottom: 10, overflow: 'hidden' },
  cardHead:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 14 },
  cardHeadLeft:{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardIcon:    { fontSize: 16 },
  cardTitle:   { fontSize: 14, fontWeight: '700', color: O.txt, flex: 1 },
  cardBadge:   { borderRadius: 100, paddingHorizontal: 7, paddingVertical: 2 },
  cardBadgeTxt:{ fontSize: 11, fontWeight: '700' },
  cardBody:    { paddingHorizontal: 16, paddingBottom: 16 },

  // Hero
  heroPill:       { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  heroDot:        { width: 7, height: 7, borderRadius: 4 },
  heroPillTxt:    { fontSize: 12, fontWeight: '700' },
  heroStatusLine: { fontSize: 16, fontWeight: '600', color: O.txt, lineHeight: 24, marginBottom: 16 },
  protectedBox:   { backgroundColor: O.cardAlt, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)', padding: 14, gap: 8 },
  protectedLabel: { fontSize: 10, fontWeight: '800', color: O.green, letterSpacing: 0.8 },
  protectedAmt:   { fontSize: 22, fontWeight: '900', marginTop: 1 },
  protectedSub:   { fontSize: 12, color: O.txt2 },
  learnMoreBtn:   { borderRadius: 8, borderWidth: 1, borderColor: 'rgba(34,197,94,0.25)', backgroundColor: O.greenMu, paddingHorizontal: 10, paddingVertical: 5 },
  learnMoreTxt:   { fontSize: 11, fontWeight: '700', color: O.green },
  woNumLine:      { fontSize: 11, color: O.txt3, marginTop: 10 },

  // Map
  mapWrap:  { borderRadius: 12, overflow: 'hidden', height: 230, position: 'relative' },
  map:      { ...StyleSheet.absoluteFillObject },
  jobPin:   { width: 20, height: 20, borderRadius: 10, borderWidth: 2.5, borderColor: '#fff', backgroundColor: O.orange, alignItems: 'center', justifyContent: 'center' },
  jobPinInner: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#fff' },
  truckMarker: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  myDot:    { width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: '#fff', backgroundColor: O.blue },
  mapChip:  { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: O.orangeMu, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: O.orangeGl },
  mapChipTxt: { fontSize: 12, fontWeight: '700', color: O.orange },
  shareBtn: { position: 'absolute', top: 10, right: 10, flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(13,13,13,0.85)', borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: O.border },
  shareTxt: { fontSize: 11, fontWeight: '600' },

  // Contractor
  contractorAvatar:   { width: 52, height: 52, borderRadius: 14, backgroundColor: O.orangeMu, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  contractorInitials: { fontSize: 18, fontWeight: '800', color: O.orange },
  contractorName:     { fontSize: 16, fontWeight: '800', color: O.txt },
  contractorTrade:    { fontSize: 12, color: O.txt2, marginTop: 1 },
  contractorMeta:     { fontSize: 12, color: O.txt2 },
  badge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, borderWidth: 1, borderColor: O.border, paddingHorizontal: 9, paddingVertical: 4, backgroundColor: O.cardAlt },
  badgeTxt: { fontSize: 11, fontWeight: '700' },
  cActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, borderColor: O.border, backgroundColor: O.cardAlt, paddingVertical: 9, paddingHorizontal: 12 },
  cActionTxt: { fontSize: 13, fontWeight: '600', color: O.orange },

  // Bill
  billRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 10 },
  billLabel: { fontSize: 13, color: O.txt2, flex: 1 },
  billMeta:  { fontSize: 11, color: O.txt3 },
  billAmt:   { fontSize: 15, fontWeight: '800', color: O.orange },
  billGroupLabel: { fontSize: 10, fontWeight: '800', color: O.txt3, letterSpacing: 0.8 },
  changeOrderCard:     { backgroundColor: O.cardAlt, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(251,191,36,0.35)', padding: 14, marginBottom: 10, marginTop: 4 },
  changeOrderBadge:    { backgroundColor: 'rgba(251,191,36,0.12)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' as const },
  changeOrderBadgeTxt: { fontSize: 10, fontWeight: '800', color: O.amber, letterSpacing: 0.5 },
  changeOrderDesc:     { fontSize: 15, fontWeight: '700', color: O.txt, marginBottom: 4 },
  changeOrderMeta:     { fontSize: 12, color: O.txt3, marginBottom: 10 },
  changeOrderTotals:   { flexDirection: 'row', alignItems: 'center', backgroundColor: O.bg, borderRadius: 10, padding: 12 },
  changeOrderArrow:    { paddingHorizontal: 8 },
  changeOrderTotalLabel:    { fontSize: 10, fontWeight: '700', color: O.txt3, letterSpacing: 0.5, marginBottom: 2 },
  changeOrderTotalAmt:      { fontSize: 18, fontWeight: '900' },
  changeOrderBtn:           { borderRadius: 10, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  changeOrderBtnDecline:    { borderWidth: 1, borderColor: O.border, backgroundColor: O.cardAlt, paddingHorizontal: 16 },
  changeOrderBtnDeclineTxt: { fontSize: 14, fontWeight: '600', color: O.txt3 },
  changeOrderBtnApproveTxt: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Progress
  progressBar:  { height: 6, backgroundColor: O.border, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: O.orange, borderRadius: 3 },
  checkRow:  { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: O.border },
  checkBox:  { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: O.border, alignItems: 'center', justifyContent: 'center' },
  checkLabel:{ flex: 1, fontSize: 14, color: O.txt },
  checkTime: { fontSize: 10, color: O.txt3 },
  photoThumb:{ width: 100, height: 100, borderRadius: 10, backgroundColor: O.cardAlt },

  // Timeline
  timelineRow:       { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10 },
  timelineRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: O.border },
  timelineDot:       { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  timelineLabel:     { fontSize: 13, color: O.txt, fontWeight: '500' },
  timelineTime:      { fontSize: 11, color: O.txt3, marginTop: 2 },

  // Support
  supportRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  supportLabel:{ fontSize: 14, fontWeight: '700', color: O.txt },
  supportSub:  { fontSize: 12, color: O.txt2, marginTop: 1 },

  // Footer
  footer:          { backgroundColor: O.card, borderTopWidth: 1, borderTopColor: O.border, paddingHorizontal: 16, paddingTop: 14 },
  approveFooterBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: O.orange, borderRadius: 14, paddingVertical: 16 },
  approveFooterTxt:{ fontSize: 16, fontWeight: '800', color: '#fff' },

  // Map stage overlay
  mapOverlayBar:   { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 10 },
  mapBackBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  arrivedPill:     { backgroundColor: 'rgba(34,197,94,0.25)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(34,197,94,0.5)' },
  arrivedPillTxt:  { fontSize: 13, fontWeight: '700', color: '#22C55E' },
  contractorDot:   { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,98,0,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: O.orange },
  mapPin:          { width: 24, height: 32, alignItems: 'center' },
  mapPinInner:     { width: 16, height: 16, borderRadius: 8, backgroundColor: O.orange, borderWidth: 3, borderColor: '#fff' },

  // Sheet header (inside WorkOrderSheet)
  sheetHeader:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  sheetAvatar:     { width: 44, height: 44, borderRadius: 22, backgroundColor: O.cardAlt, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sheetStatusLine: { fontSize: 12, color: O.txt2, marginBottom: 2 },
  sheetContractorName: { fontSize: 16, fontWeight: '700', color: O.txt },
  sheetChatBtn:    { width: 40, height: 40, borderRadius: 20, backgroundColor: O.orangeMu, alignItems: 'center', justifyContent: 'center' },

  // Share location toggle in sheet
  sheetShareBtn:   { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 20, backgroundColor: O.cardAlt, borderWidth: 1, borderColor: O.border },
  sheetShareTxt:   { fontSize: 12, fontWeight: '600' },
});
