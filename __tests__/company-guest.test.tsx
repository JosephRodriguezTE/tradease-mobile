// A guest (no session) can open a contractor's profile. Asking
// contractors_public for phone as anon fails the whole query (phone calls a
// function anon can't execute), which used to show "Contractor not found".
import React from 'react';
import { render, screen } from '@testing-library/react-native';

const mockGetSession = jest.fn();
let mockSignedIn = false;
const mockSelects: string[] = [];

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'c1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), canGoBack: () => false, replace: jest.fn() }),
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/HammerLoader', () => ({ HammerLoader: () => null }));
jest.mock('@/lib/messageService', () => ({ deriveChatId: () => 'chat' }));
jest.mock('@/lib/supabase', () => {
  const list = (): any => {
    const c: any = {};
    for (const m of ['eq', 'order', 'limit', 'in']) c[m] = () => c;
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
    return c;
  };
  return {
    supabase: {
      auth: { getSession: () => mockGetSession() },
      from: (table: string) => ({
        select: (cols: string) => {
          if (table !== 'contractors_public') return list();
          mockSelects.push(cols);
          // What the database does: anon + phone => permission denied.
          const anonPhone = /\bphone\b/.test(cols) && !mockSignedIn;
          const single = () => Promise.resolve(anonPhone
            ? { data: null, error: { code: '42501', message: 'permission denied for function has_active_booking_relationship' } }
            : { data: { id: 'c1', company_name: 'Ace Plumbing', specializations: [], portfolio_photos: [], languages: [] }, error: null });
          return { eq: () => ({ single }) };
        },
      }),
    },
  };
});

import CompanyScreen from '../app/company/[id]';

jest.setTimeout(20000);
beforeEach(() => { mockSelects.length = 0; mockGetSession.mockReset(); });

test('guest: profile loads, phone not requested', async () => {
  mockSignedIn = false;
  mockGetSession.mockReturnValue(Promise.resolve({ data: { session: null } }));
  render(<CompanyScreen />);
  expect(await screen.findAllByText('Ace Plumbing', {}, { timeout: 15000 })).not.toHaveLength(0);
  expect(screen.queryByText('Contractor not found.')).toBeNull();
  expect(mockSelects[0]).not.toMatch(/\bphone\b/);
});

test('signed in: phone still requested', async () => {
  mockSignedIn = true;
  mockGetSession.mockReturnValue(Promise.resolve({ data: { session: { user: { id: 'u1' } } } }));
  render(<CompanyScreen />);
  expect(await screen.findAllByText('Ace Plumbing', {}, { timeout: 15000 })).not.toHaveLength(0);
  expect(mockSelects[0]).toMatch(/\bphone\b/);
});
