// A direct request the contractor hasn't accepted: the bookings row is
// hidden by RLS, so the screen shows direct_request_previews() -- "First L."
// and the town -- and only gets the address after accepting.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockState = { accepted: false };
const mockRpc = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => false }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'con1', email: 'c@example.com' } }) }));
jest.mock('@/hooks/useRole', () => ({ useRole: () => ({ isContractor: true, isCustomer: false }) }));
jest.mock('@/components/HammerLoader', () => ({ HammerLoader: () => null }));
jest.mock('@/components/VerificationGate', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('../app/(tabs)/contractor-home', () => ({ QuoteBottomSheet: () => null }));
jest.mock('../lib/supabase', () => {
  const full = {
    id: 'b1', customer_id: 'cust1', contractor_id: 'con1', customer_name: 'Jane Smith', contractor_name: 'Ace',
    status: 'confirmed', trade: 'Plumbing', description: 'Leaky tap', notes: '1 Exact Street',
    price_estimate: 150, request_mode: 'direct', town: 'Testville', before_photos: [], after_photos: [],
  };
  const q = (data: unknown): any => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) c[m] = () => c;
    c.maybeSingle = () => Promise.resolve({ data, error: null });
    c.single = () => Promise.resolve({ data, error: null });
    return c;
  };
  const channel: any = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: (table: string) => table === 'bookings' ? q(mockState.accepted ? full : null)
        : table === 'contractors' ? q({ verification_status: 'approved', company_name: 'Ace' })
        : q(null),
      rpc: (...args: unknown[]) => mockRpc(...args),
      getChannels: () => [],
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

import JobDetailScreen from '../app/job/[id]';

const preview = {
  id: 'b1', contractor_id: 'con1', customer_id: 'cust1', customer_name: 'Jane S.',
  trade: 'Plumbing', description: 'Leaky tap', status: 'pending', price_estimate: 150,
  request_mode: 'direct', request_expires_at: null, town: 'Testville', nearest_major_road: null,
};

jest.setTimeout(20000);
beforeEach(() => {
  mockState.accepted = false;
  mockRpc.mockReset();
  mockRpc.mockImplementation((fn: string) => Promise.resolve(
    fn === 'direct_request_previews' ? { data: [preview], error: null }
      : fn === 'accept_direct_request' ? (mockState.accepted = true, { data: { id: 'b1' }, error: null })
      : { data: null, error: null }));
});

test('before accepting: short name and town, no address', async () => {
  render(<JobDetailScreen />);
  expect(await screen.findByText('📩 You Were Requested Directly', {}, { timeout: 15000 })).toBeTruthy();
  expect(screen.getByText(/Jane S\. asked for you by name/)).toBeTruthy();
  expect(screen.getByText('Testville')).toBeTruthy();
  expect(screen.queryByText('1 Exact Street')).toBeNull();
  expect(screen.queryByText(/Jane Smith/)).toBeNull();
  expect(mockRpc).toHaveBeenCalledWith('direct_request_previews', { p_booking_id: 'b1' });
});

test('after accepting: full detail loads', async () => {
  render(<JobDetailScreen />);
  fireEvent.press(await screen.findByText('Accept', {}, { timeout: 15000 }));
  await waitFor(() => expect(screen.getByText('1 Exact Street')).toBeTruthy(), { timeout: 15000 });
  expect(screen.getByText('Jane Smith')).toBeTruthy();
});
