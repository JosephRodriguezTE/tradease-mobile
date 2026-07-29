// hooks/usePrimaryAction.ts
// Single source of truth for the morphing primary button on both work order screens.

export type WoStatus =
  | 'submitted' | 'accepted' | 'deposit_secured'
  | 'en_route' | 'arrived' | 'in_progress'
  | 'waiting_for_customer' | 'materials_needed'
  | 'change_order_pending' | 'awaiting_approval'
  | 'payment_releasing' | 'completed' | 'cancelled' | 'disputed';

// 2 hours before arrival window = earliest contractor can self-start
const EARLY_UNLOCK_MS = 2 * 60 * 60 * 1000;

export type PrimaryActionResult =
  | { kind: 'action';         label: string; next: string; color: string }
  | { kind: 'blocked';        label: string }
  | { kind: 'countdown';      label: string; canRequestEarly: boolean; unlockAt: Date }
  | { kind: 'hold_failed' }
  | { kind: 'none' };

interface WoInput {
  wo_status: WoStatus;
  payment_intent_id?: string | null;
  scheduled_date?: string | null;
  arrival_window_start?: string | null;
  early_start_requested?: boolean;
  early_start_approved?: boolean;
  hold_failed_at?: string | null;
}

function scheduledStart(wo: WoInput): Date | null {
  if (!wo.scheduled_date) return null;
  const timeStr = wo.arrival_window_start ?? '09:00:00';
  return new Date(`${wo.scheduled_date}T${timeStr}`);
}

export function usePrimaryAction(wo: WoInput | null, now = new Date()): PrimaryActionResult {
  if (!wo) return { kind: 'none' };

  // ── Terminal / blocked states ───────────────────────────────────────────────
  if (wo.wo_status === 'change_order_pending') {
    return { kind: 'blocked', label: 'Awaiting Customer Approval' };
  }
  if (wo.wo_status === 'awaiting_approval') {
    return { kind: 'blocked', label: 'Sent to Customer for Review' };
  }
  if (wo.wo_status === 'payment_releasing') {
    return { kind: 'blocked', label: 'Payment Releasing' };
  }
  if (wo.wo_status === 'completed') {
    return { kind: 'blocked', label: 'Job Complete' };
  }
  if (wo.wo_status === 'cancelled') {
    return { kind: 'blocked', label: 'Cancelled' };
  }
  if (wo.wo_status === 'disputed') {
    return { kind: 'blocked', label: 'Disputed' };
  }

  // ── Hold failed gate ────────────────────────────────────────────────────────
  if (wo.hold_failed_at) {
    return { kind: 'hold_failed' };
  }

  // ── Accepted / deposit_secured: countdown or start driving ─────────────────
  if (wo.wo_status === 'accepted' || wo.wo_status === 'deposit_secured') {
    const start = scheduledStart(wo);

    if (start && !wo.early_start_approved) {
      const unlockAt = new Date(start.getTime() - EARLY_UNLOCK_MS);
      if (now < unlockAt) {
        return {
          kind: 'countdown',
          label: formatCountdown(start, now),
          canRequestEarly: !wo.early_start_requested,
          unlockAt,
        };
      }
    }

    // Window open or approved early start — allow driving
    return { kind: 'action', label: 'Start Driving', next: 'en_route', color: '#22C55E' };
  }

  // ── En route ────────────────────────────────────────────────────────────────
  if (wo.wo_status === 'en_route') {
    return { kind: 'action', label: "I've Arrived", next: 'arrived', color: '#22C55E' };
  }

  // ── Arrived: gate on payment hold ──────────────────────────────────────────
  if (wo.wo_status === 'arrived') {
    return { kind: 'action', label: 'Start Job', next: 'in_progress', color: '#22C55E' };
  }

  // ── In progress ─────────────────────────────────────────────────────────────
  if (wo.wo_status === 'in_progress') {
    return { kind: 'action', label: 'Complete Job', next: 'awaiting_approval', color: '#22C55E' };
  }

  // ── Paused states ────────────────────────────────────────────────────────────
  if (wo.wo_status === 'waiting_for_customer') {
    return { kind: 'action', label: 'Resume Work', next: 'in_progress', color: '#38BDF8' };
  }
  if (wo.wo_status === 'materials_needed') {
    return { kind: 'action', label: 'Back on Site', next: 'in_progress', color: '#38BDF8' };
  }

  // ── Submitted (before contractor accepts) ───────────────────────────────────
  if (wo.wo_status === 'submitted') {
    return { kind: 'action', label: 'Accept Job', next: 'accepted', color: '#22C55E' };
  }

  return { kind: 'none' };
}

function formatCountdown(scheduledAt: Date, now: Date): string {
  const diffMs = scheduledAt.getTime() - now.getTime();
  const totalMin = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const dateStr = scheduledAt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const timeStr = scheduledAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${dateStr} · ${timeStr}\nStarts in ${h > 0 ? `${h}h ` : ''}${m}m`;
}
