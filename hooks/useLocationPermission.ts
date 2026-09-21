import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Location from 'expo-location';

// Both the "go online" toggle (contractor-home.tsx) and the "share my
// location" toggle (work-order/customer.tsx) used to flip their own state
// to "on" either before an async permission check resolved, or without
// ever awaiting it at all -- so the UI (and, for the contractor toggle,
// the DB) said "on" regardless of whether the OS actually granted
// anything. This hook is the one place that distinguishes the real states
// Android/iOS can report, so both toggles can gate on it instead of
// guessing:
//   'granted'      -- proceed
//   'undetermined' -- never asked yet; request() will show the OS prompt
//   'denied'       -- refused once, but canAskAgain is still true; request() will prompt again
//   'blocked'      -- refused with "don't ask again" (Android) or already
//                      denied and re-prompting is not allowed (iOS) --
//                      request() cannot show a prompt; only Settings can fix this
export type LocationPermissionState = 'granted' | 'undetermined' | 'denied' | 'blocked';

function toState(status: Location.PermissionStatus, canAskAgain: boolean): LocationPermissionState {
  if (status === Location.PermissionStatus.GRANTED) return 'granted';
  if (status === Location.PermissionStatus.UNDETERMINED) return 'undetermined';
  return canAskAgain ? 'denied' : 'blocked';
}

export function useLocationPermission() {
  const [state, setState] = useState<LocationPermissionState>('undetermined');
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refresh = useCallback(async (): Promise<LocationPermissionState> => {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    const next = toState(status, canAskAgain);
    if (mounted.current) setState(next);
    return next;
  }, []);

  // Only shows an OS prompt when state is 'undetermined' or 'denied' --
  // Android silently no-ops a request while 'blocked', so callers should
  // check state === 'blocked' first and send the user to Settings instead
  // of calling this.
  const request = useCallback(async (): Promise<LocationPermissionState> => {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    const next = toState(status, canAskAgain);
    if (mounted.current) setState(next);
    return next;
  }, []);

  // Re-check whenever the app comes back to the foreground -- the only way
  // to notice a permission revoked from system Settings while the app was
  // backgrounded, since there's no push event for it.
  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { state, refresh, request };
}
