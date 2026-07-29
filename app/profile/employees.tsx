import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Clipboard, FlatList, Modal, RefreshControl,
  ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Font, Radius } from '../../constants/theme';

interface Employee {
  id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  role: string;
  status: 'active' | 'pending' | 'inactive';
  can_accept_jobs: boolean;
  can_message_customers: boolean;
  can_manage_employees: boolean;
  jobs_completed: number;
  last_active_at: string | null;
  invited_at: string | null;
  invite_token: string | null;
}

interface TeamSummary {
  active_count: number;
  pending_count: number;
  total_used: number;
}

const ROLES = ['Field Tech', 'Admin', 'Dispatcher', 'Estimator'];

const ROLE_COLORS: Record<string, string> = {
  'Field Tech':  '#38BDF8',
  'Admin':       '#A78BFA',
  'Dispatcher':  '#34D399',
  'Estimator':   '#FBBF24',
};

function timeSince(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60)    return 'Just now';
  if (diff < 3600)  return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}

function getInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function EmployeesScreen() {
  const { colors: C } = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  const [employees, setEmployees]         = useState<Employee[]>([]);
  const [contractor, setContractor]       = useState<any>(null);
  const [teamSummary, setTeamSummary]     = useState<TeamSummary | null>(null);
  const [planLimit, setPlanLimit]         = useState<number | null>(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [actionTarget, setActionTarget]   = useState<Employee | null>(null);

  // Invite form
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteName, setInviteName]     = useState('');
  const [inviteRole, setInviteRole]     = useState('Field Tech');

  const load = useCallback(async () => {
    if (!user) return;

    const [{ data: cData }, { data: eData }, { data: summaryData }] = await Promise.all([
      supabase.from('contractors').select('id, company_name, company_tag, plan').eq('id', user.id).single(),
      supabase.from('contractor_employees').select('*').eq('contractor_id', user.id).order('invited_at', { ascending: false }),
      supabase.from('contractor_team_summary').select('active_count, pending_count, total_used').eq('contractor_id', user.id).single(),
    ]);

    if (cData) {
      setContractor(cData);
      const limits: Record<string, number> = { free: 3, leads: 10, pro: -1 };
      setPlanLimit(limits[cData.plan ?? 'free'] ?? 3);
    }

    setEmployees((eData ?? []) as Employee[]);
    setTeamSummary(summaryData ?? null);
    setLoading(false);
    setRefreshing(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const resetInviteForm = () => {
    setInviteEmail(''); setInviteName(''); setInviteRole('Field Tech');
  };

  async function handleSendInvite() {
    const email = inviteEmail.trim().toLowerCase();
    const name  = inviteName.trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid Email', 'Enter a valid email address.'); return;
    }
    if (!name) {
      Alert.alert('Required', 'Enter the employee\'s full name.'); return;
    }

    // Enforce plan limit
    const used  = teamSummary?.total_used ?? 0;
    const limit = planLimit ?? 3;
    if (limit !== -1 && used >= limit) {
      Alert.alert(
        'Team Limit Reached',
        `Your ${(contractor?.plan ?? 'free').toUpperCase()} plan allows ${limit} team member${limit !== 1 ? 's' : ''}. Upgrade to add more.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Upgrade Plan', onPress: () => { setShowInviteModal(false); router.push('/profile/subscription' as any); } },
        ],
      );
      return;
    }

    // Check for duplicate invite
    const existing = employees.find(e => e.email === email);
    if (existing) {
      Alert.alert('Already Invited', `${email} already has an invite for this team.`); return;
    }

    setSaving(true);
    const token = Crypto.randomUUID();

    const { error } = await supabase.from('contractor_employees').insert({
      contractor_id:          user!.id,
      email,
      full_name:              name,
      role:                   inviteRole,
      status:                 'pending',
      invite_token:           token,
      can_accept_jobs:        inviteRole === 'Field Tech' || inviteRole === 'Dispatcher',
      can_message_customers:  true,
      can_view_analytics:     inviteRole === 'Admin' || inviteRole === 'Estimator',
      can_manage_employees:   inviteRole === 'Admin',
      can_edit_profile:       inviteRole === 'Admin',
      invited_at:             new Date().toISOString(),
    });

    setSaving(false);

    if (error) {
      Alert.alert('Error', error.message); return;
    }

    setShowInviteModal(false);
    resetInviteForm();
    load();

    const inviteLink = `tradease://invite/${token}`;
    Alert.alert(
      'Invite Sent',
      `Share this link with ${name} to join your team:\n\n${inviteLink}`,
      [
        { text: 'Copy Link', onPress: () => Clipboard.setString(inviteLink) },
        { text: 'Done' },
      ],
    );
  }

  async function handleDeactivate(emp: Employee) {
    Alert.alert(
      'Deactivate Member',
      `${emp.full_name} will no longer have access to your team.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Deactivate', style: 'destructive', onPress: async () => {
          setActionTarget(null);
          await supabase.from('contractor_employees').update({ status: 'inactive' }).eq('id', emp.id);
          load();
        }},
      ],
    );
  }

  async function handleResendInvite(emp: Employee) {
    setActionTarget(null);
    const token = emp.invite_token ?? Math.random().toString(36).slice(2, 18);
    await supabase.from('contractor_employees').update({ invite_token: token, invited_at: new Date().toISOString() }).eq('id', emp.id);
    const link = `tradease://invite/${token}`;
    Alert.alert(
      'Invite Link',
      `Share this link with ${emp.full_name}:\n\n${link}`,
      [
        { text: 'Copy Link', onPress: () => Clipboard.setString(link) },
        { text: 'Done' },
      ],
    );
  }

  async function handleCopyInviteLink(emp: Employee) {
    setActionTarget(null);
    if (!emp.invite_token) return;
    Clipboard.setString(`tradease://invite/${emp.invite_token}`);
    Alert.alert('Copied', 'Invite link copied to clipboard.');
  }

  const s = makeStyles(C);

  if (loading) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  const activeMembers  = employees.filter(e => e.status === 'active');
  const pendingInvites = employees.filter(e => e.status === 'pending');
  const limit          = planLimit ?? 3;
  const used           = teamSummary?.total_used ?? 0;
  const isUnlimited    = limit === -1 || limit >= 999;
  const slotsFraction  = isUnlimited ? 1 : Math.min(used / limit, 1);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Team</Text>
        <TouchableOpacity style={[s.addBtn, { backgroundColor: C.orange }]} onPress={() => setShowInviteModal(true)}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Team slot usage card */}
      <View style={[s.slotCard, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={s.slotRow}>
          <View>
            <Text style={[s.slotTitle, { color: C.textPrimary }]}>
              {isUnlimited ? `${used} members` : `${used} of ${limit} slots used`}
            </Text>
            <Text style={[s.slotSub, { color: C.textMuted }]}>
              {contractor?.company_name ?? ''} · {(contractor?.plan ?? 'free').toUpperCase()} plan
            </Text>
          </View>
          {!isUnlimited && (
            <TouchableOpacity
              style={[s.upgradeChip, { borderColor: C.orange }]}
              onPress={() => router.push('/profile/subscription' as any)}
            >
              <Text style={[s.upgradeChipText, { color: C.orange }]}>Upgrade</Text>
            </TouchableOpacity>
          )}
        </View>
        {!isUnlimited && (
          <View style={[s.slotBarBg, { backgroundColor: C.surfaceAlt }]}>
            <View style={[s.slotBarFill, { backgroundColor: slotsFraction >= 1 ? '#EF4444' : C.orange, width: `${slotsFraction * 100}%` as any }]} />
          </View>
        )}
      </View>

      <FlatList
        data={[...activeMembers, ...pendingInvites]}
        keyExtractor={item => item.id}
        contentContainerStyle={s.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.orange} />}
        ListHeaderComponent={() => (
          <>
            {/* Active members header */}
            {activeMembers.length > 0 && (
              <Text style={[s.sectionLabel, { color: C.textMuted }]}>
                ACTIVE MEMBERS ({activeMembers.length})
              </Text>
            )}
          </>
        )}
        ListEmptyComponent={() => (
          <View style={s.empty}>
            <Ionicons name="people-outline" size={52} color={C.textMuted} />
            <Text style={[s.emptyTitle, { color: C.textPrimary }]}>No team members yet</Text>
            <Text style={[s.emptySub, { color: C.textSecondary }]}>
              Invite employees to join your team. They'll use the invite link to create their account and log in under your company.
            </Text>
            <TouchableOpacity style={[s.addEmptyBtn, { backgroundColor: C.orange }]} onPress={() => setShowInviteModal(true)}>
              <Text style={s.addEmptyBtnText}>Invite First Member</Text>
            </TouchableOpacity>
          </View>
        )}
        renderItem={({ item, index }) => {
          const isFirstPending = item.status === 'pending' && (index === 0 || employees.filter(e => e.status === 'pending')[0]?.id === item.id);
          const roleColor = ROLE_COLORS[item.role] ?? C.orange;
          return (
            <>
              {isFirstPending && (
                <Text style={[s.sectionLabel, { color: C.textMuted, marginTop: 20 }]}>
                  PENDING INVITES ({pendingInvites.length})
                </Text>
              )}
              <View style={[s.empCard, { backgroundColor: C.surface, borderColor: C.border }]}>
                {/* Avatar */}
                <View style={[s.empAvatar, { backgroundColor: item.status === 'active' ? roleColor + '22' : C.surfaceAlt, borderColor: item.status === 'active' ? roleColor : C.border }]}>
                  <Text style={[s.empAvatarText, { color: item.status === 'active' ? roleColor : C.textMuted }]}>
                    {getInitials(item.full_name)}
                  </Text>
                </View>

                {/* Info */}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[s.empName, { color: C.textPrimary }]}>{item.full_name}</Text>
                    <View style={[s.statusDot, { backgroundColor: item.status === 'active' ? '#22C55E' : item.status === 'pending' ? '#FBBF24' : C.textMuted }]} />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={[s.rolePill, { backgroundColor: roleColor + '18' }]}>
                      <Text style={[s.rolePillText, { color: roleColor }]}>{item.role}</Text>
                    </View>
                    {item.status === 'active' && (
                      <Text style={[s.metaText, { color: C.textMuted }]}>
                        {item.jobs_completed} jobs · Active {timeSince(item.last_active_at)}
                      </Text>
                    )}
                    {item.status === 'pending' && (
                      <Text style={[s.metaText, { color: '#FBBF24' }]}>
                        Invited {timeSince(item.invited_at)}
                      </Text>
                    )}
                  </View>
                  {item.status === 'pending' && (
                    <Text style={[s.metaText, { color: C.textSecondary, marginTop: 2 }]} numberOfLines={1}>
                      {item.email}
                    </Text>
                  )}
                </View>

                {/* Action button */}
                <TouchableOpacity
                  style={s.moreBtn}
                  onPress={() => setActionTarget(item)}
                >
                  <Ionicons name="ellipsis-vertical" size={18} color={C.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          );
        }}
      />

      {/* Invite Modal */}
      <Modal visible={showInviteModal} transparent animationType="slide" onRequestClose={() => { setShowInviteModal(false); resetInviteForm(); }}>
        <View style={s.modalBackdrop}>
          <View style={[s.modalSheet, { backgroundColor: C.surface }]}>
            <View style={s.modalHandle} />
            <Text style={[s.modalTitle, { color: C.textPrimary }]}>Invite Team Member</Text>
            <Text style={[s.modalSub, { color: C.textSecondary }]}>
              They'll receive an invite link to join your company on Tradease.
            </Text>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={[s.label, { color: C.textMuted }]}>Full Name</Text>
              <TextInput
                style={[s.input, { color: C.textPrimary, borderColor: C.border, backgroundColor: C.background }]}
                placeholder="e.g. Marcus Rivera"
                placeholderTextColor={C.textMuted}
                value={inviteName}
                onChangeText={setInviteName}
              />

              <Text style={[s.label, { color: C.textMuted }]}>Email Address</Text>
              <TextInput
                style={[s.input, { color: C.textPrimary, borderColor: C.border, backgroundColor: C.background }]}
                placeholder="employee@email.com"
                placeholderTextColor={C.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                value={inviteEmail}
                onChangeText={setInviteEmail}
              />

              <Text style={[s.label, { color: C.textMuted }]}>Role</Text>
              <View style={s.roleRow}>
                {ROLES.map(r => {
                  const active = inviteRole === r;
                  const rc = ROLE_COLORS[r] ?? C.orange;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[s.rolePillBtn, { borderColor: active ? rc : C.border, backgroundColor: active ? rc + '18' : C.background }]}
                      onPress={() => setInviteRole(r)}
                    >
                      <Text style={[s.rolePillBtnText, { color: active ? rc : C.textSecondary }]}>{r}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Permissions preview */}
              <View style={[s.permPreview, { backgroundColor: C.background, borderColor: C.border }]}>
                <Text style={[s.permTitle, { color: C.textMuted }]}>DEFAULT PERMISSIONS</Text>
                {[
                  { label: 'Accept jobs',         value: inviteRole === 'Field Tech' || inviteRole === 'Dispatcher' },
                  { label: 'Message customers',   value: true },
                  { label: 'View analytics',      value: inviteRole === 'Admin' || inviteRole === 'Estimator' },
                  { label: 'Manage team',          value: inviteRole === 'Admin' },
                ].map(p => (
                  <View key={p.label} style={s.permRow}>
                    <Ionicons
                      name={p.value ? 'checkmark-circle' : 'close-circle-outline'}
                      size={15}
                      color={p.value ? '#22C55E' : C.textMuted}
                    />
                    <Text style={[s.permLabel, { color: p.value ? C.textPrimary : C.textMuted }]}>{p.label}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: C.orange, opacity: saving ? 0.7 : 1 }]}
                onPress={handleSendInvite}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Ionicons name="send-outline" size={16} color="#fff" />
                      <Text style={s.saveBtnText}>Send Invite</Text>
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity style={s.cancelBtn} onPress={() => { setShowInviteModal(false); resetInviteForm(); }}>
                <Text style={[s.cancelBtnText, { color: C.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Action Sheet Modal */}
      <Modal visible={!!actionTarget} transparent animationType="fade" onRequestClose={() => setActionTarget(null)}>
        <TouchableOpacity style={s.actionBackdrop} activeOpacity={1} onPress={() => setActionTarget(null)}>
          <View style={[s.actionSheet, { backgroundColor: C.surface, borderColor: C.border }]}>
            <Text style={[s.actionName, { color: C.textPrimary }]}>{actionTarget?.full_name}</Text>
            <Text style={[s.actionRole, { color: C.textMuted }]}>{actionTarget?.role} · {actionTarget?.status}</Text>

            <View style={[s.actionDivider, { backgroundColor: C.border }]} />

            {actionTarget?.status === 'pending' && (
              <>
                <TouchableOpacity style={s.actionItem} onPress={() => actionTarget && handleResendInvite(actionTarget)}>
                  <Ionicons name="refresh-outline" size={18} color={C.orange} />
                  <Text style={[s.actionItemText, { color: C.textPrimary }]}>Resend Invite</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.actionItem} onPress={() => actionTarget && handleCopyInviteLink(actionTarget)}>
                  <Ionicons name="copy-outline" size={18} color={C.orange} />
                  <Text style={[s.actionItemText, { color: C.textPrimary }]}>Copy Invite Link</Text>
                </TouchableOpacity>
              </>
            )}

            {actionTarget?.status === 'active' && (
              <TouchableOpacity style={s.actionItem} onPress={() => actionTarget && handleDeactivate(actionTarget)}>
                <Ionicons name="close-circle-outline" size={18} color='#EF4444' />
                <Text style={[s.actionItemText, { color: '#EF4444' }]}>Deactivate Member</Text>
              </TouchableOpacity>
            )}

            <View style={[s.actionDivider, { backgroundColor: C.border }]} />
            <TouchableOpacity style={s.actionItem} onPress={() => setActionTarget(null)}>
              <Text style={[s.actionItemText, { color: C.textMuted, textAlign: 'center' }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

function makeStyles(C: any) {
  return StyleSheet.create({
    container:      { flex: 1, backgroundColor: C.background },
    center:         { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header:         { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
    backBtn:        { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle:    { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: Font.bold, color: C.textPrimary },
    addBtn:         { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

    slotCard:       { marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: Radius.lg, borderWidth: 1, gap: 10 },
    slotRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    slotTitle:      { fontSize: 15, fontWeight: Font.black },
    slotSub:        { fontSize: 11, marginTop: 2 },
    upgradeChip:    { borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 5 },
    upgradeChipText:{ fontSize: 12, fontWeight: Font.black },
    slotBarBg:      { height: 5, borderRadius: 999 },
    slotBarFill:    { height: 5, borderRadius: 999 },

    list:           { paddingHorizontal: 16, paddingBottom: 100 },
    sectionLabel:   { fontSize: 11, fontWeight: Font.black, letterSpacing: 0.8, marginBottom: 10, marginTop: 4 },

    empCard:        { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: Radius.lg, borderWidth: 1, marginBottom: 10 },
    empAvatar:      { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, flexShrink: 0 },
    empAvatarText:  { fontSize: 15, fontWeight: Font.black },
    empName:        { fontSize: 15, fontWeight: Font.bold },
    statusDot:      { width: 7, height: 7, borderRadius: 4 },
    rolePill:       { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    rolePillText:   { fontSize: 11, fontWeight: Font.black },
    metaText:       { fontSize: 12 },
    moreBtn:        { padding: 6 },

    empty:          { alignItems: 'center', paddingTop: 60, paddingHorizontal: 40, gap: 10 },
    emptyTitle:     { fontSize: 20, fontWeight: Font.black },
    emptySub:       { fontSize: 14, textAlign: 'center', lineHeight: 21 },
    addEmptyBtn:    { marginTop: 16, borderRadius: Radius.md, paddingVertical: 14, paddingHorizontal: 24 },
    addEmptyBtnText:{ fontSize: 15, fontWeight: Font.black, color: '#fff' },

    modalBackdrop:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
    modalSheet:     { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 40, maxHeight: '90%' },
    modalHandle:    { width: 36, height: 4, backgroundColor: '#444', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
    modalTitle:     { fontSize: 22, fontWeight: Font.black, marginBottom: 6 },
    modalSub:       { fontSize: 14, lineHeight: 21, marginBottom: 20 },

    label:          { fontSize: 11, fontWeight: Font.black, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 7 },
    input:          { borderRadius: Radius.md, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 18 },
    roleRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
    rolePillBtn:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: Radius.full, borderWidth: 1.5 },
    rolePillBtnText:{ fontSize: 13, fontWeight: Font.semibold },

    permPreview:    { borderRadius: Radius.md, borderWidth: 1, padding: 14, marginBottom: 20, gap: 8 },
    permTitle:      { fontSize: 10, fontWeight: Font.black, letterSpacing: 0.8, marginBottom: 4 },
    permRow:        { flexDirection: 'row', alignItems: 'center', gap: 8 },
    permLabel:      { fontSize: 13 },

    saveBtn:        { height: 54, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 12, flexDirection: 'row', gap: 8 },
    saveBtnText:    { fontSize: 16, fontWeight: Font.black, color: '#fff' },
    cancelBtn:      { alignItems: 'center', paddingVertical: 12 },
    cancelBtnText:  { fontSize: 15, fontWeight: Font.semibold },

    actionBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'flex-end', padding: 16 },
    actionSheet:    { width: '100%', borderRadius: 20, borderWidth: 1, padding: 8, paddingBottom: 8 },
    actionName:     { fontSize: 16, fontWeight: Font.black, textAlign: 'center', paddingVertical: 12 },
    actionRole:     { fontSize: 13, textAlign: 'center', paddingBottom: 4 },
    actionDivider:  { height: 0.5, marginVertical: 4 },
    actionItem:     { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
    actionItemText: { fontSize: 15, fontWeight: Font.semibold, flex: 1 },
  });
}
