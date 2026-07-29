// app/invite/[token].tsx
// Deep-link invite acceptance screen
// Opened via tradease://invite/<token>

import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, StyleSheet, Text,
  TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Font, Radius } from '../../constants/theme';

export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { colors: C } = useTheme();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [loading, setLoading]       = useState(true);
  const [accepting, setAccepting]   = useState(false);
  const [invite, setInvite]         = useState<any>(null);
  const [contractor, setContractor] = useState<any>(null);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return; }
    loadInvite();
  }, [token]);

  async function loadInvite() {
    setLoading(true);
    const { data, error: fetchErr } = await supabase
      .from('contractor_employees')
      .select('id, contractor_id, full_name, email, role, status, invite_token')
      .eq('invite_token', token)
      .single();

    if (fetchErr || !data) {
      setError('This invite link is invalid or has already been used.');
      setLoading(false);
      return;
    }

    if (data.status === 'active') {
      setError('This invite has already been accepted.');
      setLoading(false);
      return;
    }

    if (data.status === 'inactive') {
      setError('This invite has been deactivated by the company admin.');
      setLoading(false);
      return;
    }

    setInvite(data);

    // Load company info
    const { data: cData } = await supabase
      .from('contractors_public')
      .select('id, company_name, trade_type, location, rating')
      .eq('id', data.contractor_id)
      .single();

    setContractor(cData ?? null);
    setLoading(false);
  }

  async function handleAccept() {
    if (!user) {
      // Not logged in — send to signup with invite context
      Alert.alert(
        'Account Required',
        'Create a Tradease account to accept this team invite.',
        [
          { text: 'Log In', onPress: () => router.push('/login') },
          { text: 'Sign Up', onPress: () => router.push('/signup') },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
      return;
    }

    if ((user.email ?? '').toLowerCase() !== (invite.email ?? '').toLowerCase()) {
      Alert.alert(
        'Wrong Account',
        `This invite was sent to ${invite.email}. Log in with that email address to accept it.`,
      );
      return;
    }

    setAccepting(true);

    // Check if this user already has a role (can't be employee and owner)
    const { data: existingContractor } = await supabase
      .from('contractors')
      .select('id')
      .eq('id', user.id)
      .single();

    if (existingContractor) {
      setAccepting(false);
      Alert.alert(
        'Cannot Accept',
        'You already have a contractor account. Employee invites are for workers who do not own a contractor profile.',
      );
      return;
    }

    const { error: updateErr } = await supabase
      .from('contractor_employees')
      .update({
        user_id:   user.id,
        status:    'active',
        joined_at: new Date().toISOString(),
        last_active_at: new Date().toISOString(),
      })
      .eq('id', invite.id)
      .eq('invite_token', token);

    setAccepting(false);

    if (updateErr) {
      Alert.alert('Error', 'Failed to accept the invite. Please try again.');
      return;
    }

    Alert.alert(
      `Welcome to ${contractor?.company_name ?? 'the team'}!`,
      `You've joined as ${invite.full_name} (${invite.role}). You can now access jobs and messages through the app.`,
      [{ text: 'Get Started', onPress: () => router.replace('/(tabs)') }],
    );
  }

  const s = makeStyles(C);

  if (loading || authLoading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}>
          <ActivityIndicator color={C.orange} size="large" />
          <Text style={[s.loadingText, { color: C.textMuted }]}>Loading invite…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}>
          <Ionicons name="close-circle-outline" size={64} color="#EF4444" />
          <Text style={[s.errorTitle, { color: C.textPrimary }]}>Invite Unavailable</Text>
          <Text style={[s.errorSub, { color: C.textSecondary }]}>{error}</Text>
          <TouchableOpacity style={[s.btn, { backgroundColor: C.orange }]} onPress={() => router.replace('/(tabs)')}>
            <Text style={s.btnText}>Go to App</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const initials = contractor?.company_name
    ? contractor.company_name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '??';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.content}>

        {/* Company avatar */}
        <View style={[s.companyAvatar, { backgroundColor: 'rgba(255,98,0,0.15)' }]}>
          <Text style={s.companyAvatarText}>{initials}</Text>
        </View>

        <Text style={[s.headline, { color: C.textPrimary }]}>You've been invited!</Text>
        <Text style={[s.subline, { color: C.textSecondary }]}>
          <Text style={{ fontWeight: Font.black, color: C.textPrimary }}>{contractor?.company_name ?? 'A contractor'}</Text>
          {' '}has invited you to join their team as{' '}
          <Text style={{ fontWeight: Font.black, color: C.orange }}>{invite?.full_name}</Text>.
        </Text>

        {/* Company info card */}
        <View style={[s.card, { backgroundColor: C.surface, borderColor: C.border }]}>
          <View style={s.cardRow}>
            <Ionicons name="business-outline" size={16} color={C.orange} />
            <Text style={[s.cardLabel, { color: C.textMuted }]}>Company</Text>
            <Text style={[s.cardValue, { color: C.textPrimary }]}>{contractor?.company_name}</Text>
          </View>
          {!!contractor?.trade_type && (
            <View style={s.cardRow}>
              <Ionicons name="construct-outline" size={16} color={C.orange} />
              <Text style={[s.cardLabel, { color: C.textMuted }]}>Trade</Text>
              <Text style={[s.cardValue, { color: C.textPrimary }]}>{contractor.trade_type}</Text>
            </View>
          )}
          {!!contractor?.location && (
            <View style={s.cardRow}>
              <Ionicons name="location-outline" size={16} color={C.orange} />
              <Text style={[s.cardLabel, { color: C.textMuted }]}>Location</Text>
              <Text style={[s.cardValue, { color: C.textPrimary }]}>{contractor.location}</Text>
            </View>
          )}
          <View style={s.cardRow}>
            <Ionicons name="person-outline" size={16} color={C.orange} />
            <Text style={[s.cardLabel, { color: C.textMuted }]}>Your Role</Text>
            <Text style={[s.cardValue, { color: C.orange, fontWeight: Font.black }]}>{invite?.role}</Text>
          </View>
        </View>

        {/* Auth gate note */}
        {!user && (
          <View style={[s.authNote, { backgroundColor: 'rgba(251,191,36,0.10)', borderColor: 'rgba(251,191,36,0.3)' }]}>
            <Ionicons name="information-circle-outline" size={16} color="#FBBF24" />
            <Text style={[s.authNoteText, { color: '#FBBF24' }]}>
              You need to log in or create an account to accept this invite.
            </Text>
          </View>
        )}

        {/* Accept button */}
        <TouchableOpacity
          style={[s.btn, { backgroundColor: C.orange, opacity: accepting ? 0.7 : 1 }]}
          onPress={handleAccept}
          disabled={accepting}
        >
          {accepting
            ? <ActivityIndicator color="#fff" />
            : <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                <Text style={s.btnText}>
                  {user ? 'Accept Invite & Join Team' : 'Log In to Accept'}
                </Text>
              </>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.declineBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={[s.declineBtnText, { color: C.textMuted }]}>Maybe Later</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container:          { flex: 1, backgroundColor: C.background },
    center:             { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
    loadingText:        { fontSize: 14, marginTop: 8 },
    errorTitle:         { fontSize: 22, fontWeight: Font.black, textAlign: 'center' },
    errorSub:           { fontSize: 15, textAlign: 'center', lineHeight: 22 },
    content:            { flex: 1, paddingHorizontal: 24, paddingTop: 40, alignItems: 'center', gap: 16 },
    companyAvatar:      { width: 80, height: 80, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    companyAvatarText:  { fontSize: 28, fontWeight: Font.black, color: '#FF6200' },
    headline:           { fontSize: 26, fontWeight: Font.black, textAlign: 'center', letterSpacing: -0.5 },
    subline:            { fontSize: 15, textAlign: 'center', lineHeight: 22, color: '#888' },
    card:               { width: '100%', borderRadius: Radius.lg, borderWidth: 1, padding: 16, gap: 12 },
    cardRow:            { flexDirection: 'row', alignItems: 'center', gap: 10 },
    cardLabel:          { fontSize: 12, fontWeight: Font.semibold, width: 70 },
    cardValue:          { fontSize: 14, fontWeight: Font.semibold, flex: 1 },
    authNote:           { width: '100%', flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: Radius.md, borderWidth: 1, padding: 12 },
    authNoteText:       { fontSize: 13, flex: 1, lineHeight: 19 },
    btn:                { width: '100%', height: 54, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
    btnText:            { fontSize: 16, fontWeight: Font.black, color: '#fff' },
    declineBtn:         { paddingVertical: 14 },
    declineBtnText:     { fontSize: 15, fontWeight: Font.semibold },
  });
}
