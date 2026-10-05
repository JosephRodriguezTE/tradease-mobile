// "Downgrade to Free" goes through contractor_downgrade_to_free() (a direct
// contractors.plan write is always rejected by the billing guard), and chat
// photo messages render the image rather than the "📷 Photo" placeholder.
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockRpc = jest.fn();
const mockUpdate = jest.fn();
const mockSigned = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn(), canGoBack: () => true }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/context/ThemeContext', () => ({ useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }) }) }));
jest.mock('@/components/HammerLoader', () => ({ HammerLoader: () => null }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/lib/supabase', () => {
  const single = (data: unknown) => {
    const c: any = {};
    c.eq = () => c;
    c.single = () => Promise.resolve({ data, error: null });
    return c;
  };
  return {
    supabase: {
      auth: { getUser: () => Promise.resolve({ data: { user: { id: 'con1', email: 'c@example.com' } }, error: null }) },
      from: (table: string) => ({
        select: () => single(table === 'contractors' ? { plan: 'pro' } : { total_used: 1 }),
        update: (...a: unknown[]) => { mockUpdate(table, ...a); return single(null); },
      }),
      rpc: (...a: unknown[]) => mockRpc(...a),
      storage: { from: () => ({ createSignedUrl: (...a: unknown[]) => mockSigned(...a) }) },
    },
  };
});

import SubscriptionScreen from '../app/profile/subscription';
import { ChatPhoto } from '../components/ChatPhoto';

jest.setTimeout(20000);
let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockRpc.mockReset(); mockUpdate.mockReset(); mockSigned.mockReset();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

async function confirmDowngrade() {
  render(<SubscriptionScreen />);
  fireEvent.press(await screen.findByText('Downgrade to Free', {}, { timeout: 15000 }));
  const buttons = alertSpy.mock.calls.find(c => c[0] === 'Downgrade to Free')![2] as { text: string; onPress?: () => Promise<void> }[];
  await buttons.find(b => b.text === 'Downgrade')!.onPress!();
}

test('Downgrade to Free calls the RPC, never writes contractors.plan', async () => {
  mockRpc.mockResolvedValue({ data: 'free', error: null });
  await confirmDowngrade();
  expect(mockRpc).toHaveBeenCalledWith('contractor_downgrade_to_free');
  expect(mockUpdate).not.toHaveBeenCalled();
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Plan Updated', 'You are now on the Free plan.'));
});

test('refused downgrade shows the reason', async () => {
  mockRpc.mockResolvedValue({ data: null, error: { message: 'You have 4 team members and the Free plan allows 3. Deactivate some first.' } });
  await confirmDowngrade();
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith('Plan not changed', expect.stringContaining('Deactivate some first')));
});

test('ChatPhoto shows the image from the work-orders bucket', async () => {
  mockSigned.mockResolvedValue({ data: { signedUrl: 'https://signed.example/p.jpg' }, error: null });
  render(<ChatPhoto mediaPath="wo1/chat/1.jpg" textColor="#fff" />);
  const img = await screen.findByTestId('chat-photo');
  expect(img.props.source).toEqual({ uri: 'https://signed.example/p.jpg' });
  expect(mockSigned).toHaveBeenCalledWith('wo1/chat/1.jpg', 3600);
});
