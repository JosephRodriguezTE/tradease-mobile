import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { showToast } from '../components/Toast';
import { addNotificationListener, registerForPushNotifications } from '../lib/notifications';
import { useAuth } from './useAuth';
import { useRole } from './useRole';

interface NotifData {
  type?: string;
  booking_id?: string;
  chat_id?: string;
  work_order_id?: string;
  contractor_name?: string;
  amount?: string;
}

function toastForType(data: NotifData) {
  const name = data.contractor_name ?? 'Your contractor';
  const amount = data.amount ? `$${data.amount}` : '';

  switch (data.type) {
    case 'job_accepted':
    case 'contractor_assigned':
      showToast({ type: 'success', title: 'Job accepted!', message: `${name} is on it.` });
      break;
    case 'hold_secured':
      showToast({
        type: 'success',
        title: 'Payment protected',
        message: `${amount} held securely until you approve.`,
      });
      break;
    case 'en_route':
      showToast({ type: 'info', title: `${name} is on the way`, message: 'Track their location on the map.' });
      break;
    case 'arrived':
      showToast({ type: 'info', title: `${name} has arrived`, message: 'Work will begin shortly.' });
      break;
    case 'job_in_progress':
      showToast({ type: 'info', title: 'Work started', message: `${name} has begun the job.` });
      break;
    case 'photo_uploaded':
      showToast({ type: 'info', title: 'Photo added', message: `${name} uploaded a job photo.` });
      break;
    case 'change_order_pending':
      showToast({
        type: 'warning',
        title: 'Change order needs approval',
        message: 'Tap to review the updated price.',
        duration: 6000,
        action: data.work_order_id
          ? {
              label: 'Review',
              onPress: () => {},
            }
          : undefined,
      });
      break;
    case 'job_completed':
      showToast({ type: 'success', title: 'Work complete!', message: 'Tap to review and approve.' });
      break;
    case 'payment_approved':
      showToast({ type: 'success', title: 'Payment released', message: `${amount} on its way.` });
      break;
    case 'review_reminder':
      showToast({ type: 'info', title: 'Leave a review', message: 'How did the job go?' });
      break;
    case 'new_message':
      showToast({ type: 'info', title: 'New message', message: `From ${name}` });
      break;
    default:
      break;
  }
}

export function useNotifications() {
  const { user } = useAuth();
  const { isContractor } = useRole();
  const router = useRouter();
  const registered = useRef(false);

  useEffect(() => {
    if (!user) {
      registered.current = false;
      return;
    }
    if (registered.current) return;

    const role = isContractor ? 'contractor' : 'customer';
    registerForPushNotifications(user.id, role).then((token) => {
      if (token) registered.current = true;
    });

    const removeListener = addNotificationListener(
      (notification) => {
        const data = notification.request.content.data as NotifData;
        toastForType(data);
      },
      (response) => {
        const data = response.notification.request.content.data as NotifData;
        const type: string       = data?.type ?? '';
        const bookingId: string  = data?.booking_id ?? '';
        const chatId: string     = data?.chat_id ?? '';
        const workOrderId: string = data?.work_order_id ?? '';

        switch (type) {
          case 'job_accepted':
          case 'contractor_assigned':
            if (chatId)    { router.push(`/chat/${chatId}` as any); break; }
            if (bookingId) { router.push(`/job/${bookingId}` as any); break; }
            break;

          case 'hold_secured':
          case 'en_route':
          case 'arrived':
          case 'job_in_progress':
          case 'photo_uploaded':
          case 'review_reminder':
            if (workOrderId) router.push(`/work-order/customer?id=${workOrderId}` as any);
            else if (bookingId) router.push(`/work-order/customer?id=${bookingId}` as any);
            break;

          case 'change_order_pending':
            if (workOrderId) router.push(`/work-order/customer?id=${workOrderId}&section=bill` as any);
            else if (bookingId) router.push(`/work-order/customer?id=${bookingId}&section=bill` as any);
            break;

          case 'job_completed':
            if (bookingId) router.push(`/work-order/customer?id=${bookingId}` as any);
            break;

          case 'payment_approved':
            if (workOrderId) router.push(`/work-order/contractor?id=${workOrderId}` as any);
            else if (bookingId) router.push(`/work-order/contractor?id=${bookingId}` as any);
            break;

          case 'new_message':
            if (chatId) router.push(`/chat/${chatId}` as any);
            break;

          case 'job_declined':
            if (bookingId) router.push(`/job/${bookingId}` as any);
            break;

          case 'quote_received':
          case 'counter_received':
          case 'quote_accepted':
          case 'quote_declined':
            if (bookingId) router.push(`/job/${bookingId}` as any);
            break;

          case 'new_job_nearby':
          case 'new_job':
          case 'job_cancelled':
            router.push('/(tabs)/' as any);
            break;

          default:
            router.push('/notifications' as any);
        }
      }
    );

    return removeListener;
  }, [user, isContractor]);
}
