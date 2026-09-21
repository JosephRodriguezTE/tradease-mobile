import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { HammerLoader } from '@/components/HammerLoader';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/lib/supabase';
import { Spacing } from '../../constants/Layout';
import { Colors, Font, Radius } from '../../constants/theme';
import { useTheme } from '@/context/ThemeContext';

// Same keys, defaults, and target columns as the website's
// app/dashboard/_settings/NotificationsSection.tsx -- one shared shape,
// written to the same users.notification_prefs / contractors.notification_prefs
// jsonb column the website already reads and writes. This screen used to be
// entirely local useState (fake groups that didn't map to any real column,
// a "Save" button that only showed an Alert) -- now it reads/writes the
// real column and auto-saves the way the website's own UI does.
const CUSTOMER_DEFAULTS = {
  push_new_message:           true,
  push_job_accepted:          true,
  push_job_status:            true,
  push_job_completed:         true,
  push_job_cancelled:         true,
  push_early_start:           true,
  email_booking_confirmation: true,
  email_contractor_matched:   true,
  email_job_completed:        true,
  email_job_cancelled:        true,
  email_new_message:          true,
} as const;

const CONTRACTOR_DEFAULTS = {
  push_new_job:           true,
  push_new_message:       true,
  push_booking_confirmed: true,
  push_payment_received:  true,
  push_job_status:        true,
  push_job_cancelled:     true,
  push_early_start:       true,
  email_new_message:      true,
  email_job_cancelled:    true,
  email_verification:     true,
} as const;

const CUSTOMER_PUSH = [
  { key: 'push_new_message',   label: 'New Messages',      sub: 'When you receive a chat message' },
  { key: 'push_job_accepted',  label: 'Job Accepted',       sub: 'When a contractor accepts your job' },
  { key: 'push_job_status',    label: 'Job Status Updates', sub: 'En route, arrived, in progress' },
  { key: 'push_job_completed', label: 'Job Completed',      sub: 'When your job is marked done' },
  { key: 'push_job_cancelled', label: 'Job Cancelled',      sub: 'If your job is cancelled' },
  { key: 'push_early_start',   label: 'Early Start Requests', sub: 'When a contractor asks to start early' },
];
const CUSTOMER_EMAIL = [
  { key: 'email_booking_confirmation', label: 'Booking Confirmation', sub: 'Confirmation your booking was received' },
  { key: 'email_contractor_matched',   label: 'Contractor Accepted',  sub: 'When a contractor accepts your job' },
  { key: 'email_job_completed',        label: 'Job Completed',        sub: 'When your job is marked done' },
  { key: 'email_job_cancelled',        label: 'Job Cancelled',        sub: 'If your job is cancelled' },
  { key: 'email_new_message',          label: 'New Messages',         sub: 'When you receive a chat message' },
];
const CONTRACTOR_PUSH = [
  { key: 'push_new_job',           label: 'New Job Nearby',    sub: 'New jobs posted in your area' },
  { key: 'push_new_message',       label: 'New Messages',      sub: 'When you receive a chat message' },
  { key: 'push_booking_confirmed', label: 'Booking Confirmed', sub: 'When a job you accepted is confirmed' },
  { key: 'push_payment_received',  label: 'Payment Received',  sub: 'When a payout lands' },
  { key: 'push_job_status',        label: 'Job Status Updates', sub: 'Quote expired and other job status changes' },
  { key: 'push_job_cancelled',     label: 'Job Cancelled',     sub: 'If a customer cancels a booking' },
  { key: 'push_early_start',       label: 'Early Start Responses', sub: "When a customer responds to your early start request" },
];
const CONTRACTOR_EMAIL = [
  { key: 'email_new_message',   label: 'New Messages',        sub: 'When you receive a chat message' },
  { key: 'email_job_cancelled', label: 'Job Cancelled',        sub: 'If a customer cancels a booking' },
  { key: 'email_verification',  label: 'Verification Updates', sub: 'Changes to your verification status' },
];

type Prefs = Record<string, boolean>;

export default function NotificationsScreen() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { isContractor, isEmployee, employerContractorId, loading: roleLoading } = useRole();

  const [prefs,    setPrefs]    = useState<Prefs>({});
  const [loading,  setLoading]  = useState(true);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const table    = isContractor ? 'contractors' : 'users';
  // An employee's own id has no contractors row -- notification_prefs lives
  // on the employer's row, same as the website has no equivalent case to
  // worry about (it only ever renders this for the account owner).
  const targetId = isContractor ? (employerContractorId ?? user?.id) : user?.id;

  useEffect(() => {
    // Employees get a read-only message instead (rendered below) -- no
    // toggles to load. notification_prefs lives on the employer's
    // contractors row either way (per useRole()'s employerContractorId),
    // so an employee's own toggle would silently be controlling the
    // owner's -- and everyone else's -- notifications. Not fixed here
    // (would need its own storage on employees, a schema decision), just
    // not exposed as if it were personal.
    if (roleLoading || isEmployee || !targetId) { if (!roleLoading) setLoading(false); return; }
    let cancelled = false;
    (async () => {
      const defaults = isContractor ? CONTRACTOR_DEFAULTS : CUSTOMER_DEFAULTS;
      const { data } = await supabase
        .from(table)
        .select('notification_prefs')
        .eq('id', targetId)
        .single();
      if (cancelled) return;
      const stored = (data?.notification_prefs ?? {}) as Prefs;
      setPrefs({ ...defaults, ...stored });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [roleLoading, isEmployee, targetId, isContractor, table]);

  function handleToggle(key: string, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => savePrefs(next, key), 500);
  }

  async function savePrefs(next: Prefs, key: string) {
    if (!targetId) return;
    const { error } = await supabase.from(table).update({ notification_prefs: next }).eq('id', targetId);
    if (!error) {
      setSavedKey(key);
      setTimeout(() => setSavedKey(k => (k === key ? null : k)), 2000);
    }
  }

  if (loading || roleLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <HammerLoader size={64} />
      </View>
    );
  }

  if (isEmployee) {
    return (
      <View style={styles.container}>
        <SafeAreaView edges={['top']}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
              <Text style={styles.backArrow}>←</Text>
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Notifications</Text>
            <View style={{ width: 40 }} />
          </View>
        </SafeAreaView>
        <View style={[styles.center, { flex: 1, paddingHorizontal: Spacing.lg }]}>
          <Text style={styles.employeeMsg}>
            Notification preferences are managed by the account owner.
          </Text>
        </View>
      </View>
    );
  }

  const pushItems  = isContractor ? CONTRACTOR_PUSH  : CUSTOMER_PUSH;
  const emailItems = isContractor ? CONTRACTOR_EMAIL : CUSTOMER_EMAIL;

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.subtitle}>Choose what you want to be notified about. Changes save automatically.</Text>

        <Text style={styles.sectionLabel}>PUSH NOTIFICATIONS</Text>
        <View style={styles.card}>
          {pushItems.map((item, i, arr) => (
            <View key={item.key}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.labelRow}>
                      <Text style={styles.toggleLabel}>{item.label}</Text>
                      {savedKey === item.key && <Text style={styles.savedTxt}>Saved</Text>}
                    </View>
                    <Text style={styles.toggleSub}>{item.sub}</Text>
                  </View>
                </View>
                <Switch
                  value={prefs[item.key] ?? false}
                  onValueChange={(v) => handleToggle(item.key, v)}
                  trackColor={{ false: '#2A2A2A', true: Colors.orange }}
                  thumbColor={Colors.white}
                  ios_backgroundColor="#2A2A2A"
                />
              </View>
              {i < arr.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>EMAIL NOTIFICATIONS</Text>
        <View style={styles.card}>
          {emailItems.map((item, i, arr) => (
            <View key={item.key}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={{ flex: 1 }}>
                    <View style={styles.labelRow}>
                      <Text style={styles.toggleLabel}>{item.label}</Text>
                      {savedKey === item.key && <Text style={styles.savedTxt}>Saved</Text>}
                    </View>
                    <Text style={styles.toggleSub}>{item.sub}</Text>
                  </View>
                </View>
                <Switch
                  value={prefs[item.key] ?? false}
                  onValueChange={(v) => handleToggle(item.key, v)}
                  trackColor={{ false: '#2A2A2A', true: Colors.orange }}
                  thumbColor={Colors.white}
                  ios_backgroundColor="#2A2A2A"
                />
              </View>
              {i < arr.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  center: { alignItems: 'center', justifyContent: 'center' },
  employeeMsg: { fontSize: 14, color: '#666', lineHeight: 21, textAlign: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: Colors.white },
  headerTitle: { fontSize: 16, fontWeight: Font.bold, color: Colors.white },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, gap: Spacing.md, paddingBottom: 40 },
  subtitle: { fontSize: 14, color: '#666', lineHeight: 21 },
  sectionLabel: { fontSize: 11, fontWeight: Font.black, color: '#555', letterSpacing: 1.5 },
  card: { backgroundColor: '#141414', borderRadius: 18, borderWidth: 1, borderColor: '#1E1E1E', overflow: 'hidden' },
  divider: { height: 1, backgroundColor: '#1E1E1E', marginHorizontal: Spacing.md },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 14,
  },
  toggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleLabel: { fontSize: 14, fontWeight: Font.semibold, color: Colors.white, marginBottom: 2 },
  toggleSub: { fontSize: 12, color: '#555' },
  savedTxt: { fontSize: 11, fontWeight: Font.semibold, color: '#22C55E' },
});
