import { Ionicons } from '@expo/vector-icons';
import NoAccountOverlay from '@/components/NoAccountOverlay';
import VerificationGate from '@/components/VerificationGate';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../../constants/Layout';
import { Font, Radius } from '../../constants/theme';
import { useTheme, AppColors } from '@/context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { useRole } from '../../hooks/useRole';
import { supabase } from '../../lib/supabase';


function createStyles(C: AppColors) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: C.background },
    loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },

    pageHeader: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.sm,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.border,
    },
    pageTitle: { fontSize: 26, fontWeight: Font.black, color: C.textPrimary },

    scroll: {
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      gap: Spacing.md,
    },

    // Profile card
    profileCard: {
      backgroundColor: C.surface,
      borderRadius: Radius.xl,
      borderWidth: 1,
      borderColor: C.border,
      padding: Spacing.lg,
      gap: 10,
    },
    avatarRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    avatarWrapper: { position: 'relative' },
    avatar: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: C.orange,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: C.orangeDim,
    },
    avatarContractor: { backgroundColor: '#38BDF8' },
    avatarText: { fontSize: 28, fontWeight: Font.black, color: C.background },
    avatarEditBtn: {
      position: 'absolute',
      bottom: 0,
      right: 0,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: C.surface,
      borderWidth: 2,
      borderColor: C.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarEditIcon: { fontSize: 14 },

    avatarActions: { alignItems: 'flex-end', gap: 10 },
    settingsBtn: {
      width: 34,
      height: 34,
      borderRadius: Radius.md,
      backgroundColor: C.surface,
      borderWidth: 1,
      borderColor: C.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editProfileBtn: {
      backgroundColor: C.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: C.border,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    editProfileText: { fontSize: 13, fontWeight: Font.semibold, color: C.textPrimary },

    profileName:     { fontSize: 22, fontWeight: Font.black, color: C.textPrimary },
    profileUsername: { fontSize: 14, color: C.textSecondary },
    profileMeta:     { gap: 6 },
    profileMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    profileMetaIcon: { fontSize: 14, width: 20 },
    profileMetaText: { fontSize: 13, color: C.textSecondary },
    profileMetaLink: { color: C.orange },
    ratingRow:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    ratingValue:     { fontSize: 16, fontWeight: Font.black, color: C.textPrimary },
    ratingCount:     { fontSize: 13, color: C.textSecondary },

    statsRow: {
      flexDirection: 'row',
      backgroundColor: C.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: Spacing.md,
    },
    statCard:    { flex: 1, alignItems: 'center', gap: 4 },
    statValue:   { fontSize: 20, fontWeight: Font.black, color: C.textPrimary },
    statLabel:   { fontSize: 11, color: C.textSecondary, fontWeight: Font.semibold },
    statDivider: { width: 1, backgroundColor: C.border },

    section:      { gap: 12 },
    sectionTitle: { fontSize: 11, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 1.5 },

    trustRow: { flexDirection: 'row', gap: 10 },
    trustBadge: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: 'rgba(34,197,94,0.08)',
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: 'rgba(34,197,94,0.25)',
      paddingVertical: 10,
    },
    trustBadgeInactive: { backgroundColor: C.surface, borderColor: C.border },
    trustIcon:          { fontSize: 14 },
    trustLabel:         { fontSize: 11, fontWeight: Font.bold, color: '#22C55E' },
    trustLabelInactive: { color: C.textMuted },

    verifyBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: Radius.lg,
      borderWidth: 1,
      padding: Spacing.md,
    },
    verifyBannerOrange: {
      backgroundColor: 'rgba(249,115,22,0.08)',
      borderColor: 'rgba(249,115,22,0.25)',
    },
    verifyBannerYellow: {
      backgroundColor: 'rgba(251,191,36,0.08)',
      borderColor: 'rgba(251,191,36,0.25)',
    },
    verifyBannerRed: {
      backgroundColor: 'rgba(239,68,68,0.08)',
      borderColor: 'rgba(239,68,68,0.25)',
    },
    verifyBannerText: {
      flex: 1,
      fontSize: 13,
      fontWeight: Font.semibold,
    },
    verifyBannerTextOrange: { color: '#F97316' },
    verifyBannerTextYellow: { color: '#FBBF24' },
    verifyBannerTextRed:    { color: '#EF4444' },
    verifyBannerGreen: {
      backgroundColor: 'rgba(34,197,94,0.08)',
      borderColor: 'rgba(34,197,94,0.25)',
    },
    verifyBannerTextGreen: { color: '#22C55E' },

    pendingBanner: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: 'rgba(251,191,36,0.08)',
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: 'rgba(251,191,36,0.25)',
      padding: Spacing.md,
      alignItems: 'flex-start',
    },
    pendingIcon:  { fontSize: 20 },
    pendingInfo:  { flex: 1 },
    pendingTitle: { fontSize: 14, fontWeight: Font.bold, color: '#FBBF24', marginBottom: 2 },
    pendingSub:   { fontSize: 12, color: '#FBBF24', opacity: 0.8, lineHeight: 18 },

    bioCard: {
      backgroundColor: C.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: Spacing.md,
    },
    bioText: { fontSize: 14, color: C.textPrimary, lineHeight: 22 },

    menuCard: {
      backgroundColor: C.surface,
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.border,
      overflow: 'hidden',
    },
    menuItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingVertical: 16,
    },
    menuItemLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
    menuIcon:        { fontSize: 18, width: 24 },
    menuLabel:       { fontSize: 15, color: C.textPrimary, fontWeight: Font.medium },
    menuLabelDanger: { color: C.error },
    menuArrow:       { fontSize: 20, color: C.textMuted },
    menuDivider:     { height: 1, backgroundColor: C.border, marginHorizontal: Spacing.md },

    // Company profile card
    companyProfileCard: {
      backgroundColor: 'rgba(255,98,0,0.04)',
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: 'rgba(255,98,0,0.4)',
      padding: 16,
      gap: 12,
    },
    companyProfileName:      { fontSize: 16, fontWeight: Font.black, color: C.textPrimary },
    companyProfileTagline:   { fontSize: 13, color: C.textSecondary },
    companyProfileChip:      { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4 },
    companyProfileChipText:  { fontSize: 12, color: C.orange, fontWeight: Font.bold },
    companyProfileEditRow:   { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6 },
    companyProfileEditText:  { fontSize: 13, fontWeight: Font.black, color: C.orange },
    companyProfileIconBox: {
      width: 46, height: 46, borderRadius: 12,
      backgroundColor: 'rgba(255,98,0,0.12)',
      alignItems: 'center' as const, justifyContent: 'center' as const,
    },
    companyProfileSetupTitle: { fontSize: 15, fontWeight: Font.black, color: C.textPrimary },
    companyProfileSetupSub:   { fontSize: 12, color: C.textSecondary, lineHeight: 18 },

    memberSince: { fontSize: 12, color: C.textMuted, textAlign: 'center' },
    signOutBtn: {
      borderRadius: Radius.lg,
      borderWidth: 1,
      borderColor: C.error,
      paddingVertical: 14,
      alignItems: 'center',
    },
    signOutText: { fontSize: 15, fontWeight: Font.bold, color: C.error },
    version:     { fontSize: 12, color: C.textMuted, textAlign: 'center' },
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  const { colors: Colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Text key={s} style={{ fontSize: size, color: s <= Math.round(rating) ? '#FBBF24' : Colors.border }}>
          ★
        </Text>
      ))}
    </View>
  );
}

function TrustBadge({ icon, label, active }: { icon: string; label: string; active: boolean }) {
  const { colors: Colors } = useTheme();
  const styles = createStyles(Colors);
  return (
    <View style={[styles.trustBadge, !active && styles.trustBadgeInactive]}>
      <Text style={styles.trustIcon}>{icon}</Text>
      <Text style={[styles.trustLabel, !active && styles.trustLabelInactive]}>{label}</Text>
    </View>
  );
}

function VerificationBanner({ status, router }: { status: string | undefined; router: ReturnType<typeof useRouter> }) {
  const { colors: Colors } = useTheme();
  const styles = createStyles(Colors);

  if (status === 'approved') {
    return (
      <View style={[styles.verifyBanner, styles.verifyBannerGreen]}>
        <Ionicons name="checkmark-circle" size={18} color="#22C55E" />
        <Text style={[styles.verifyBannerText, styles.verifyBannerTextGreen]}>
          ✓ Tradease Verified
        </Text>
      </View>
    );
  }

  if (status === 'pending_review') {
    return (
      <TouchableOpacity
        style={[styles.verifyBanner, styles.verifyBannerYellow]}
        onPress={() => router.push('/profile/verification-status')}
        activeOpacity={0.8}
      >
        <Text style={[styles.verifyBannerText, styles.verifyBannerTextYellow]}>
          ⏳ Under Review · Usually 24 hours
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#FBBF24" />
      </TouchableOpacity>
    );
  }

  if (status === 'rejected') {
    return (
      <TouchableOpacity
        style={[styles.verifyBanner, styles.verifyBannerRed]}
        onPress={() => router.push('/profile/get-verified')}
        activeOpacity={0.8}
      >
        <Text style={[styles.verifyBannerText, styles.verifyBannerTextRed]}>
          Verification Rejected · Resubmit
        </Text>
        <Ionicons name="chevron-forward" size={16} color="#EF4444" />
      </TouchableOpacity>
    );
  }

  // null or 'unverified'
  return (
    <TouchableOpacity
      style={[styles.verifyBanner, styles.verifyBannerOrange]}
      onPress={() => router.push('/profile/verification-status')}
      activeOpacity={0.8}
    >
      <Text style={[styles.verifyBannerText, styles.verifyBannerTextOrange]}>
        Get Verified · Unlock the job feed
      </Text>
      <Ionicons name="chevron-forward" size={16} color="#F97316" />
    </TouchableOpacity>
  );
}

function MenuItem({ icon, label, onPress, danger, subtitle, locked }: {
  icon: string;
  label: string;
  onPress: () => void;
  danger?: boolean;
  subtitle?: string;
  locked?: boolean;
}) {
  const { colors: Colors } = useTheme();
  const styles = createStyles(Colors);
  return (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.menuItemLeft}>
        <Text style={[styles.menuIcon, locked && { opacity: 0.4 }]}>{icon}</Text>
        <View>
          <Text style={[styles.menuLabel, danger && styles.menuLabelDanger, locked && { color: Colors.textMuted }]}>{label}</Text>
          {!!subtitle && <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>{subtitle}</Text>}
        </View>
      </View>
      {locked
        ? <Ionicons name="lock-closed-outline" size={15} color={Colors.textMuted} />
        : <Text style={styles.menuArrow}>›</Text>
      }
    </TouchableOpacity>
  );
}

// ─── Trusted account criteria — mirrors editable fields in personal-info ──────
// All 5 fields are on the Personal Information screen (equal 20% weight).
// When every field is filled the contractor earns the Trusted Account badge.

const TRUST_FIELDS = [
  { key: 'company_name', label: 'Business name',     weight: 20 },
  { key: 'phone',        label: 'Phone number',      weight: 20 },
  { key: 'location',     label: 'City / location',   weight: 20 },
  { key: 'avatar_url',   label: 'Profile photo',     weight: 20 },
  { key: 'username',     label: 'Username',          weight: 20 },
] as const;

function calcTrustScore(p: any) {
  let score = 0;
  const missing: { key: string; label: string }[] = [];
  for (const f of TRUST_FIELDS) {
    let filled: boolean;
    if (f.key === 'avatar_url') {
      const v = p?.avatar_url ?? p?.avatar;
      filled = v != null && String(v).trim().length > 0;
    } else {
      const val = p?.[f.key];
      filled = val != null && String(val).trim().length > 0;
    }
    if (filled) score += f.weight;
    else missing.push({ key: f.key, label: f.label });
  }
  return { score, missing };
}

// All fields are editable from Personal Information
const FIELD_ROUTES: Record<string, string> = {
  company_name: '/profile/personal-info',
  phone:        '/profile/personal-info',
  location:     '/profile/personal-info',
  avatar_url:   '/profile/edit',
  username:     '/profile/personal-info',
};

function RingProgress({ score, size = 56 }: { score: number; size?: number }) {
  const strokeW = 5;
  const r = (size - strokeW) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - score / 100);
  const cx = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={cx} cy={cx} r={r} stroke="rgba(255,98,0,0.15)" strokeWidth={strokeW} fill="none" />
        <Circle
          cx={cx} cy={cx} r={r}
          stroke="#FF6200" strokeWidth={strokeW} fill="none"
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90, ${cx}, ${cx})`}
        />
      </Svg>
      <Text style={{ fontSize: size < 80 ? 11 : 20, fontWeight: '900', color: '#FF6200' }}>
        {score}%
      </Text>
    </View>
  );
}

// ─── Contractor Profile ───────────────────────────────────────────────────────

function ContractorProfileView({ profile, isOwner, teamActiveCount }: {
  profile: any;
  isOwner: boolean;
  teamActiveCount: number;
}) {
  const { colors: Colors } = useTheme();
  const styles = createStyles(Colors);
  const router = useRouter();
  const { signOut } = useAuth();

  const initials = profile?.company_name
    ? profile.company_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';

  // ── Trusted account tracker ────────────────────────────────
  const [obOpen,    setObOpen]    = useState(false);
  const [obMissing, setObMissing] = useState<{ key: string; label: string }[]>([]);
  const [obScore,   setObScore]   = useState(0);

  // ── Verification gate — shown instead of a bare "Get Verified" link that
  // used to route straight into the raw submission form regardless of
  // status, which is how a pending contractor ended up resubmitting
  // unlimited times. Pending/rejected/unverified all show the gate; its own
  // CTA decides whether that leads to get-verified or nowhere (pending
  // withholds a resubmit option entirely).
  const [verifyGateOpen, setVerifyGateOpen] = useState(false);
  const bannerScale = useRef(new Animated.Value(1)).current;

  const onBannerPressIn = () => Animated.spring(bannerScale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  const onBannerPressOut = () => Animated.spring(bannerScale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 4 }).start();

  useEffect(() => {
    if (!profile) return;
    const { score, missing } = calcTrustScore(profile);
    setObScore(score);
    setObMissing(missing);
  }, [profile?.company_name, profile?.phone, profile?.location, profile?.avatar_url, profile?.username]);

  return (
    <>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* Profile card */}
      <View style={styles.profileCard}>

        {/* Avatar row — avatar left, settings + edit right */}
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrapper}>
            <View style={[styles.avatar, styles.avatarContractor]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <TouchableOpacity style={styles.avatarEditBtn}>
              <Text style={styles.avatarEditIcon}>📷</Text>
            </TouchableOpacity>
            {obScore >= 100 && (
              <View style={{
                position: 'absolute', bottom: 0, left: -2,
                width: 26, height: 26, borderRadius: 13,
                backgroundColor: '#22C55E',
                alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: Colors.background,
              }}>
                <Ionicons name="shield-checkmark" size={13} color="#fff" />
              </View>
            )}
          </View>

          <View style={styles.avatarActions}>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => router.push('/profile/settings')}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={() => router.push('/profile/edit')}
            >
              <Text style={styles.editProfileText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.profileName}>{profile?.company_name ?? 'Your Business'}</Text>
        <Text style={styles.profileUsername}>@{profile?.username ?? 'contractor'}</Text>

        <View style={styles.profileMeta}>
          {profile?.trade_type && (
            <View style={styles.profileMetaItem}>
              <Text style={styles.profileMetaIcon}>🔧</Text>
              <Text style={styles.profileMetaText}>{profile.trade_type}</Text>
            </View>
          )}
          {profile?.location && (
            <View style={styles.profileMetaItem}>
              <Text style={styles.profileMetaIcon}>📍</Text>
              <Text style={styles.profileMetaText}>{profile.location}</Text>
            </View>
          )}
          {profile?.experience && (
            <View style={styles.profileMetaItem}>
              <Text style={styles.profileMetaIcon}>🎓</Text>
              <Text style={styles.profileMetaText}>{profile.experience} experience</Text>
            </View>
          )}
          {profile?.website && (
            <View style={styles.profileMetaItem}>
              <Text style={styles.profileMetaIcon}>🌐</Text>
              <Text style={[styles.profileMetaText, styles.profileMetaLink]}>{profile.website}</Text>
            </View>
          )}
        </View>

        {profile?.rating && (
          <View style={styles.ratingRow}>
            <StarRating rating={profile.rating} size={18} />
            <Text style={styles.ratingValue}>{profile.rating?.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>({profile.review_count ?? 0} reviews)</Text>
          </View>
        )}
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile?.total_bookings ?? 0}</Text>
          <Text style={styles.statLabel}>Jobs Done</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile?.rating?.toFixed(1) ?? '—'}</Text>
          <Text style={styles.statLabel}>Rating</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{profile?.review_count ?? 0}</Text>
          <Text style={styles.statLabel}>Reviews</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: Colors.orange, fontSize: 12 }]}>
            {(profile?.plan ?? 'free').toUpperCase()}
          </Text>
          <Text style={styles.statLabel}>Plan</Text>
        </View>
      </View>

      {/* Trust badges */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>VERIFICATION</Text>
        <View style={styles.trustRow}>
          <TrustBadge icon="✅" label="Verified"  active={profile?.verified ?? false} />
          <TrustBadge icon="🛡️" label="Insured"   active={profile?.insured ?? false} />
          <TrustBadge icon="📋" label="Licensed"  active={profile?.license_verified ?? false} />
        </View>
        <VerificationBanner status={profile?.verification_status} router={router} />
      </View>

      {/* Trusted account status banner */}
      {isOwner && (
        obScore >= 100 ? (
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 12,
            backgroundColor: 'rgba(34,197,94,0.08)',
            borderRadius: Radius.lg, borderWidth: 1,
            borderColor: 'rgba(34,197,94,0.3)',
            padding: Spacing.md,
            shadowColor: '#22C55E', shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
          }}>
            <View style={{
              width: 40, height: 40, borderRadius: 20,
              backgroundColor: 'rgba(34,197,94,0.15)',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="shield-checkmark" size={20} color="#22C55E" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 14, fontWeight: Font.black, color: '#22C55E' }}>
                Trusted Account
              </Text>
              <Text style={{ fontSize: 12, color: '#22C55E', opacity: 0.75 }}>
                All trust criteria met · visible to customers
              </Text>
            </View>
            <View style={{
              backgroundColor: '#22C55E', borderRadius: Radius.full,
              paddingHorizontal: 8, paddingVertical: 3,
            }}>
              <Text style={{ fontSize: 10, fontWeight: Font.black, color: '#000' }}>✓ TRUSTED</Text>
            </View>
          </View>
        ) : (
          <Animated.View style={{ transform: [{ scale: bannerScale }] }}>
            <TouchableOpacity
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 12,
                backgroundColor: 'rgba(255,98,0,0.06)',
                borderRadius: Radius.lg, borderWidth: 1,
                borderColor: 'rgba(255,98,0,0.25)',
                padding: Spacing.md,
                shadowColor: '#FF6200', shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.1, shadowRadius: 6, elevation: 2,
              }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setObOpen(true); }}
              onPressIn={onBannerPressIn}
              onPressOut={onBannerPressOut}
              activeOpacity={1}
            >
              <RingProgress score={obScore} size={52} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 14, fontWeight: Font.bold, color: Colors.orange }}>
                  Get Trusted · {obScore}% done
                </Text>
                <Text style={{ fontSize: 12, color: Colors.orange, opacity: 0.75 }} numberOfLines={1}>
                  {obMissing.length} field{obMissing.length !== 1 ? 's' : ''} left · tap to complete
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.orange} />
            </TouchableOpacity>
          </Animated.View>
        )
      )}

      {/* Company Profile */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>COMPANY PROFILE</Text>
        <TouchableOpacity
          style={styles.companyProfileCard}
          onPress={() => router.push('/profile/company-profile' as any)}
          activeOpacity={0.8}
        >
          {profile?.profile_published ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.companyProfileName}>{profile.company_name ?? 'Your Company'}</Text>
                  {!!profile.tagline && (
                    <Text style={styles.companyProfileTagline} numberOfLines={1}>{profile.tagline}</Text>
                  )}
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                    {!!(profile.portfolio_photos?.length) && (
                      <View style={styles.companyProfileChip}>
                        <Ionicons name="images-outline" size={12} color={Colors.orange} />
                        <Text style={styles.companyProfileChipText}>{profile.portfolio_photos.length} photos</Text>
                      </View>
                    )}
                    {!!(profile.specializations?.length) && (
                      <View style={styles.companyProfileChip}>
                        <Ionicons name="construct-outline" size={12} color={Colors.orange} />
                        <Text style={styles.companyProfileChipText}>{profile.specializations.length} specialties</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
              <View style={styles.companyProfileEditRow}>
                <Text style={styles.companyProfileEditText}>Edit Profile</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.orange} />
              </View>
            </>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <View style={styles.companyProfileIconBox}>
                <Ionicons name="business-outline" size={24} color={Colors.orange} />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.companyProfileSetupTitle}>Set up your Company Profile</Text>
                <Text style={styles.companyProfileSetupSub}>
                  Add photos, specialties, and your story to attract more customers
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.orange} />
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Account menu */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.menuCard}>
          <MenuItem icon="👤" label="Personal Information"  onPress={() => router.push('/profile/personal-info')} />
          <View style={styles.menuDivider} />
          {isOwner && (
            <>
              <MenuItem
                icon="👥"
                label="My Team"
                subtitle={teamActiveCount > 0 ? `${teamActiveCount} active member${teamActiveCount !== 1 ? 's' : ''}` : 'Manage your employees'}
                onPress={() => router.push('/profile/employees' as any)}
              />
              <View style={styles.menuDivider} />
            </>
          )}
          <MenuItem
            icon="🖼️"
            label="My Portfolio"
            subtitle={profile?.plan === 'pro' ? '15 photo slots' : profile?.plan === 'leads' ? '10 photo slots' : '5 photo slots'}
            onPress={() => router.push('/profile/portfolio' as any)}
          />
          <View style={styles.menuDivider} />
          <MenuItem
            icon="🏆"
            label="Completed Work"
            subtitle="Manage what's shown on your public profile"
            onPress={() => router.push('/profile/completed-work' as any)}
          />
          <View style={styles.menuDivider} />
          {profile?.verification_status === 'approved'
            ? <MenuItem
                icon="✅"
                label="Verified"
                subtitle="Tradease Verified — profile boosts active"
                onPress={() => router.push('/profile/verification-status')}
              />
            : <MenuItem
                icon="✅"
                label="Get Verified"
                subtitle={profile?.verification_status === 'pending_review' ? 'Under review · Usually 72 hours' : 'Unlock the job feed and verified badge'}
                onPress={() => setVerifyGateOpen(true)}
              />
          }
          <View style={styles.menuDivider} />
          <MenuItem icon="🔔" label="Notifications"         onPress={() => router.push('/profile/notifications')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="💳" label="Payment Methods"       onPress={() => router.push('/profile/payments')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="📅" label="Schedule & Calendar"
            subtitle={profile?.plan === 'pro' ? 'View your schedule' : 'Pro plan required'}
            onPress={() => router.push('/profile/calendar' as any)}
            locked={profile?.plan !== 'pro'}
          />
          <View style={styles.menuDivider} />
          <MenuItem icon="📊" label="Analytics"
            subtitle={profile?.plan === 'leads' || profile?.plan === 'pro' ? 'View your stats' : 'Leads plan required'}
            onPress={() => {
              if (profile?.plan === 'leads' || profile?.plan === 'pro') {
                router.push('/profile/analytics' as any);
              } else {
                router.push('/profile/subscription' as any);
              }
            }}
            locked={profile?.plan !== 'leads' && profile?.plan !== 'pro'}
          />
          <View style={styles.menuDivider} />
          <MenuItem icon="💸" label="Earnings History"      onPress={() => router.push('/profile/earnings' as any)} />
          <View style={styles.menuDivider} />
          <MenuItem icon="🔒" label="Privacy & Security"    onPress={() => router.push('/profile/privacy')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="⚙️" label="Settings"             onPress={() => router.push('/profile/settings')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="💬" label="Contact Support"       onPress={() => router.push('/profile/contact')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="🎁" label="Refer & Earn"          onPress={() => router.push('/referrals' as any)} />
        </View>
      </View>

      <Text style={styles.memberSince}>Member since {memberSince}</Text>

      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: signOut },
        ])}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Tradease v1.0.0</Text>
      <View style={{ height: 40 }} />

      {/* Trusted account modal */}
      <Modal
        visible={obOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setObOpen(false)}
      >
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
          {/* Handle bar */}
          <View style={{ width: 36, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 12 }} />

          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
            paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12,
            borderBottomWidth: 0.5, borderBottomColor: Colors.border,
          }}>
            <View>
              <Text style={{ fontSize: 18, fontWeight: Font.black, color: Colors.textPrimary }}>
                Trusted Account
              </Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginTop: 2 }}>
                Fill out Personal Information to earn this badge
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setObOpen(false)}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={18} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 20 }} showsVerticalScrollIndicator={false}>

            {/* Ring + label */}
            <View style={{ alignItems: 'center', paddingVertical: 8, gap: 12 }}>
              <RingProgress score={obScore} size={110} />
              {obScore >= 100 ? (
                <View style={{
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                  backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: Radius.full,
                  paddingHorizontal: 14, paddingVertical: 6,
                }}>
                  <Ionicons name="shield-checkmark" size={14} color="#22C55E" />
                  <Text style={{ fontSize: 13, fontWeight: Font.black, color: '#22C55E' }}>
                    Trusted Account Active
                  </Text>
                </View>
              ) : (
                <Text style={{ fontSize: 13, color: Colors.textSecondary, textAlign: 'center' }}>
                  {obMissing.length} field{obMissing.length !== 1 ? 's' : ''} remaining to earn the Trusted badge
                </Text>
              )}
            </View>

            {/* Criteria list */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: Font.black, color: Colors.textMuted, letterSpacing: 1, marginBottom: 4 }}>
                TRUST CRITERIA
              </Text>

              {TRUST_FIELDS.map(f => {
                const isMissing = obMissing.some(m => m.key === f.key);
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={{
                      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                      backgroundColor: Colors.surface, borderRadius: Radius.lg,
                      borderWidth: 0.5,
                      borderColor: isMissing ? 'rgba(255,98,0,0.25)' : 'rgba(34,197,94,0.25)',
                      paddingHorizontal: 16, paddingVertical: 14, minHeight: 52,
                      shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.15, shadowRadius: 4, elevation: 2,
                    }}
                    onPress={() => {
                      if (isMissing) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setObOpen(false);
                        router.push((FIELD_ROUTES[f.key] ?? '/profile/edit') as any);
                      }
                    }}
                    activeOpacity={isMissing ? 0.7 : 1}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: isMissing ? 'rgba(255,98,0,0.1)' : 'rgba(34,197,94,0.1)',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ionicons
                          name={isMissing ? 'ellipse-outline' : 'checkmark-circle'}
                          size={18}
                          color={isMissing ? Colors.orange : '#22C55E'}
                        />
                      </View>
                      <View>
                        <Text style={{ fontSize: 14, color: Colors.textPrimary, fontWeight: Font.medium }}>
                          {f.label}
                        </Text>
                        <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 1 }}>
                          {f.weight}% of trust score
                        </Text>
                      </View>
                    </View>
                    {isMissing && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Text style={{ fontSize: 13, color: Colors.orange, fontWeight: Font.bold }}>Add</Text>
                        <Ionicons name="chevron-forward" size={14} color={Colors.orange} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>

    <VerificationGate
      visible={verifyGateOpen}
      onClose={() => setVerifyGateOpen(false)}
      status={
        profile?.verification_status === 'pending_review' ? 'pending_review'
          : profile?.verification_status === 'rejected'    ? 'rejected'
          :                                                   'not_submitted'
      }
      companyName={profile?.company_name}
      rejectionReason={profile?.verification_rejection_reason}
    />
    </>
  );
}

// ─── Customer Profile ─────────────────────────────────────────────────────────

function CustomerProfileView({ profile, bookingStats }: { profile: any; bookingStats: { total: number; active: number; completed: number } }) {
  const { colors: Colors } = useTheme();
  const styles = createStyles(Colors);
  const router = useRouter();
  const { signOut, user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string>(profile?.avatar_url ?? '');
  const [uploading, setUploading] = useState(false);

  const initials = profile?.full_name
    ? profile.full_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  async function uploadCustomerAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploading(true);
    try {
      const uri = result.assets[0].uri;
      const response = await fetch(uri);
      const blob = await response.blob();
      const ext = uri.split('.').pop()?.toLowerCase()?.split('?')[0] ?? 'jpg';
      const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const path = `${user!.id}/avatar.${ext}`;
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: mime, upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      await supabase.from('users').update({ avatar_url: url }).eq('id', user!.id);
      setAvatarUrl(url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Alert.alert('Upload failed', 'Could not save photo. Check your connection and try again.');
    } finally {
      setUploading(false);
    }
  }

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : 'Recently';

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

      {/* Profile card */}
      <View style={styles.profileCard}>

        {/* Avatar row */}
        <View style={styles.avatarRow}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatar}>
              {avatarUrl
                ? <Image source={{ uri: avatarUrl }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                : <Text style={styles.avatarText}>{initials}</Text>
              }
            </View>
            <TouchableOpacity style={styles.avatarEditBtn} onPress={uploadCustomerAvatar} disabled={uploading}>
              {uploading
                ? <ActivityIndicator size="small" color={Colors.orange} />
                : <Text style={styles.avatarEditIcon}>📷</Text>
              }
            </TouchableOpacity>
          </View>

          <View style={styles.avatarActions}>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => router.push('/profile/settings')}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editProfileBtn}
              onPress={() => router.push('/profile/edit')}
            >
              <Text style={styles.editProfileText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.profileName}>{profile?.full_name ?? 'Your Name'}</Text>
        <Text style={styles.profileUsername}>@{profile?.username ?? 'user'}</Text>

        <View style={styles.profileMeta}>
          {profile?.location && (
            <View style={styles.profileMetaItem}>
              <Text style={styles.profileMetaIcon}>📍</Text>
              <Text style={styles.profileMetaText}>{profile.location}</Text>
            </View>
          )}
          {profile?.phone && (
            <View style={styles.profileMetaItem}>
              <Text style={styles.profileMetaIcon}>📱</Text>
              <Text style={styles.profileMetaText}>{profile.phone}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{bookingStats.total}</Text>
          <Text style={styles.statLabel}>Jobs Posted</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{bookingStats.active}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{bookingStats.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
      </View>

      {/* Account menu */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ACCOUNT</Text>
        <View style={styles.menuCard}>
          {(user?.email_confirmed_at && user?.phone_confirmed_at)
            ? <MenuItem
                icon="✅"
                label="Verified"
                subtitle="Phone and email confirmed"
                onPress={() => router.push('/profile/verify-account' as any)}
              />
            : <MenuItem
                icon="✅"
                label="Get Verified"
                subtitle="Confirm your phone and email"
                onPress={() => router.push('/profile/verify-account' as any)}
              />
          }
          <View style={styles.menuDivider} />
          <MenuItem icon="👤" label="Personal Information"  onPress={() => router.push('/profile/personal-info')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="🔔" label="Notifications"         onPress={() => router.push('/profile/notifications')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="💳" label="Payment Methods"       onPress={() => router.push('/profile/payments')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="🔒" label="Privacy & Security"    onPress={() => router.push('/profile/privacy')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="⚙️" label="Settings"             onPress={() => router.push('/profile/settings')} />
          <View style={styles.menuDivider} />
          <MenuItem icon="💬" label="Contact Support"       onPress={() => router.push('/profile/contact')} />
        </View>
      </View>

      <Text style={styles.memberSince}>Member since {memberSince}</Text>

      <TouchableOpacity
        style={styles.signOutBtn}
        onPress={() => Alert.alert('Sign Out', 'Are you sure?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Sign Out', style: 'destructive', onPress: signOut },
        ])}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Tradease v1.0.0</Text>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { colors: Colors } = useTheme();
  const styles = createStyles(Colors);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const {
    isContractor, loading: roleLoading,
    isEmployee, isOwner, employerContractorId, employeeRecord,
  } = useRole();
  const [profile,         setProfile]         = useState<any>(null);
  const [loading,         setLoading]         = useState(true);
  const [teamActiveCount, setTeamActiveCount] = useState(0);
  const [bookingStats,    setBookingStats]    = useState({ total: 0, active: 0, completed: 0 });

  // Initial load and auth state changes
  useEffect(() => {
    if (authLoading) return;
    if (!user) { setLoading(false); return; }
    loadProfile();
  }, [user, authLoading, isContractor, isEmployee, employerContractorId]);

  // Re-fetch when returning from personal-info or any sub-screen
  const focusCount = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focusCount.current++;
      if (focusCount.current <= 1) return; // skip initial focus, handled by useEffect above
      if (!user || authLoading) return;
      loadProfile();
    }, [user, authLoading, isContractor, isEmployee, employerContractorId])
  );

  const loadProfile = async () => {
    try {
      if (isContractor) {
        // Employees load the employer's contractor profile
        const contractorId = isEmployee && employerContractorId ? employerContractorId : user!.id;
        const { data } = await supabase
          .from('contractors')
          .select('*')
          .eq('id', contractorId)
          .single();
        setProfile(data);

        // Owners load their team active count
        if (isOwner) {
          const { data: summary } = await supabase
            .from('contractor_team_summary')
            .select('active_count')
            .eq('contractor_id', user!.id)
            .single();
          setTeamActiveCount(summary?.active_count ?? 0);
        }
      } else {
        const [{ data: userData }, { data: statsData }] = await Promise.all([
          supabase.from('users').select('*').eq('id', user!.id).single(),
          supabase.from('bookings').select('status').eq('customer_id', user!.id),
        ]);
        setProfile(userData);
        if (statsData) {
          const active    = statsData.filter(b => ['pending','accepted','confirmed','in_progress'].includes(b.status)).length;
          const completed = statsData.filter(b => ['completed','approved','paid'].includes(b.status)).length;
          setBookingStats({ total: statsData.length, active, completed });
        }
      }
    } catch (err) {
      console.log('Profile load error:', err);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading || roleLoading || loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={Colors.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <NoAccountOverlay visible={!user && !authLoading} />
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Profile</Text>
      </View>

      {/* Employee banner */}
      {isEmployee && employeeRecord && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 10,
          paddingHorizontal: 16, paddingVertical: 10,
          backgroundColor: 'rgba(56,189,248,0.08)',
          borderBottomWidth: 0.5, borderBottomColor: 'rgba(56,189,248,0.25)',
        }}>
          <Ionicons name="people-outline" size={16} color="#38BDF8" />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#38BDF8' }}>
              Employee of {profile?.company_name ?? '…'}
            </Text>
            <Text style={{ fontSize: 11, color: '#38BDF8', opacity: 0.8 }}>
              {employeeRecord.role} · Read-only profile view
            </Text>
          </View>
          {!!employerContractorId && (
            <TouchableOpacity onPress={() => router.push(`/company/${employerContractorId}` as any)}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#38BDF8' }}>View Company ›</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {isContractor
        ? <ContractorProfileView profile={profile} isOwner={isOwner} teamActiveCount={teamActiveCount} />
        : <CustomerProfileView profile={profile} bookingStats={bookingStats} />
      }
    </SafeAreaView>
  );
}
