import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useUnreadMessages() {
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      return;
    }

    const userId = user.id;
    const channelName = `unread-msgs:${userId}`;

    // Purge any stale channel with the same name before subscribing.
    // React StrictMode double-invokes effects; Supabase throws if .on() is
    // called on an already-subscribed channel, which is what caused the
    // "cannot add postgres_changes callbacks after subscribe()" crash.
    supabase.getChannels().forEach(ch => {
      if (ch.topic === `realtime:${channelName}`) supabase.removeChannel(ch);
    });

    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('read', false)
      .then(({ count }) => setUnreadCount(count ?? 0));

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `recipient_id=eq.${userId}` },
        () => setUnreadCount(prev => prev + 1)
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          if (payload.new.read === true && (payload.old as Record<string, unknown>)?.read === false) {
            setUnreadCount(prev => Math.max(0, prev - 1));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  return { unreadCount };
}
