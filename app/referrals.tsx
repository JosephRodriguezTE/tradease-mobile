import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { supabase } from '../lib/supabase';
import { Colors, Font, Radius } from '../constants/theme';

interface Referral {
  id: string;
  status: 'pending' | 'credited' | 'expired';
  credit_amount: number;
  created_at: string;
  users: { full_name: string; email: string } | null;
}

export default function ReferralsScreen() {
  const [referralCode, setReferralCode] = useState('');
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  async function load() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: userData } = await supabase
      .from('users')
      .select('referral_code')
      .eq('id', session.user.id)
      .single();

    setReferralCode(userData?.referral_code ?? '');

    const { data } = await supabase
      .from('referrals')
      .select('id, status, credit_amount, created_at, users!referred_user_id(full_name, email)')
      .eq('referrer_contractor_id', session.user.id)
      .order('created_at', { ascending: false });

    setReferrals((data as any[]) ?? []);
    setLoading(false);
  }

  const referralLink = `https://tradease.tech/signup?ref=${referralCode}`;
  const totalCredits = referrals
    .filter(r => r.status === 'credited')
    .reduce((sum, r) => sum + r.credit_amount, 0);
  const pending = referrals.filter(r => r.status === 'pending').length;

  async function copyLink() {
    await Clipboard.setStringAsync(referralLink);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied!', 'Referral link copied to clipboard.');
  }

  async function shareLink() {
    await Share.share({
      message: `Join me on Tradease — the contractor booking platform in New York. Sign up here: ${referralLink}`,
      url: referralLink,
    });
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={Colors.orange} />
      </View>
    );
  }

  return (
    <FlatList
      style={s.container}
      contentContainerStyle={s.content}
      data={referrals}
      keyExtractor={item => item.id}
      ListHeaderComponent={
        <View>
          <Text style={s.title}>Refer & Earn</Text>
          <Text style={s.sub}>Share Tradease with other contractors and earn credits.</Text>

          <View style={s.linkCard}>
            <Text style={s.linkLabel}>Your referral link</Text>
            <View style={s.linkRow}>
              <Text style={s.linkText} numberOfLines={1}>{referralLink}</Text>
            </View>
            <View style={s.btnRow}>
              <TouchableOpacity style={s.copyBtn} onPress={copyLink} activeOpacity={0.8}>
                <Text style={s.copyBtnText}>Copy Link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.shareBtn} onPress={shareLink} activeOpacity={0.8}>
                <Text style={s.shareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.statsRow}>
            {[
              { label: 'Total Referred', value: String(referrals.length) },
              { label: 'Pending',        value: String(pending) },
              { label: 'Credits',        value: `$${totalCredits.toFixed(0)}` },
            ].map(stat => (
              <View key={stat.label} style={s.statCard}>
                <Text style={s.statValue}>{stat.value}</Text>
                <Text style={s.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>

          <Text style={s.sectionTitle}>Referral History</Text>

          {referrals.length === 0 && (
            <View style={s.emptyState}>
              <Text style={s.emptyIcon}>👥</Text>
              <Text style={s.emptyTitle}>No referrals yet</Text>
              <Text style={s.emptySub}>Share your link to get started</Text>
            </View>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <View style={s.referralRow}>
          <View>
            <Text style={s.referralName}>
              {item.users?.full_name ?? item.users?.email ?? 'Unknown user'}
            </Text>
            <Text style={s.referralDate}>
              {new Date(item.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          </View>
          <View style={s.referralRight}>
            <View style={[
              s.statusPill,
              item.status === 'credited' ? s.pillGreen
              : item.status === 'pending' ? s.pillAmber
              : s.pillGrey,
            ]}>
              <Text style={[
                s.statusText,
                item.status === 'credited' ? { color: Colors.success }
                : item.status === 'pending' ? { color: Colors.warning }
                : { color: Colors.textMuted },
              ]}>
                {item.status}
              </Text>
            </View>
            {item.status === 'credited' && (
              <Text style={s.creditAmount}>+${item.credit_amount}</Text>
            )}
          </View>
        </View>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: Colors.background },
  content:      { padding: 16, paddingBottom: 40 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },
  title:        { fontSize: 26, fontWeight: Font.black, color: Colors.textPrimary, marginBottom: 4 },
  sub:          { fontSize: 14, color: Colors.textSecondary, marginBottom: 24, lineHeight: 20 },
  linkCard:     { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, padding: 16, marginBottom: 16 },
  linkLabel:    { fontSize: 12, color: Colors.textMuted, fontWeight: Font.semibold, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  linkRow:      { backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: 12, marginBottom: 12 },
  linkText:     { color: Colors.orange, fontSize: 13 },
  btnRow:       { flexDirection: 'row', gap: 8 },
  copyBtn:      { flex: 1, backgroundColor: Colors.orange, borderRadius: 8, padding: 12, alignItems: 'center' },
  copyBtnText:  { color: '#fff', fontWeight: Font.semibold, fontSize: 14 },
  shareBtn:     { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, padding: 12, alignItems: 'center' },
  shareBtnText: { color: Colors.textPrimary, fontWeight: Font.semibold, fontSize: 14 },
  statsRow:     { flexDirection: 'row', gap: 8, marginBottom: 24 },
  statCard:     { flex: 1, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: 14, alignItems: 'center' },
  statValue:    { fontSize: 22, fontWeight: Font.black, color: Colors.textPrimary },
  statLabel:    { fontSize: 11, color: Colors.textMuted, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  sectionTitle: { fontSize: 16, fontWeight: Font.semibold, color: Colors.textPrimary, marginBottom: 12 },
  emptyState:   { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:    { fontSize: 36, marginBottom: 12 },
  emptyTitle:   { fontSize: 16, fontWeight: Font.semibold, color: Colors.textSecondary },
  emptySub:     { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
  referralRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: 14 },
  referralName: { fontSize: 14, fontWeight: Font.medium, color: Colors.textPrimary },
  referralDate: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  referralRight:{ alignItems: 'flex-end', gap: 4 },
  statusPill:   { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  pillGreen:    { backgroundColor: 'rgba(34,197,94,0.12)' },
  pillAmber:    { backgroundColor: 'rgba(245,158,11,0.12)' },
  pillGrey:     { backgroundColor: 'rgba(255,255,255,0.06)' },
  statusText:   { fontSize: 10, fontWeight: Font.semibold, textTransform: 'uppercase', letterSpacing: 0.4 },
  creditAmount: { fontSize: 12, color: Colors.success, fontWeight: Font.semibold },
});
