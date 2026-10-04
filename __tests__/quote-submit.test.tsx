// Mobile quotes go through submit_quote() (like the website) -- with the job
// date and time slot -- instead of inserting into job_offers directly, which
// skipped the RPC's checks and set a 4h expiry.
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockRpc = jest.fn();
const mockFrom = jest.fn();

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/context/ThemeContext', () => ({
  ...jest.requireActual('@/context/ThemeContext'),
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('@/components/HammerLoader', () => ({ HammerLoader: () => null }));
jest.mock('@/components/VerificationGate', () => () => null);
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'con1' } }) }));
jest.mock('@/hooks/useRole', () => ({ useRole: () => ({ isContractor: true }) }));
jest.mock('@/hooks/useLocationPermission', () => ({ useLocationPermission: () => ({}) }));
jest.mock('@/lib/locationService', () => ({ startLiveTracking: jest.fn(), stopLiveTracking: jest.fn() }));
jest.mock('@/lib/messageService', () => ({ deriveChatId: () => 'chat' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...a: unknown[]) => mockRpc(...a),
    from: (...a: unknown[]) => mockFrom(...a),
  },
}));

import { QuoteBottomSheet } from '../app/(tabs)/contractor-home';

const booking: any = { id: 'b1', trade: 'Plumbing', description: 'Leaky tap', customer_id: 'cust1' };

function fillAndSend() {
  const onSent = jest.fn();
  render(<QuoteBottomSheet booking={booking} contractorId="con1" visible onClose={jest.fn()} onSent={onSent} />);
  fireEvent.changeText(screen.getByPlaceholderText('0.00'), '150');
  const next = new Date(Date.now() + 3 * 86400000);
  const mmddyyyy = `${String(next.getMonth() + 1).padStart(2, '0')}${String(next.getDate()).padStart(2, '0')}${next.getFullYear()}`;
  fireEvent.changeText(screen.getByPlaceholderText('MM/DD/YYYY'), mmddyyyy);
  fireEvent.press(screen.getByText('Morning'));
  fireEvent.press(screen.getByText('Send Quote'));
  return onSent;
}

beforeEach(() => { mockRpc.mockReset(); mockFrom.mockReset(); });

test('sends through submit_quote with the schedule; never writes job_offers directly', async () => {
  mockRpc.mockResolvedValue({ data: 'offer1', error: null });
  const onSent = fillAndSend();
  await waitFor(() => expect(onSent).toHaveBeenCalledWith('b1'));
  expect(mockRpc).toHaveBeenCalledWith('submit_quote', expect.objectContaining({
    p_booking_id: 'b1', p_quoted_price: 150, p_scheduled_at: expect.any(String),
    p_booking_time: expect.stringContaining('Morning'),
  }));
  expect(mockFrom).not.toHaveBeenCalled();
});

test("another contractor's live quote: clear message, not sent", async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'This job already has an active quote from another contractor' } });
  const onSent = fillAndSend();
  expect(await screen.findByText('Another contractor has already quoted this job.')).toBeTruthy();
  expect(onSent).not.toHaveBeenCalled();
});
