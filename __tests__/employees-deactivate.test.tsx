// Deactivating a team member tells the owner when it didn't go through;
// it used to ignore the update's error and just reload.
import React from 'react';
import { Alert } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';

const mockUpdate = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
jest.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'c1' } }) }));
jest.mock('@/hooks/useRole', () => ({ useRole: () => ({ isEmployee: false, employerContractorId: null }) }));
jest.mock('@/context/ThemeContext', () => ({
  useTheme: () => ({ colors: new Proxy({}, { get: () => '#000000' }) }),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => 'uuid' }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('@/components/HammerLoader', () => ({ HammerLoader: () => null }));
jest.mock('@/lib/supabase', () => {
  const jane = {
    id: 'e1', user_id: 'u2', full_name: 'Jane Smith', email: 'jane@example.com', role: 'Field Tech',
    status: 'active', can_accept_jobs: true, can_message_customers: true, can_manage_employees: false,
    jobs_completed: 0, last_active_at: null, invited_at: null, invite_token: null,
  };
  const chain = (data: unknown): any => {
    const c: any = {};
    for (const m of ['select', 'eq', 'order']) c[m] = () => c;
    c.single = () => Promise.resolve({ data: null, error: null });
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
    return c;
  };
  return {
    supabase: {
      from: (table: string) => ({
        ...chain(table === 'contractor_employees' ? [jane] : null),
        update: (...a: unknown[]) => ({ eq: () => mockUpdate(...a) }),
      }),
    },
  };
});

import EmployeesScreen from '../app/profile/employees';

// The first render pulls in a large screen; give a cold (uncached) run room.
jest.setTimeout(20000);

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  mockUpdate.mockReset();
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

async function deactivateJane() {
  render(<EmployeesScreen />);
  fireEvent.press(await screen.findByLabelText('Options for Jane Smith', {}, { timeout: 15000 }));
  fireEvent.press(screen.getByText('Deactivate Member'));
  // Confirm in the "Deactivate Member" dialog.
  const buttons = alertSpy.mock.calls[0][2] as { text: string; onPress?: () => Promise<void> }[];
  await buttons.find(b => b.text === 'Deactivate')!.onPress!();
}

test('failed deactivate: alert with the reason', async () => {
  mockUpdate.mockResolvedValue({ error: { message: 'permission denied for table contractor_employees' } });
  await deactivateJane();
  await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
    'Not deactivated', expect.stringContaining('permission denied'),
  ));
});

test('successful deactivate: no error alert', async () => {
  mockUpdate.mockResolvedValue({ error: null });
  await deactivateJane();
  expect(mockUpdate).toHaveBeenCalledWith({ status: 'removed' }); // the value contractor_employees_status_check accepts
  expect(alertSpy).toHaveBeenCalledTimes(1); // just the confirm dialog
});
