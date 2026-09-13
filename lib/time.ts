export function formatRemaining(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return 'Expired';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return `${hours}h ${minutes}m left`;
  if (minutes <= 5) return 'Expires soon';
  return `${minutes}m left`;
}

// For a locked job card shown to a contractor who can't act on it right
// now -- "reopens in 6h" reads better on a card than "5h 47m left", which
// is precise in a way that isn't useful when you can't do anything yet
// anyway.
export function formatReopensIn(expiresAt: string, now: Date = new Date()): string {
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (ms <= 0) return 'reopens soon';
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 1) return `reopens in ${hours}h`;
  return `reopens in ${minutes}m`;
}
