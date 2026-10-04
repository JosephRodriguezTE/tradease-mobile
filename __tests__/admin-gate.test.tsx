// Admin controls on the job screen follow users.is_admin (useIsAdmin), not a
// hard-coded email address.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockFromCalls: { table: string; op: string; cols?: string }[] = [];
const mockRpc = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'b1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }) }) }));
const mockAuth = { email: 'c@example.com' };
const mockAdmin = { isAdmin: false };
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'cust1', email: mockAuth.email } }) }));
jest.mock('@/hooks/useIsAdmin', () => ({ useIsAdmin: () => ({ isAdmin: mockAdmin.isAdmin, loading: false }) }));
jest.mock('@/hooks/useRole', () => ({ useRole: () => ({ isContractor: false, isCustomer: true }) }));
jest.mock('@/components/HammerLoader', () => ({ HammerLoader: () => null }));
jest.mock('@/components/VerificationGate', () => () => null);
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('../app/(tabs)/contractor-home', () => ({ QuoteBottomSheet: () => null }));
jest.mock('../lib/supabase', () => {
  const booking = {
    id: 'b1', customer_id: 'cust1', contractor_id: 'con1', customer_name: 'Jane Smith', contractor_name: 'Ace Plumbing',
    status: 'confirmed', trade: 'Plumbing', description: 'Leaky tap', notes: '1 Exact Street', request_mode: 'direct',
    before_photos: [], after_photos: [],
  };
  const card = { id: 'con1', company_name: 'Ace Plumbing', trade_type: 'Plumbing', rating: 4.9, phone: '555-0100' };
  const chain = (table: string, data: unknown): any => {
    const c: any = {};
    for (const m of ['eq', 'in', 'order', 'limit']) c[m] = () => c;
    c.maybeSingle = () => Promise.resolve({ data: Array.isArray(data) ? data[0] ?? null : data, error: null });
    c.single = c.maybeSingle;
    c.then = (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
    return c;
  };
  const channel: any = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: (table: string) => ({
        select: (cols: string) => {
          mockFromCalls.push({ table, op: 'select', cols });
          if (table === 'bookings') return chain(table, booking);
          if (table === 'contractors_public') return chain(table, [card]);
          if (table === 'contractors') return chain(table, null); // what RLS gives a customer
          return chain(table, null);
        },
        insert: (row: unknown) => { mockFromCalls.push({ table, op: 'insert' }); return Promise.resolve({ error: null }); },
      }),
      rpc: (...a: unknown[]) => mockRpc(...a),
      getChannels: () => [],
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

import JobDetailScreen from '../app/job/[id]';

jest.setTimeout(20000);

test('the old admin email alone no longer unlocks Delete', async () => {
  mockAuth.email = 'joegimapa@gmail.com';
  mockAdmin.isAdmin = false;
  render(<JobDetailScreen />);
  await screen.findAllByText('Ace Plumbing', {}, { timeout: 15000 });
  expect(screen.queryByText('Delete')).toBeNull();
  expect(screen.getByText('Cancel')).toBeTruthy();
});

test('users.is_admin unlocks Delete for any address', async () => {
  mockAuth.email = 'someone-else@example.com';
  mockAdmin.isAdmin = true;
  render(<JobDetailScreen />);
  await screen.findAllByText('Ace Plumbing', {}, { timeout: 15000 });
  expect(screen.getByText('Delete')).toBeTruthy();
  expect(screen.queryByText('Cancel')).toBeNull();
});
