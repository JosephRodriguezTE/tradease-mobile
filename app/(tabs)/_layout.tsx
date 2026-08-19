import { Tabs, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CalendarCheck, MapPinned, MessageCircle, Settings as SettingsIcon, User } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { useRole } from '../../hooks/useRole';
import { useUnreadMessages } from '../../hooks/useUnreadMessages';
import { supabase } from '../../lib/supabase';
import TwoFAEnrollSheet from '../../components/TwoFAEnrollSheet';
import PreLaunchModal from '@/components/PreLaunchModal';

// Must match PreLaunchModal's own internal STORAGE_KEY — read here only to
// sequence it ahead of the 2FA prompt below, never written from this file.
const PRELAUNCH_SEEN_KEY = 'tradease_prelaunch_seen_v1';

function TabIcon({ Icon, focused }: { Icon: any; focused: boolean }) {
  const { colors: Colors } = useTheme();
  return (
    <View style={[
      { width: 38, height: 30, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 9 },
      focused ? { backgroundColor: Colors.orangeDim } : null,
    ]}>
      <Icon
        size={22}
        color={focused ? Colors.orange : Colors.textMuted}
        strokeWidth={focused ? 2.4 : 2}
      />
    </View>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const { colors: Colors } = useTheme();
  const { isContractor, loading: roleLoading } = useRole();
  const { user } = useAuth();
  const { unreadCount } = useUnreadMessages();

  const [enrollVisible, setEnrollVisible] = useState(false);
  const [userEmail,     setUserEmail]     = useState('');

  // Show the 2FA enrollment prompt once to users who haven't set it up yet
  useEffect(() => {
    async function maybePrompt() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Defer to the pre-launch sheet this mount if it hasn't been seen yet —
      // both are full-screen Modals and must not stack on top of each other.
      const prelaunchSeen = await AsyncStorage.getItem(PRELAUNCH_SEEN_KEY);
      if (!prelaunchSeen) return;

      const storageKey = `twofa_prompted:${user.id}`;
      const alreadyShown = await AsyncStorage.getItem(storageKey);
      if (alreadyShown) return;

      const { data } = await supabase
        .from('users')
        .select('two_factor_enabled')
        .eq('id', user.id)
        .single();

      // Only show for customers (users table row exists); contractors have no users row
      if (data && !data.two_factor_enabled) {
        await AsyncStorage.setItem(storageKey, '1');
        setUserEmail(user.email ?? '');
        // Short delay so the tab UI is fully mounted before the sheet slides up
        setTimeout(() => setEnrollVisible(true), 800);
      }
    }
    maybePrompt();
  }, []);

  const firstName = (() => {
    const full: string = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? '';
    return full.split(' ')[0] || undefined;
  })();

  return (
    <>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
          borderTopWidth: 1.5,
          height: 84,
          paddingBottom: 18,
          paddingTop: 12,
          shadowColor: Colors.orange,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 12,
          elevation: 12,
        },
        tabBarActiveTintColor: Colors.orange,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: 'Inter_600SemiBold',
          letterSpacing: 0.3,
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => (
            <View style={[
              { width: 38, height: 30, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 9 },
              focused ? { backgroundColor: Colors.orangeDim } : null,
            ]}>
              <Ionicons name="home-outline" size={22} color={focused ? Colors.orange : Colors.textMuted} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          href: isContractor ? undefined : null,
          tabBarIcon: ({ focused }) => <TabIcon Icon={MapPinned} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="contractor-home"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: isContractor ? 'Jobs' : 'My Bookings',
          tabBarIcon: ({ focused }) => isContractor ? (
            <View style={[
              { width: 38, height: 30, alignItems: 'center' as const, justifyContent: 'center' as const, borderRadius: 9 },
              focused ? { backgroundColor: Colors.orangeDim } : null,
            ]}>
              <Ionicons name="construct-outline" size={22} color={focused ? Colors.orange : Colors.textMuted} />
            </View>
          ) : (
            <TabIcon Icon={CalendarCheck} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          href: isContractor ? undefined : null,
          tabBarIcon: ({ focused }) => <TabIcon Icon={MessageCircle} focused={focused} />,
          tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', fontSize: 10 },
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon Icon={User} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          href: isContractor ? null : undefined,
          tabBarIcon: ({ focused }) => <TabIcon Icon={SettingsIcon} focused={focused} />,
        }}
      />
    </Tabs>

    <TwoFAEnrollSheet
      visible={enrollVisible}
      onClose={() => setEnrollVisible(false)}
      userEmail={userEmail}
      onEnabled={() => {}}
    />

    {!roleLoading && (
      <PreLaunchModal
        role={isContractor ? 'contractor' : 'customer'}
        firstName={firstName}
        onPrimary={() => router.push(isContractor ? '/profile/get-verified' : '/find-contractor')}
      />
    )}
    </>
  );
}
