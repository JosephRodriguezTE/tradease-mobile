/**
 * Tradease — Pre-launch welcome sheet (EXPO APP)
 *
 *   <PreLaunchModal role="customer" />
 *   <PreLaunchModal role="contractor" />
 *
 * Bottom sheet, shows once per install (AsyncStorage). Matches the website
 * modal's design so both platforms feel like one product.
 *
 * Requires: @react-native-async-storage/async-storage (already common in Expo
 * apps — if it's missing, run: npx expo install @react-native-async-storage/async-storage)
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, Pressable, StyleSheet, ScrollView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LAUNCH_DATE = new Date('2026-11-07T09:00:00-05:00');
const STORAGE_KEY = 'tradease_prelaunch_seen_v1';

const C = {
  orange: '#FF6A1A',
  ink: '#111114',
  body: '#5A5D66',
  muted: '#9BA0AA',
  hair: '#ECECEF',
  stub: '#F7F7F8',
  card: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.5)',
};

type Role = 'customer' | 'contractor';

const COPY: Record<Role, {
  eyebrow: string; title: string; body: string; listLabel: string;
  list: string[]; primary: string; secondary: string; footnote: string;
}> = {
  customer: {
    eyebrow: 'Early access',
    title: 'Booking opens November 7',
    body:
      'Tradease is live for browsing across Nassau and Suffolk. Hiring and payments turn on at launch — until then, look around and tell us what you need.',
    listLabel: 'What you can do now',
    list: [
      'Browse verified Long Island contractors',
      'Save the pros you want to hire first',
      'Get notified the moment booking opens',
    ],
    primary: 'Browse contractors',
    secondary: 'I’ll look around',
    footnote: 'No charge to browse. You’ll never be billed before you book a job.',
  },
  contractor: {
    eyebrow: 'Founding contractor',
    title: 'Get listed before customers arrive',
    body:
      'Customers start booking November 7. Set your profile up now and you’ll be live on day one — in front of Long Island homeowners looking for your trade.',
    listLabel: 'Get ready before launch',
    list: [
      'Complete your company profile and service area',
      'Submit your license and insurance to get verified',
      'Add photos of past work to your portfolio',
    ],
    primary: 'Complete my profile',
    secondary: 'Later',
    footnote: 'Tradease never charges contractors for leads. You keep your full quote.',
  },
};

export default function PreLaunchModal({
  role,
  firstName,
  onPrimary,
  forceOpen = false,
}: {
  role: Role;
  firstName?: string;
  onPrimary?: () => void;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const copy = COPY[role];
  const days = useMemo(
    () => Math.max(0, Math.ceil((LAUNCH_DATE.getTime() - Date.now()) / 86400000)),
    []
  );

  useEffect(() => {
    if (forceOpen) { setOpen(true); return; }
    AsyncStorage.getItem(STORAGE_KEY)
      .then(v => { if (!v) setOpen(true); })
      .catch(() => setOpen(true));
  }, [forceOpen]);

  async function close() {
    setOpen(false);
    try { await AsyncStorage.setItem(STORAGE_KEY, String(Date.now())); } catch {}
  }

  const heading = firstName
    ? `${firstName}, ${copy.title.charAt(0).toLowerCase()}${copy.title.slice(1)}`
    : copy.title;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={s.scrim} onPress={close}>
        <Pressable style={s.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={s.handle} />

          {/* Signature: ticket-stub date lockup */}
          <View style={s.stub}>
            <View style={s.dateChip}>
              <Text style={s.dateMonth}>NOV</Text>
              <Text style={s.dateDay}>7</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.eyebrow}>{copy.eyebrow.toUpperCase()}</Text>
              <Text style={s.countdown}>
                {days > 0 ? `${days} days until launch` : 'Launching today'}
              </Text>
            </View>
          </View>

          <ScrollView
            style={{ maxHeight: 420 }}
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
          >
            <Text style={s.title}>{heading}</Text>
            <Text style={s.blurb}>{copy.body}</Text>

            <Text style={s.listLabel}>{copy.listLabel.toUpperCase()}</Text>
            {copy.list.map(item => (
              <View key={item} style={s.row}>
                <View style={s.check}>
                  <Text style={s.checkMark}>✓</Text>
                </View>
                <Text style={s.rowText}>{item}</Text>
              </View>
            ))}

            <Pressable
              style={({ pressed }) => [s.primary, pressed && { opacity: 0.85 }]}
              onPress={() => { close(); onPrimary?.(); }}
              accessibilityRole="button"
            >
              <Text style={s.primaryText}>{copy.primary}</Text>
            </Pressable>

            <Pressable style={s.secondary} onPress={close} accessibilityRole="button">
              <Text style={s.secondaryText}>{copy.secondary}</Text>
            </Pressable>

            <Text style={s.footnote}>{copy.footnote}</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: C.scrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
    overflow: 'hidden',
  },
  handle: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: '#DDDDE2',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  stub: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.stub, paddingHorizontal: 24, paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.hair,
  },
  dateChip: {
    width: 56, height: 56, borderRadius: 14, backgroundColor: C.orange,
    alignItems: 'center', justifyContent: 'center',
  },
  dateMonth: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, opacity: 0.9 },
  dateDay: { color: '#fff', fontSize: 25, fontWeight: '800', lineHeight: 28, marginTop: -1 },
  eyebrow: { color: C.orange, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  countdown: { color: C.body, fontSize: 13, fontWeight: '500', marginTop: 3 },

  body: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 4 },
  title: { fontSize: 24, fontWeight: '800', color: C.ink, letterSpacing: -0.4, lineHeight: 29 },
  blurb: { fontSize: 14.5, color: C.body, lineHeight: 21, marginTop: 10 },

  listLabel: { fontSize: 10, fontWeight: '800', color: C.muted, letterSpacing: 1.2, marginTop: 22, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginBottom: 10 },
  check: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,106,26,0.12)',
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
  checkMark: { color: C.orange, fontSize: 10, fontWeight: '900' },
  rowText: { flex: 1, fontSize: 14, color: '#3F434C', lineHeight: 19 },

  primary: {
    backgroundColor: C.ink, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginTop: 24,
  },
  primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  secondary: { paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  secondaryText: { color: C.muted, fontSize: 14, fontWeight: '600' },

  footnote: {
    fontSize: 11.5, color: C.muted, textAlign: 'center', lineHeight: 16,
    marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.hair,
  },
});

/* ───────────────────────────────────────────────────────────────
USAGE

In your first authenticated screen (e.g. app/(tabs)/index.tsx), render once:

  import PreLaunchModal from '@/components/PreLaunchModal';
  import { useRole } from '@/hooks/useRole';

  const { role } = useRole();

  <PreLaunchModal
    role={role === 'contractor' ? 'contractor' : 'customer'}
    firstName={user?.full_name?.split(' ')[0]}
    onPrimary={() => router.push(
      role === 'contractor' ? '/profile/get-verified' : '/find-contractor'
    )}
  />

Preview either variant without clearing storage:  <PreLaunchModal role="customer" forceOpen />
─────────────────────────────────────────────────────────────── */
