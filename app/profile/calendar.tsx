import React, {
  useState, useEffect, useCallback, useMemo,
} from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Dimensions,
  KeyboardAvoidingView, Platform, Modal, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/lib/supabase';

const { width: SW } = Dimensions.get('window');

// ─── Types ─────────────────────────────────────────────────────────────────────

type EventType = 'booking' | 'block' | 'reminder';

interface CalEvent {
  id: string;
  rawId?: string;
  title: string;
  description?: string | null;
  start_time: string;
  end_time: string;
  event_type: EventType;
  booking_id?: string | null;
  color: string;
  source: 'booking' | 'schedule';
  payout?: number;
  status?: string;
}

interface WeekSummary {
  jobs: number;
  revenue: number;
  blocked: number;
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

function useCalendar(contractorId: string | null) {
  const [events,  setEvents]  = useState<CalEvent[]>([]);
  const [summary, setSummary] = useState<WeekSummary>({ jobs: 0, revenue: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!contractorId) { setLoading(false); return; }

    const weekStart = (() => {
      const d = new Date();
      d.setDate(d.getDate() - d.getDay());
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);

    const [bookRes, schedRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('id,trade,description,job_address,scheduled_date,price_estimate,status,customer_name')
        .eq('contractor_id', contractorId)
        .in('status', ['confirmed', 'in_progress', 'completed'])
        .not('scheduled_date', 'is', null)
        .order('scheduled_date', { ascending: true }),
      supabase
        .from('contractor_schedule')
        .select('*')
        .eq('contractor_id', contractorId)
        .order('start_time', { ascending: true }),
    ]);

    const merged: CalEvent[] = [
      ...(bookRes.data ?? []).map(b => ({
        id:          `booking_${b.id}`,
        rawId:       undefined as string | undefined,
        title:       b.trade ?? 'Job',
        description: b.job_address ?? b.description,
        start_time:  b.scheduled_date,
        end_time:    new Date(new Date(b.scheduled_date).getTime() + 2 * 3600000).toISOString(),
        event_type:  'booking' as EventType,
        booking_id:  b.id,
        color:       '#FF6200',
        source:      'booking' as const,
        payout:      b.price_estimate ?? 0,
        status:      b.status,
      })),
      ...(schedRes.data ?? []).map(s => ({
        id:          `sched_${s.id}`,
        rawId:       s.id as string,
        title:       s.title,
        description: s.description,
        start_time:  s.start_time,
        end_time:    s.end_time,
        event_type:  s.event_type as EventType,
        booking_id:  s.booking_id,
        color:       s.event_type === 'block' ? '#555555' : '#38BDF8',
        source:      'schedule' as const,
      })),
    ].sort((a, b) => +new Date(a.start_time) - +new Date(b.start_time));

    const weekEvts = merged.filter(e => {
      const d = new Date(e.start_time);
      return d >= weekStart && d < weekEnd;
    });
    setSummary({
      jobs:    weekEvts.filter(e => e.event_type === 'booking').length,
      revenue: weekEvts.filter(e => e.event_type === 'booking').reduce((s, e) => s + (e.payout ?? 0), 0),
      blocked: weekEvts.filter(e => e.event_type === 'block').length,
    });

    setEvents(merged);
    setLoading(false);
  }, [contractorId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!contractorId) return;
    const ch = supabase
      .channel(`cal:${contractorId}:${Math.random().toString(36).slice(2, 7)}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'bookings',
        filter: `contractor_id=eq.${contractorId}`,
      }, load)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'contractor_schedule',
        filter: `contractor_id=eq.${contractorId}`,
      }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [contractorId, load]);

  return { events, summary, loading, reload: load };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const MONTHS    = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SH = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_ABBR  = ['S','M','T','W','T','F','S'];
const DAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function startOfDay(d: Date): Date {
  const c = new Date(d); c.setHours(0, 0, 0, 0); return c;
}

function buildWeek(anchor: Date): Date[] {
  const sun = new Date(anchor);
  sun.setDate(sun.getDate() - sun.getDay());
  sun.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun); d.setDate(d.getDate() + i); return d;
  });
}

function fmtTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const h = d.getHours(); const m = d.getMinutes();
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function fmtMoney(n: number) {
  return n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n}`;
}

// ─── TimePicker ────────────────────────────────────────────────────────────────

function TimePicker({ hour, minute, onHour, onMinute, C }: {
  hour: number; minute: number;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
  C: any;
}) {
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const am  = hour < 12;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ alignItems: 'center' }}>
        <TouchableOpacity onPress={() => onHour((hour + 1) % 24)} hitSlop={8}>
          <Ionicons name="chevron-up" size={16} color={C.orange} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.textPrimary, width: 28, textAlign: 'center' }}>
          {String(h12).padStart(2, '0')}
        </Text>
        <TouchableOpacity onPress={() => onHour((hour - 1 + 24) % 24)} hitSlop={8}>
          <Ionicons name="chevron-down" size={16} color={C.orange} />
        </TouchableOpacity>
      </View>
      <Text style={{ fontSize: 20, fontWeight: '700', color: C.textPrimary, marginBottom: 2 }}>:</Text>
      <View style={{ alignItems: 'center' }}>
        <TouchableOpacity onPress={() => onMinute((minute + 15) % 60)} hitSlop={8}>
          <Ionicons name="chevron-up" size={16} color={C.orange} />
        </TouchableOpacity>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.textPrimary, width: 28, textAlign: 'center' }}>
          {String(minute).padStart(2, '0')}
        </Text>
        <TouchableOpacity onPress={() => onMinute(minute - 15 < 0 ? 45 : minute - 15)} hitSlop={8}>
          <Ionicons name="chevron-down" size={16} color={C.orange} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        onPress={() => onHour(am ? hour + 12 : hour - 12)}
        style={{ backgroundColor: C.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: C.border, marginLeft: 4 }}
      >
        <Text style={{ color: C.orange, fontWeight: '700', fontSize: 12 }}>{am ? 'AM' : 'PM'}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── EventCard ─────────────────────────────────────────────────────────────────

function EventCard({ event, onPress, onLongPress, C }: {
  event: CalEvent; onPress: () => void; onLongPress: () => void; C: any;
}) {
  const typeLabel = event.event_type === 'booking' ? 'Job' :
                    event.event_type === 'block'   ? 'Blocked' : 'Reminder';
  return (
    <TouchableOpacity
      style={[ec.card, { backgroundColor: C.surface, borderColor: C.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={0.75}
    >
      <View style={[ec.bar, { backgroundColor: event.color }]} />
      <View style={ec.body}>
        <View style={ec.topRow}>
          <Text style={[ec.title, { color: C.textPrimary }]} numberOfLines={1}>{event.title}</Text>
          <Text style={[ec.time, { color: C.textMuted }]}>{fmtTime(event.start_time)}</Text>
        </View>
        {!!event.description && (
          <Text style={[ec.sub, { color: C.textSecondary }]} numberOfLines={1}>{event.description}</Text>
        )}
        <View style={ec.metaRow}>
          <View style={[ec.pill, { backgroundColor: `${event.color}22` }]}>
            <Text style={[ec.pillText, { color: event.color }]}>{typeLabel}</Text>
          </View>
          {!!event.payout && (
            <Text style={[ec.payout, { color: '#22C55E' }]}>+{fmtMoney(event.payout)}</Text>
          )}
          <Text style={[ec.time, { color: C.textMuted, marginLeft: 'auto' }]}>→ {fmtTime(event.end_time)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const ec = StyleSheet.create({
  card:    { flexDirection: 'row', borderRadius: 12, borderWidth: 1, marginBottom: 10, overflow: 'hidden' },
  bar:     { width: 4 },
  body:    { flex: 1, padding: 12 },
  topRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title:   { fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  time:    { fontSize: 12 },
  sub:     { fontSize: 13, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  pill:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  pillText:{ fontSize: 11, fontWeight: '600' },
  payout:  { fontSize: 13, fontWeight: '700' },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function ContractorCalendarScreen() {
  const router            = useRouter();
  const { colors: C }     = useTheme();
  const { user }          = useAuth();
  const { isEmployee, employerContractorId } = useRole();

  const [contractor,   setContractor]   = useState<any>(null);
  const [planLoading,  setPlanLoading]  = useState(true);
  const [selectedDate, setSelectedDate] = useState(startOfDay(new Date()));
  const [weekAnchor,   setWeekAnchor]   = useState(new Date());

  const contractorId = isEmployee && employerContractorId
    ? employerContractorId
    : (user?.id ?? null);

  useEffect(() => {
    if (!contractorId) { setPlanLoading(false); return; }
    supabase.from('contractors').select('id,company_name,plan').eq('id', contractorId).single()
      .then(({ data }) => { setContractor(data); setPlanLoading(false); });
  }, [contractorId]);

  const isPaid = contractor?.plan === 'pro';
  const { events, summary, loading, reload } = useCalendar(isPaid ? contractorId : null);

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editEvent,    setEditEvent]    = useState<CalEvent | null>(null);
  const [form, setForm] = useState({
    title:       '',
    description: '',
    event_type:  'block' as 'block' | 'reminder',
    date:        startOfDay(new Date()),
    startHour:   9,  startMinute: 0,
    endHour:     10, endMinute:   0,
  });
  const [saving, setSaving] = useState(false);

  const today = startOfDay(new Date());
  const week  = buildWeek(weekAnchor);

  const dayEvents = useMemo(() =>
    events.filter(e => isSameDay(new Date(e.start_time), selectedDate)),
  [events, selectedDate]);

  const eventDaySet = useMemo(() => {
    const s = new Set<string>();
    events.forEach(e => {
      const d = new Date(e.start_time);
      s.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
    });
    return s;
  }, [events]);

  function hasEvent(d: Date) {
    return eventDaySet.has(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }

  function openAdd() {
    setEditEvent(null);
    setForm({
      title: '', description: '', event_type: 'block',
      date: new Date(selectedDate),
      startHour: 9, startMinute: 0,
      endHour: 10, endMinute: 0,
    });
    setModalVisible(true);
  }

  function openEdit(ev: CalEvent) {
    if (ev.source === 'booking') {
      if (ev.booking_id) router.push(`/job/${ev.booking_id}` as any);
      return;
    }
    const s = new Date(ev.start_time);
    const e = new Date(ev.end_time);
    setEditEvent(ev);
    setForm({
      title:       ev.title,
      description: ev.description ?? '',
      event_type:  ev.event_type === 'booking' ? 'block' : ev.event_type,
      date:        startOfDay(s),
      startHour:   s.getHours(),   startMinute: s.getMinutes(),
      endHour:     e.getHours(),   endMinute:   e.getMinutes(),
    });
    setModalVisible(true);
  }

  async function saveEvent() {
    if (!form.title.trim() || !contractorId) return;
    setSaving(true);

    const start = new Date(form.date);
    start.setHours(form.startHour, form.startMinute, 0, 0);
    const end = new Date(form.date);
    end.setHours(form.endHour, form.endMinute, 0, 0);
    if (end <= start) end.setDate(end.getDate() + 1);

    const payload = {
      contractor_id: contractorId,
      title:         form.title.trim(),
      description:   form.description.trim() || null,
      event_type:    form.event_type,
      start_time:    start.toISOString(),
      end_time:      end.toISOString(),
    };

    const { error } = editEvent?.rawId
      ? await supabase.from('contractor_schedule').update(payload).eq('id', editEvent.rawId)
      : await supabase.from('contractor_schedule').insert(payload);

    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setModalVisible(false);
    reload();
  }

  async function deleteEvent(ev: CalEvent) {
    if (!ev.rawId) return;
    Alert.alert('Delete Event', 'Remove this from your schedule?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await supabase.from('contractor_schedule').delete().eq('id', ev.rawId!);
        reload();
      }},
    ]);
  }

  // ── Plan loading ──────────────────────────────────────────────────────────
  if (planLoading) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.background }]} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  // ── Plan gate ─────────────────────────────────────────────────────────────
  if (!isPaid) {
    return (
      <SafeAreaView style={[s.root, { backgroundColor: C.background }]} edges={['top']}>
        <View style={s.navRow}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
            <Ionicons name="chevron-back" size={24} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.navTitle, { color: C.textPrimary }]}>Schedule</Text>
          <View style={{ width: 40 }} />
        </View>
        <View style={s.gate}>
          <View style={[s.gateIcon, { backgroundColor: C.orangeDim ?? 'rgba(255,98,0,0.15)' }]}>
            <Ionicons name="lock-closed" size={32} color={C.orange} />
          </View>
          <Text style={[s.gateTitle, { color: C.textPrimary }]}>Pro Plan Required</Text>
          <Text style={[s.gateSub, { color: C.textSecondary }]}>
            Upgrade to Pro to unlock your professional scheduling calendar with real-time job sync.
          </Text>
          <TouchableOpacity
            style={[s.gateBtn, { backgroundColor: C.orange }]}
            onPress={() => router.push('/profile/subscription' as any)}
          >
            <Text style={s.gateBtnTxt}>View Plans</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main calendar ─────────────────────────────────────────────────────────
  const dayHeaderLabel = isSameDay(selectedDate, today)
    ? 'Today'
    : `${DAY_FULL[selectedDate.getDay()]}, ${MONTHS_SH[selectedDate.getMonth()]} ${selectedDate.getDate()}`;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.background }]} edges={['top']}>

      {/* Nav */}
      <View style={s.navRow}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
          <Ionicons name="chevron-back" size={24} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[s.navTitle, { color: C.textPrimary }]}>Schedule</Text>
        <TouchableOpacity onPress={openAdd} style={[s.addBtn, { backgroundColor: C.orange }]}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Month + week nav */}
      <View style={[s.weekNav, { borderBottomColor: C.border }]}>
        <TouchableOpacity
          onPress={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() - 7); setWeekAnchor(d); }}
          hitSlop={12}
        >
          <Ionicons name="chevron-back" size={20} color={C.textSecondary} />
        </TouchableOpacity>
        <Text style={[s.weekNavTitle, { color: C.textPrimary }]}>
          {MONTHS[weekAnchor.getMonth()]} {weekAnchor.getFullYear()}
        </Text>
        <TouchableOpacity
          onPress={() => { const d = new Date(weekAnchor); d.setDate(d.getDate() + 7); setWeekAnchor(d); }}
          hitSlop={12}
        >
          <Ionicons name="chevron-forward" size={20} color={C.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Week strip */}
      <View style={[s.weekStrip, { borderBottomColor: C.border }]}>
        {week.map((d, i) => {
          const isTdy = isSameDay(d, today);
          const isSel = isSameDay(d, selectedDate);
          const hasDot = hasEvent(d);
          return (
            <TouchableOpacity
              key={i}
              style={[s.dayCell, isSel && { backgroundColor: C.orange, borderRadius: 10 }]}
              onPress={() => { setSelectedDate(startOfDay(d)); setWeekAnchor(d); }}
            >
              <Text style={[
                s.dayLetter,
                { color: isSel ? '#fff' : isTdy ? C.orange : C.textMuted },
              ]}>
                {DAY_ABBR[d.getDay()]}
              </Text>
              <Text style={[
                s.dayNum,
                { color: isSel ? '#fff' : isTdy ? C.orange : C.textPrimary },
                (isTdy && !isSel) && { fontWeight: '800' },
              ]}>
                {d.getDate()}
              </Text>
              <View style={[
                s.dayDot,
                { backgroundColor: hasDot ? (isSel ? '#fff' : C.orange) : 'transparent' },
              ]} />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Summary strip */}
      <View style={[s.summary, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={s.summaryItem}>
          <Text style={[s.sumVal, { color: C.textPrimary }]}>{summary.jobs}</Text>
          <Text style={[s.sumLbl, { color: C.textMuted }]}>jobs this week</Text>
        </View>
        <View style={[s.sumDiv, { backgroundColor: C.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.sumVal, { color: '#22C55E' }]}>{fmtMoney(summary.revenue)}</Text>
          <Text style={[s.sumLbl, { color: C.textMuted }]}>revenue</Text>
        </View>
        <View style={[s.sumDiv, { backgroundColor: C.border }]} />
        <View style={s.summaryItem}>
          <Text style={[s.sumVal, { color: C.textPrimary }]}>{summary.blocked}</Text>
          <Text style={[s.sumLbl, { color: C.textMuted }]}>blocked</Text>
        </View>
      </View>

      {/* Day event list */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.dayHeader, { color: C.textPrimary }]}>{dayHeaderLabel}</Text>

        {loading ? (
          <ActivityIndicator color={C.orange} style={{ marginTop: 40 }} />
        ) : dayEvents.length === 0 ? (
          <View style={s.empty}>
            <Ionicons name="calendar-outline" size={48} color={C.border} />
            <Text style={[s.emptyTitle, { color: C.textSecondary }]}>Nothing scheduled</Text>
            <Text style={[s.emptySub, { color: C.textMuted }]}>Tap + to block time or add a reminder</Text>
          </View>
        ) : (
          dayEvents.map(ev => (
            <EventCard
              key={ev.id}
              event={ev}
              C={C}
              onPress={() => openEdit(ev)}
              onLongPress={() => deleteEvent(ev)}
            />
          ))
        )}
      </ScrollView>

      {/* Add / Edit modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1, justifyContent: 'flex-end' }}
        >
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={() => setModalVisible(false)}
          />
          <View style={[s.sheet, { backgroundColor: C.surface }]}>
            <View style={[s.sheetHandle, { backgroundColor: C.border }]} />

            <Text style={[s.sheetTitle, { color: C.textPrimary }]}>
              {editEvent ? 'Edit Event' : 'New Event'}
            </Text>

            {/* Type chips */}
            <View style={s.typeRow}>
              {(['block', 'reminder'] as const).map(t => {
                const active = form.event_type === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setForm(f => ({ ...f, event_type: t }))}
                    style={[
                      s.typeChip,
                      { borderColor: active ? C.orange : C.border },
                      active && { backgroundColor: C.orangeDim ?? 'rgba(255,98,0,0.15)' },
                    ]}
                  >
                    <Ionicons
                      name={t === 'block' ? 'ban-outline' : 'alarm-outline'}
                      size={13}
                      color={active ? C.orange : C.textMuted}
                    />
                    <Text style={[s.typeChipTxt, { color: active ? C.orange : C.textMuted }]}>
                      {t === 'block' ? 'Block Time' : 'Reminder'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Title */}
            <TextInput
              style={[s.input, { backgroundColor: C.background, borderColor: C.border, color: C.textPrimary }]}
              placeholder="Title"
              placeholderTextColor={C.textMuted}
              value={form.title}
              onChangeText={t => setForm(f => ({ ...f, title: t }))}
            />

            {/* Date strip */}
            <Text style={[s.fieldLbl, { color: C.textMuted }]}>DATE</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {Array.from({ length: 14 }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() + i); d.setHours(0, 0, 0, 0);
                const sel = isSameDay(d, form.date);
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => setForm(f => ({ ...f, date: new Date(d) }))}
                    style={[
                      s.datePill,
                      { borderColor: sel ? C.orange : C.border },
                      sel && { backgroundColor: C.orangeDim ?? 'rgba(255,98,0,0.15)' },
                    ]}
                  >
                    <Text style={[s.datePillDay, { color: sel ? C.orange : C.textMuted }]}>
                      {DAY_ABBR[d.getDay()]}
                    </Text>
                    <Text style={[s.datePillNum, { color: sel ? C.orange : C.textPrimary }]}>
                      {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Time pickers */}
            <View style={s.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLbl, { color: C.textMuted }]}>START</Text>
                <TimePicker
                  hour={form.startHour} minute={form.startMinute}
                  onHour={h => setForm(f => ({ ...f, startHour: h }))}
                  onMinute={m => setForm(f => ({ ...f, startMinute: m }))}
                  C={C}
                />
              </View>
              <View style={[s.timeDivider, { backgroundColor: C.border }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLbl, { color: C.textMuted }]}>END</Text>
                <TimePicker
                  hour={form.endHour} minute={form.endMinute}
                  onHour={h => setForm(f => ({ ...f, endHour: h }))}
                  onMinute={m => setForm(f => ({ ...f, endMinute: m }))}
                  C={C}
                />
              </View>
            </View>

            {/* Notes */}
            <TextInput
              style={[s.input, s.inputMulti, { backgroundColor: C.background, borderColor: C.border, color: C.textPrimary }]}
              placeholder="Notes (optional)"
              placeholderTextColor={C.textMuted}
              value={form.description}
              onChangeText={t => setForm(f => ({ ...f, description: t }))}
              multiline
              numberOfLines={2}
            />

            {/* Save */}
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: C.orange }, (!form.title.trim() || saving) && { opacity: 0.5 }]}
              onPress={saveEvent}
              disabled={!form.title.trim() || saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.saveBtnTxt}>{editEvent ? 'Save Changes' : 'Add to Schedule'}</Text>
              }
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:       { flex: 1 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Nav
  navRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  navTitle:   { fontSize: 18, fontWeight: '800' },
  backBtn:    { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  addBtn:     { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },

  // Week nav
  weekNav:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  weekNavTitle: { fontSize: 15, fontWeight: '700' },

  // Week strip
  weekStrip: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  dayCell:   { flex: 1, alignItems: 'center', paddingVertical: 6 },
  dayLetter: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  dayNum:    { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  dayDot:    { width: 5, height: 5, borderRadius: 3 },

  // Summary
  summary:     { flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 12, borderWidth: 1, paddingVertical: 12 },
  summaryItem: { flex: 1, alignItems: 'center' },
  sumVal:      { fontSize: 18, fontWeight: '800' },
  sumLbl:      { fontSize: 11, marginTop: 2 },
  sumDiv:      { width: 1, marginVertical: 4 },

  // List
  listContent: { padding: 16, paddingBottom: 80 },
  dayHeader:   { fontSize: 17, fontWeight: '700', marginBottom: 14 },

  // Empty
  empty:      { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptySub:   { fontSize: 13, textAlign: 'center' },

  // Gate
  gate:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  gateIcon:   { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  gateTitle:  { fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  gateSub:    { fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 28 },
  gateBtn:    { paddingHorizontal: 28, paddingVertical: 13, borderRadius: 10 },
  gateBtnTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Modal / sheet
  sheet:       { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24, paddingTop: 12 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle:  { fontSize: 18, fontWeight: '800', marginBottom: 14 },
  typeRow:     { flexDirection: 'row', gap: 10, marginBottom: 14 },
  typeChip:    { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  typeChipTxt: { fontSize: 13, fontWeight: '600' },
  input:       { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, marginBottom: 12 },
  inputMulti:  { height: 64, textAlignVertical: 'top' },
  fieldLbl:    { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginBottom: 6 },
  datePill:    { alignItems: 'center', paddingHorizontal: 11, paddingVertical: 8, borderRadius: 10, borderWidth: 1, marginRight: 8 },
  datePillDay: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  datePillNum: { fontSize: 15, fontWeight: '700' },
  timeRow:     { flexDirection: 'row', marginBottom: 14, gap: 16, alignItems: 'flex-start' },
  timeDivider: { width: 1, marginTop: 22, height: 48 },
  saveBtn:     { paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  saveBtnTxt:  { color: '#fff', fontSize: 16, fontWeight: '700' },
});
