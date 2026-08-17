// app/profile/completed-work.tsx
// Manage the "Completed Work" entries shown on the public contractor profile.
// Rows come only from completed, paid work orders — there's no manual "add" here.
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Modal,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useTheme, AppColors } from '@/context/ThemeContext';
import { Colors, Font, Radius } from '../../constants/theme';

const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24,'2xl':30 } as const;
const THUMB = 52;
const COMPLETED_STORAGE_URL = 'https://linqsojbszglbgpoxgtv.supabase.co/storage/v1/object/public/portfolio-completed/';

interface CompletedJob {
  id: string;
  title: string | null;
  description: string | null;
  service_type: string | null;
  general_location: string | null;
  completed_price: number | null;
  completed_at: string | null;
  photos: string[];
  is_published: boolean;
}

export default function CompletedWorkScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();

  const [jobs,        setJobs]        = useState<CompletedJob[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [togglingId,  setTogglingId]  = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  const [editItem,        setEditItem]        = useState<CompletedJob | null>(null);
  const [editTitle,       setEditTitle]       = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [savingEdit,      setSavingEdit]      = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('portfolio_jobs')
        .select('id, title, description, service_type, general_location, completed_price, completed_at, photos, is_published')
        .eq('contractor_id', user.id)
        .order('completed_at', { ascending: false });
      setJobs((data as CompletedJob[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  // ── Publish / Unpublish ─────────────────────────────────────────────────────

  async function togglePublish(job: CompletedJob) {
    setTogglingId(job.id);
    try {
      const { error } = await supabase
        .from('portfolio_jobs')
        .update({ is_published: !job.is_published })
        .eq('id', job.id);
      if (error) throw error;
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, is_published: !j.is_published } : j));
    } catch (e: any) {
      Alert.alert("Couldn't update", e.message ?? 'Please try again.');
    } finally {
      setTogglingId(null);
    }
  }

  // ── Edit (title + description only) ─────────────────────────────────────────

  function openEdit(job: CompletedJob) {
    setEditTitle(job.title ?? '');
    setEditDescription(job.description ?? '');
    setEditItem(job);
  }

  async function saveEdit() {
    if (!editItem) return;
    setSavingEdit(true);
    try {
      const title = editTitle.trim() || null;
      const description = editDescription.trim() || null;
      const { error } = await supabase
        .from('portfolio_jobs')
        .update({ title, description })
        .eq('id', editItem.id);
      if (error) throw error;
      setJobs(prev => prev.map(j => j.id === editItem.id ? { ...j, title, description } : j));
      setEditItem(null);
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  }

  // ── Delete (portfolio_jobs row + its copied photos only) ────────────────────

  function confirmDelete(job: CompletedJob) {
    Alert.alert(
      'Delete from portfolio?',
      'This removes it from your public profile for good. The original job and payment record are not affected.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteJob(job) },
      ]
    );
  }

  async function deleteJob(job: CompletedJob) {
    setDeletingId(job.id);
    try {
      const paths = (job.photos ?? [])
        .filter(url => url.startsWith(COMPLETED_STORAGE_URL))
        .map(url => url.slice(COMPLETED_STORAGE_URL.length));
      if (paths.length > 0) {
        await supabase.storage.from('portfolio-completed').remove(paths);
      }
      const { error } = await supabase.from('portfolio_jobs').delete().eq('id', job.id);
      if (error) throw error;
      setJobs(prev => prev.filter(j => j.id !== job.id));
    } catch (e: any) {
      Alert.alert('Delete failed', e.message ?? 'Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  // ── Row ───────────────────────────────────────────────────────────────────

  function renderItem({ item: job }: { item: CompletedJob }) {
    const busy = togglingId === job.id || deletingId === job.id;
    return (
      <View style={[st.card, { backgroundColor: C.surface, borderColor: C.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: SP[2], marginBottom: 4 }}>
          <Text style={{ fontSize: TY.base, fontWeight: Font.bold, color: C.textPrimary, flex: 1 }} numberOfLines={1}>
            {job.title || job.service_type || 'Completed job'}
          </Text>
          {job.completed_price != null && (
            <Text style={{ fontSize: TY.base, fontWeight: Font.black, color: Colors.success }}>
              ${Number(job.completed_price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Text>
          )}
        </View>

        <Text style={{ fontSize: TY.xs, color: C.textMuted, marginBottom: SP[3] }}>
          {[
            job.service_type,
            job.general_location,
            job.completed_at ? new Date(job.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : null,
          ].filter(Boolean).join(' · ')}
        </Text>

        {job.photos?.length > 0 && (
          <View style={{ flexDirection: 'row', gap: SP[2], marginBottom: SP[3] }}>
            {job.photos.slice(0, 4).map((url, i) => (
              <Image key={i} source={{ uri: url }} style={{ width: THUMB, height: THUMB, borderRadius: Radius.sm }} resizeMode="cover" />
            ))}
            {job.photos.length > 4 && (
              <View style={{ width: THUMB, height: THUMB, borderRadius: Radius.sm, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: TY.xs, color: C.textMuted, fontWeight: Font.bold }}>+{job.photos.length - 4}</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP[2] }}>
          <TouchableOpacity
            style={[
              st.statusPill,
              job.is_published
                ? { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: 'rgba(34,197,94,0.3)' }
                : { backgroundColor: C.surfaceAlt, borderColor: C.border },
            ]}
            onPress={() => togglePublish(job)}
            disabled={busy}
          >
            {togglingId === job.id
              ? <ActivityIndicator size="small" color={job.is_published ? Colors.success : C.textMuted} />
              : <>
                  <Ionicons
                    name={job.is_published ? 'checkmark-circle' : 'eye-off-outline'}
                    size={14}
                    color={job.is_published ? Colors.success : C.textMuted}
                  />
                  <Text style={{ fontSize: TY.xs, fontWeight: Font.bold, color: job.is_published ? Colors.success : C.textMuted }}>
                    {job.is_published ? 'Published' : 'Unpublished'}
                  </Text>
                </>
            }
          </TouchableOpacity>

          <View style={{ flex: 1 }} />

          <TouchableOpacity style={st.iconBtn} onPress={() => openEdit(job)} disabled={busy}>
            <Ionicons name="pencil-outline" size={18} color={C.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={st.iconBtn} onPress={() => confirmDelete(job)} disabled={busy}>
            {deletingId === job.id
              ? <ActivityIndicator size="small" color={C.error} />
              : <Ionicons name="trash-outline" size={18} color={C.error} />
            }
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={[st.container, { backgroundColor: C.background }]} edges={['top']}>

      <View style={[st.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: C.textPrimary }]}>Completed Work</Text>
        <View style={{ width: 36 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      ) : jobs.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP[8] }}>
          <Ionicons name="trophy-outline" size={48} color={C.textMuted} />
          <Text style={{ fontSize: TY.base, fontWeight: Font.bold, color: C.textPrimary, marginTop: SP[4], marginBottom: SP[2], textAlign: 'center' }}>
            Nothing here yet
          </Text>
          <Text style={{ fontSize: TY.sm, color: C.textSecondary, textAlign: 'center', lineHeight: 20 }}>
            When you finish a paid job, you'll get the option to add it here. Nothing is added automatically.
          </Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: SP[4], gap: SP[3] }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Edit modal — title + description only */}
      <Modal visible={!!editItem} animationType="slide" presentationStyle="pageSheet">
        {editItem && (
          <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['top', 'bottom']}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5, borderBottomColor: C.border }}>
              <TouchableOpacity onPress={() => setEditItem(null)} style={{ padding: SP[2] }}>
                <Ionicons name="close" size={24} color={C.textPrimary} />
              </TouchableOpacity>
              <Text style={{ fontSize: TY.base, fontWeight: Font.bold, color: C.textPrimary }}>Edit Details</Text>
              <View style={{ width: 40 }} />
            </View>

            <View style={{ flex: 1, paddingHorizontal: SP[5], paddingTop: SP[5], gap: SP[4] }}>
              <View>
                <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>TITLE</Text>
                <TextInput
                  style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: SP[4], paddingVertical: SP[3], fontSize: TY.base, color: C.textPrimary }}
                  placeholder={editItem.service_type ?? 'Job title'}
                  placeholderTextColor={C.textMuted}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  maxLength={80}
                />
              </View>
              <View>
                <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>DESCRIPTION</Text>
                <TextInput
                  style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: SP[4], paddingVertical: SP[3], fontSize: TY.base, color: C.textPrimary, minHeight: 96, textAlignVertical: 'top' }}
                  placeholder="Describe the job..."
                  placeholderTextColor={C.textMuted}
                  value={editDescription}
                  onChangeText={setEditDescription}
                  multiline
                  maxLength={400}
                />
              </View>

              <TouchableOpacity
                style={{ backgroundColor: C.orange, borderRadius: Radius.lg, paddingVertical: SP[4], alignItems: 'center', marginTop: SP[2] }}
                onPress={saveEdit}
                disabled={savingEdit}
              >
                {savingEdit
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={{ fontSize: TY.base, fontWeight: Font.black, color: '#fff' }}>Save Changes</Text>
                }
              </TouchableOpacity>
            </View>
          </SafeAreaView>
        )}
      </Modal>

    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container:  { flex: 1 },
  header:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5 },
  backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:      { fontSize: TY.md, fontWeight: Font.black },
  card:       { borderRadius: Radius.lg, borderWidth: 0.5, padding: SP[4] },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: Radius.full, borderWidth: 0.5, paddingHorizontal: SP[3], paddingVertical: 6 },
  iconBtn:    { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
});
