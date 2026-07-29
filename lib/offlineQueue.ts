import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';

const QUEUE_KEY = 'tradease_offline_queue';

export type QueuedMutation =
  | {
      kind: 'checklist_check';
      work_order_id: string;
      item_id: string;
      completed: boolean;
    }
  | {
      kind: 'checklist_add';
      work_order_id: string;
      label: string;
      sort_order: number;
    };

async function loadQueue(): Promise<QueuedMutation[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as QueuedMutation[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedMutation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export async function enqueueOffline(mutation: QueuedMutation): Promise<void> {
  const queue = await loadQueue();
  queue.push(mutation);
  await saveQueue(queue);
}

export async function flushOfflineQueue(): Promise<{ flushed: number; failed: number }> {
  const queue = await loadQueue();
  if (queue.length === 0) return { flushed: 0, failed: 0 };

  const remaining: QueuedMutation[] = [];
  let flushed = 0;

  for (const mutation of queue) {
    try {
      if (mutation.kind === 'checklist_check') {
        const { error } = await supabase
          .from('work_progress_items')
          .update({ completed: mutation.completed })
          .eq('id', mutation.item_id);
        if (error) throw error;
      } else if (mutation.kind === 'checklist_add') {
        const { error } = await supabase
          .from('work_progress_items')
          .insert({
            work_order_id: mutation.work_order_id,
            label: mutation.label,
            sort_order: mutation.sort_order,
          });
        if (error) throw error;
      }
      flushed++;
    } catch {
      remaining.push(mutation);
    }
  }

  await saveQueue(remaining);
  return { flushed, failed: remaining.length };
}

export async function pendingQueueCount(): Promise<number> {
  const queue = await loadQueue();
  return queue.length;
}

export async function isOnline(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch('https://linqsojbszglbgpoxgtv.supabase.co/health', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}
