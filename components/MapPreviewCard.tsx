import { BlurView } from 'expo-blur';
import { useEffect, useRef } from 'react';
import {
    Animated, Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { TRADE_ICONS } from '../lib/tradeJobs';

const { width } = Dimensions.get('window');

function StarRating({ rating, size = 12 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Text key={s} style={{ fontSize: size, color: s <= Math.round(rating) ? '#FBBF24' : '#3A3A3A' }}>★</Text>
      ))}
    </View>
  );
}

// ── CONTRACTOR PREVIEW CARD ─────────────────────────────
export function ContractorPreviewCard({
  contractor,
  onClose,
  onViewProfile,
  onMessage,
}: {
  contractor: any;
  onClose: () => void;
  onViewProfile: () => void;
  onMessage: () => void;
}) {
  const slideY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, {
        toValue: 0, friction: 9, tension: 70, useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1, duration: 200, useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: 300, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const initials = (contractor.company_name ?? '?')
    .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
  const tradeIcon = TRADE_ICONS[contractor.trade_type] ?? '🔧';

  return (
    <Animated.View
      style={[
        styles.cardContainer,
        { transform: [{ translateY: slideY }], opacity },
      ]}
      pointerEvents="box-none"
    >
      <BlurView intensity={40} tint="dark" style={styles.card}>
        <View style={styles.cardInner}>
          <View style={styles.dragHandle} />

          {/* Close */}
          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>

          {/* Header row */}
          <View style={styles.headerRow}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              {contractor.is_available && <View style={styles.onlineDot} />}
            </View>

            <View style={styles.headerInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.companyName} numberOfLines={1}>
                  {contractor.company_name}
                </Text>
                {contractor.verified && (
                  <View style={styles.verifiedBadge}>
                    <Text style={styles.verifiedIcon}>✓</Text>
                  </View>
                )}
              </View>

              <View style={styles.tradeRow}>
                <Text style={styles.tradeIcon}>{tradeIcon}</Text>
                <Text style={styles.tradeName}>{contractor.trade_type ?? 'General'}</Text>
              </View>

              <View style={styles.metaRow}>
                <StarRating rating={contractor.rating ?? 5} />
                <Text style={styles.metaText}>
                  {(contractor.rating ?? 5).toFixed(1)} ({contractor.review_count ?? 0})
                </Text>
                <View style={styles.metaDot} />
                <Text style={styles.metaText}>
                  {contractor.distance_miles ?? '—'} mi
                </Text>
              </View>
            </View>
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{contractor.total_bookings ?? 0}</Text>
              <Text style={styles.statLabel}>Jobs Done</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{contractor.experience ?? 'New'}</Text>
              <Text style={styles.statLabel}>Experience</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                ${contractor.hourly_rate ?? '—'}
              </Text>
              <Text style={styles.statLabel}>Per Hour</Text>
            </View>
          </View>

          {/* Bio */}
          {contractor.description && (
            <Text style={styles.bio} numberOfLines={2}>
              {contractor.description}
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.profileBtn} onPress={onViewProfile}>
              <Text style={styles.profileBtnText}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.messageBtn} onPress={onMessage}>
              <Text style={styles.messageBtnText}>Message</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Animated.View>
  );
}

// ── JOB PREVIEW CARD ────────────────────────────────────
function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (mins > 0) return `${mins}m ago`;
  return 'Just now';
}

export function JobPreviewCard({
  job,
  onClose,
  onViewDetails,
  onAccept,
}: {
  job: any;
  onClose: () => void;
  onViewDetails: () => void;
  onAccept: () => void;
}) {
  const slideY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, friction: 9, tension: 70, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideY, { toValue: 300, duration: 220, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  const tradeIcon = TRADE_ICONS[job.trade] ?? '🔧';

  return (
    <Animated.View
      style={[
        styles.cardContainer,
        { transform: [{ translateY: slideY }], opacity },
      ]}
      pointerEvents="box-none"
    >
      <BlurView intensity={40} tint="dark" style={styles.card}>
        <View style={styles.cardInner}>
          <View style={styles.dragHandle} />

          <TouchableOpacity style={styles.closeBtn} onPress={handleClose}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>

          {/* Trade pill */}
          <View style={styles.jobTopRow}>
            <View style={styles.jobTradePill}>
              <Text style={styles.jobTradePillIcon}>{tradeIcon}</Text>
              <Text style={styles.jobTradePillText}>{job.trade}</Text>
            </View>
            <Text style={styles.jobTimeAgo}>{timeAgo(job.created_at)}</Text>
          </View>

          {/* Description */}
          <Text style={styles.jobDescription} numberOfLines={3}>
            {job.description}
          </Text>

          {/* Meta */}
          <View style={styles.jobMetaGrid}>
            <View style={styles.jobMetaItem}>
              <Text style={styles.jobMetaIcon}>💰</Text>
              <View>
                <Text style={styles.jobMetaLabel}>Budget</Text>
                <Text style={styles.jobMetaValue}>
                  {job.price_estimate > 0 ? `$${job.price_estimate.toLocaleString()}` : 'Quote'}
                </Text>
              </View>
            </View>
            <View style={styles.jobMetaItem}>
              <Text style={styles.jobMetaIcon}>📍</Text>
              <View>
                <Text style={styles.jobMetaLabel}>Distance</Text>
                <Text style={styles.jobMetaValue}>
                  {job.distance_miles ?? '—'} mi
                </Text>
              </View>
            </View>
            <View style={styles.jobMetaItem}>
              <Text style={styles.jobMetaIcon}>⏰</Text>
              <View>
                <Text style={styles.jobMetaLabel}>Schedule</Text>
                <Text style={styles.jobMetaValue} numberOfLines={1}>
                  {job.booking_time ?? 'Flexible'}
                </Text>
              </View>
            </View>
          </View>

          {/* Privacy note */}
          <View style={styles.privacyNote}>
            <Text style={styles.privacyIcon}>🔒</Text>
            <Text style={styles.privacyText}>
              Exact address unlocks after you accept this job.
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.profileBtn} onPress={onViewDetails}>
              <Text style={styles.profileBtnText}>View Details</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.messageBtn} onPress={onAccept}>
              <Text style={styles.messageBtnText}>Accept Job</Text>
            </TouchableOpacity>
          </View>
        </View>
      </BlurView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cardContainer: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    borderRadius: 24, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 20,
  },
  card: {
    borderRadius: 24, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardInner: {
    backgroundColor: 'rgba(15,15,15,0.85)',
    padding: 18, gap: 14, position: 'relative',
  },
  dragHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center', marginBottom: 2,
  },
  closeBtn: {
    position: 'absolute', top: 12, right: 12,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 5,
  },
  closeIcon: { color: '#aaa', fontSize: 12, fontWeight: '700' },

  headerRow: { flexDirection: 'row', gap: 14, paddingTop: 4 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#FF6200',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: 'rgba(255,98,0,0.4)',
  },
  avatarText: { fontSize: 20, fontWeight: '900', color: '#0A0A0A' },
  onlineDot: {
    position: 'absolute', bottom: 0, right: 0,
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#22C55E',
    borderWidth: 2, borderColor: 'rgba(15,15,15,1)',
  },

  headerInfo: { flex: 1, gap: 3, paddingRight: 30 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  companyName: { fontSize: 17, fontWeight: '900', color: '#fff', flex: 1 },
  verifiedBadge: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: '#22C55E',
    alignItems: 'center', justifyContent: 'center',
  },
  verifiedIcon: { fontSize: 10, color: '#fff', fontWeight: '900' },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tradeIcon: { fontSize: 13 },
  tradeName: { fontSize: 13, color: '#FF6200', fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 11, color: '#888' },
  metaDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#555' },

  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 12,
  },
  statBox: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 15, fontWeight: '900', color: '#fff' },
  statLabel: { fontSize: 10, color: '#888', fontWeight: '600' },
  statDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },

  bio: { fontSize: 13, color: '#aaa', lineHeight: 19 },

  actionsRow: { flexDirection: 'row', gap: 10 },
  profileBtn: {
    flex: 1, height: 46, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  profileBtnText: { fontSize: 13, fontWeight: '700', color: '#ddd' },
  messageBtn: {
    flex: 1, height: 46, borderRadius: 13,
    backgroundColor: '#FF6200',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#FF6200', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 12, elevation: 6,
  },
  messageBtnText: { fontSize: 13, fontWeight: '900', color: '#0A0A0A' },

  // Job
  jobTopRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 4,
  },
  jobTradePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 100,
    backgroundColor: 'rgba(255,98,0,0.15)',
    borderWidth: 1, borderColor: 'rgba(255,98,0,0.4)',
  },
  jobTradePillIcon: { fontSize: 13 },
  jobTradePillText: { fontSize: 12, fontWeight: '800', color: '#FF6200' },
  jobTimeAgo: { fontSize: 11, color: '#666' },

  jobDescription: { fontSize: 15, color: '#fff', fontWeight: '600', lineHeight: 22 },

  jobMetaGrid: {
    flexDirection: 'row', gap: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
  },
  jobMetaItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobMetaIcon: { fontSize: 18 },
  jobMetaLabel: { fontSize: 10, color: '#666', fontWeight: '600' },
  jobMetaValue: { fontSize: 12, color: '#fff', fontWeight: '700' },

  privacyNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(34,197,94,0.2)',
    padding: 10,
  },
  privacyIcon: { fontSize: 12 },
  privacyText: { flex: 1, fontSize: 11, color: '#22C55E', lineHeight: 16 },
});