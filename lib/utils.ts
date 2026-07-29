export function getTimeLeft(isoTimestamp: string | null | undefined): string {
  if (!isoTimestamp) return 'Expired';
  const diff = new Date(isoTimestamp).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const hours = Math.floor(diff / 3600000);
  const mins  = Math.floor((diff % 3600000) / 60000);
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${mins}m left`;
}
