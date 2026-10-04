// A failed work-order chat send keeps the draft and tells the user; it no
// longer clears the box first and fails silently.
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockInsert = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ work_order_id: 'wo1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: 'light' }, NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/HammerLoader', () => ({ HammerLoader: () => null }));
jest.mock('@/lib/supabase', () => {
  // Every read resolves empty; insert is the thing under test.
  const result = { data: [], error: null };
  const chain: any = {};
  for (const m of ['select', 'eq', 'is', 'order', 'in', 'update']) chain[m] = () => chain;
  // The work order: this user (u1) is its contractor.
  chain.maybeSingle = () => Promise.resolve({
    data: { contractor_id: 'u1', customer_id: 'c1', contractor_name: 'Ace Plumbing', customer_name: 'Jane S.' }, error: null,
  });
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  const channel: any = { on: () => channel, subscribe: () => channel };
  return {
    supabase: {
      from: (table: string) => ({ ...chain, insert: (row: unknown) => mockInsert(table, row) }),
      rpc: () => Promise.resolve({ data: 0, error: null }),
      storage: { from: () => ({ createSignedUrl: () => Promise.resolve({ data: null }) }) },
      getChannels: () => [],
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

import WorkOrderChatScreen from '../app/work-order/chat';

beforeEach(() => {
  mockInsert.mockReset();
  jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

async function typeAndSend(text: string) {
  const input = await screen.findByPlaceholderText('Message…');
  fireEvent.changeText(input, text);
  fireEvent.press(screen.getByLabelText('Send message'));
  return input;
}

test('failed send: alert with the reason, and the draft is still there', async () => {
  mockInsert.mockResolvedValue({ error: { message: 'new row violates row-level security policy' } });
  render(<WorkOrderChatScreen />);
  await typeAndSend('Running 10 min late');

  await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
    'Message not sent',
    expect.stringContaining('new row violates row-level security policy'),
  ));
  expect(screen.getByPlaceholderText('Message…').props.value).toBe('Running 10 min late');
});

test('successful send: no alert, draft clears', async () => {
  mockInsert.mockResolvedValue({ error: null });
  render(<WorkOrderChatScreen />);
  await typeAndSend('On my way');

  await waitFor(() => expect(screen.getByPlaceholderText('Message…').props.value).toBe(''));
  expect(Alert.alert).not.toHaveBeenCalled();
  // Goes to the pair's thread in messages -- the one the website shows and
  // the one whose triggers push the other party -- not work_order_messages.
  expect(mockInsert).toHaveBeenCalledWith('messages', expect.objectContaining({
    chat_id: 'c1_u1', sender_id: 'u1', recipient_id: 'c1', sender_role: 'contractor',
    sender_name: 'Ace Plumbing', body: 'On my way',
  }));
});
