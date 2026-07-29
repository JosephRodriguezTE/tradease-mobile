import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Handler — how notifications appear when app is open
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(userId: string, role: 'customer' | 'contractor') {
  if (!Device.isDevice) {
    console.log('Push notifications only work on physical devices.');
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('Notification permission denied.');
      return null;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Tradease',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF6200',
        sound: 'default',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: '1f532f3b-ecd1-400a-b2a4-ed108a39edd3',
    });

    const token = tokenData.data;
    console.log('Push token:', token);

    // Save to the correct table
    const table = role === 'contractor' ? 'contractors' : 'users';
    await supabase
      .from(table)
      .update({ push_token: token })
      .eq('id', userId);

    return token;
  } catch (err) {
    console.log('Push registration error:', err);
    return null;
  }
}

export async function unregisterPushToken(userId: string, role: 'customer' | 'contractor') {
  const table = role === 'contractor' ? 'contractors' : 'users';
  await supabase.from(table).update({ push_token: null }).eq('id', userId);
}

// ─── Send push notification ───────────────────────────────────────────────────
// Inserts a row into `notifications` then invokes the Edge Function to deliver
// an Expo push to the recipient's device. Non-fatal — errors are swallowed.

export async function sendPushNotification({
  userId,
  type,
  title,
  message,
  bookingId,
  actorName,
  icon,
  data = {},
}: {
  userId: string;
  type: string;
  title: string;
  message: string;
  bookingId?: string;
  actorName?: string;
  icon?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { data: notif, error } = await supabase
      .from('notifications')
      .insert({
        user_id:    userId,
        type,
        title,
        message,
        booking_id: bookingId ?? null,
        actor_name: actorName ?? null,
        icon:       icon ?? null,
        read:       false,
        data,
      })
      .select('id')
      .single();

    if (error || !notif) return;

    supabase.functions.invoke('send-push-notification', {
      body: { notification_id: notif.id },
    }).catch(() => {});
  } catch (_) {}
}

export function addNotificationListener(
  onReceive: (notification: Notifications.Notification) => void,
  onTap: (response: Notifications.NotificationResponse) => void,
) {
  const receivedSub = Notifications.addNotificationReceivedListener(onReceive);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onTap);
  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}