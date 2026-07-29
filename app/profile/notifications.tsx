import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    Alert,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../../constants/Layout';
import { Colors, Font, Radius } from '../../constants/theme';
import { useTheme } from '@/context/ThemeContext';

interface NotifSetting {
  id: string;
  label: string;
  sub: string;
  value: boolean;
}

interface NotifGroup {
  title: string;
  icon: string;
  items: NotifSetting[];
}

export default function NotificationsScreen() {
  const { colors: Colors } = useTheme();
  const router = useRouter();

  const [groups, setGroups] = useState<NotifGroup[]>([
    {
      title: 'Booking Updates',
      icon: '📅',
      items: [
        { id: 'job_accepted', label: 'Job Accepted', sub: 'When a contractor accepts your job', value: true },
        { id: 'contractor_arrival', label: 'Contractor Arrival', sub: 'When contractor is on the way', value: true },
        { id: 'job_completed', label: 'Job Completed', sub: 'When your job is marked done', value: true },
      ],
    },
    {
      title: 'Messages',
      icon: '💬',
      items: [
        { id: 'new_message', label: 'New Messages', sub: 'When you receive a chat message', value: true },
        { id: 'support_reply', label: 'Support Responses', sub: 'Replies from Tradease support', value: true },
      ],
    },
    {
      title: 'Promotions & Offers',
      icon: '🎁',
      items: [
        { id: 'discounts', label: 'Discounts', sub: 'Exclusive deals and savings', value: false },
        { id: 'seasonal', label: 'Seasonal Offers', sub: 'Holiday and seasonal promotions', value: false },
        { id: 'referral', label: 'Referral Rewards', sub: 'Updates on your referral earnings', value: true },
      ],
    },
    {
      title: 'Account & Security',
      icon: '🔒',
      items: [
        { id: 'login_alert', label: 'Login Alerts', sub: 'New device sign-ins detected', value: true },
        { id: 'password_change', label: 'Password Changes', sub: 'When your password is updated', value: true },
        { id: 'payment_notif', label: 'Payment Notifications', sub: 'Charges, refunds and payouts', value: true },
      ],
    },
  ]);

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);

  const toggle = (groupIdx: number, itemIdx: number) => {
    setGroups((prev) => {
      const next = [...prev];
      next[groupIdx] = {
        ...next[groupIdx],
        items: next[groupIdx].items.map((item, i) =>
          i === itemIdx ? { ...item, value: !item.value } : item
        ),
      };
      return next;
    });
  };

  const handleSave = () => {
    Alert.alert('Saved', 'Your notification preferences have been updated.', [
      { text: 'OK', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)') },
    ]);
  };

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
        <Text style={styles.subtitle}>Choose how Tradease keeps you updated.</Text>

        {/* Delivery preferences */}
        <Text style={styles.sectionLabel}>DELIVERY METHOD</Text>
        <View style={styles.card}>
          {[
            { label: 'Push Notifications', sub: 'Alerts on your device', icon: '🔔', value: pushEnabled, set: setPushEnabled },
            { label: 'Email', sub: 'Sent to your email address', icon: '📧', value: emailEnabled, set: setEmailEnabled },
            { label: 'SMS', sub: 'Text messages to your phone', icon: '📱', value: smsEnabled, set: setSmsEnabled },
          ].map((item, i, arr) => (
            <View key={item.label}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleLeft}>
                  <View style={styles.toggleIconBox}>
                    <Text style={styles.toggleIcon}>{item.icon}</Text>
                  </View>
                  <View>
                    <Text style={styles.toggleLabel}>{item.label}</Text>
                    <Text style={styles.toggleSub}>{item.sub}</Text>
                  </View>
                </View>
                <Switch
                  value={item.value}
                  onValueChange={item.set}
                  trackColor={{ false: '#2A2A2A', true: Colors.orange }}
                  thumbColor={Colors.white}
                  ios_backgroundColor="#2A2A2A"
                />
              </View>
              {i < arr.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>

        {/* Notification groups */}
        {groups.map((group, gi) => (
          <View key={group.title}>
            <Text style={styles.sectionLabel}>{group.title.toUpperCase()}</Text>
            <View style={styles.card}>
              {group.items.map((item, ii) => (
                <View key={item.id}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLeft}>
                      <View>
                        <Text style={styles.toggleLabel}>{item.label}</Text>
                        <Text style={styles.toggleSub}>{item.sub}</Text>
                      </View>
                    </View>
                    <Switch
                      value={item.value}
                      onValueChange={() => toggle(gi, ii)}
                      trackColor={{ false: '#2A2A2A', true: Colors.orange }}
                      thumbColor={Colors.white}
                      ios_backgroundColor="#2A2A2A"
                    />
                  </View>
                  {ii < group.items.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        ))}

        {/* Preview card */}
        <Text style={styles.sectionLabel}>NOTIFICATION PREVIEW</Text>
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewApp}>TRADEASE</Text>
            <Text style={styles.previewTime}>now</Text>
          </View>
          <Text style={styles.previewTitle}>Job Accepted ✅</Text>
          <Text style={styles.previewBody}>
            Carlos R. accepted your plumbing job and is confirmed for tomorrow at 9:00 AM.
          </Text>
        </View>

        {/* Privacy note */}
        <View style={styles.privacyNote}>
          <Text style={styles.privacyIcon}>ℹ️</Text>
          <Text style={styles.privacyText}>
            You can change notification preferences anytime. Critical security alerts cannot be disabled.
          </Text>
        </View>

        {/* Save */}
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>Save Preferences</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
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
  toggleIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center',
  },
  toggleIcon: { fontSize: 18 },
  toggleLabel: { fontSize: 14, fontWeight: Font.semibold, color: Colors.white, marginBottom: 2 },
  toggleSub: { fontSize: 12, color: '#555' },
  previewCard: {
    backgroundColor: '#141414', borderRadius: 18,
    borderWidth: 1, borderColor: '#1E1E1E', padding: Spacing.md, gap: 6,
  },
  previewHeader: { flexDirection: 'row', justifyContent: 'space-between' },
  previewApp: { fontSize: 10, fontWeight: Font.black, color: Colors.orange, letterSpacing: 1.5 },
  previewTime: { fontSize: 11, color: '#555' },
  previewTitle: { fontSize: 14, fontWeight: Font.bold, color: Colors.white },
  previewBody: { fontSize: 13, color: '#777', lineHeight: 19 },
  privacyNote: {
    flexDirection: 'row', gap: 10,
    backgroundColor: '#141414', borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#1E1E1E',
    padding: Spacing.md, alignItems: 'flex-start',
  },
  privacyIcon: { fontSize: 14 },
  privacyText: { flex: 1, fontSize: 12, color: '#555', lineHeight: 18 },
  saveBtn: {
    height: 56, borderRadius: 16, backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  saveBtnText: { fontSize: 16, fontWeight: Font.black, color: Colors.background, letterSpacing: 0.3 },
});