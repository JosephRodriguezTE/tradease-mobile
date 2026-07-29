// app/profile/portfolio.tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, Modal,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '@/lib/supabase';
import { useTheme, AppColors } from '@/context/ThemeContext';
import { Font, Radius } from '../../constants/theme';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_PAD  = 16;
const GRID_GAP  = 4;
const ITEM_SIZE = (SCREEN_W - GRID_PAD * 2 - GRID_GAP * 2) / 3;

const SP  = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const TY  = { xs:11,sm:13,base:15,md:17,lg:20,xl:24,'2xl':30 } as const;
const STORAGE_URL = 'https://linqsojbszglbgpoxgtv.supabase.co/storage/v1/object/public/portfolio/';

const TRADE_OPTIONS = [
  'HVAC','Electrical','Plumbing','Handyman','Roofing',
  'Cleaning','Mechanical','Painting','Carpentry','Landscaping',
];

const PLAN_LIMITS: Record<string, number> = { free: 5, leads: 10, pro: 15 };

interface PortfolioItem {
  id: string;
  storage_path: string;
  caption: string | null;
  trade: string | null;
  sort_order: number;
}

// ─── Upgrade Wall ─────────────────────────────────────────────────────────────

function UpgradeWall({ C }: { C: AppColors }) {
  const router = useRouter();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP[8] }}>
      <View style={{ width: 80, height: 80, borderRadius: 40, backgroundColor: 'rgba(255,98,0,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: SP[5] }}>
        <Ionicons name="lock-closed" size={34} color={C.orange} />
      </View>
      <Text style={{ fontSize: TY.xl, fontWeight: Font.black, color: C.textPrimary, textAlign: 'center', marginBottom: SP[3] }}>
        Unlock Portfolio
      </Text>
      <Text style={{ fontSize: TY.base, color: C.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: SP[8] }}>
        Showcase your work with a photo portfolio. Available on the Leads and Pro plans.
      </Text>
      <TouchableOpacity
        style={{ backgroundColor: C.orange, borderRadius: Radius.lg, paddingVertical: SP[4], paddingHorizontal: SP[8], flexDirection: 'row', alignItems: 'center', gap: SP[2] }}
        onPress={() => router.push('/profile/subscription')}
      >
        <Ionicons name="flash" size={18} color="#fff" />
        <Text style={{ fontSize: TY.md, fontWeight: Font.black, color: '#fff' }}>Upgrade — Just Leads $5/mo</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Trade Picker ─────────────────────────────────────────────────────────────

function TradePicker({ value, onChange, C }: { value: string | null; onChange: (t: string) => void; C: AppColors }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity
        style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: SP[4], paddingVertical: SP[3], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
        onPress={() => setOpen(!open)}
      >
        <Text style={{ fontSize: TY.sm, color: value ? C.textPrimary : C.textMuted }}>{value || 'Tag a trade (optional)'}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={C.textMuted} />
      </TouchableOpacity>
      {open && (
        <View style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, marginTop: SP[1] }}>
          {TRADE_OPTIONS.map((t, i) => (
            <TouchableOpacity
              key={t}
              style={{ paddingHorizontal: SP[4], paddingVertical: SP[3], borderTopWidth: i > 0 ? 0.5 : 0, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between' }}
              onPress={() => { onChange(t); setOpen(false); }}
            >
              <Text style={{ fontSize: TY.sm, color: value === t ? C.orange : C.textPrimary, fontWeight: value === t ? Font.bold : Font.regular }}>{t}</Text>
              {value === t && <Ionicons name="checkmark" size={14} color={C.orange} />}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PortfolioScreen() {
  const router    = useRouter();
  const { colors: C } = useTheme();

  const [plan,        setPlan]        = useState<string>('free');
  const [contractorId,setContractorId]= useState('');
  const [photos,      setPhotos]      = useState<PortfolioItem[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [uploading,   setUploading]   = useState(false);

  // Reorder state — selected item index for long-press swap
  const [pickedId, setPickedId] = useState<string | null>(null);

  // Viewer modal
  const [viewerItem,  setViewerItem]  = useState<PortfolioItem | null>(null);
  const [editCaption, setEditCaption] = useState('');
  const [editTrade,   setEditTrade]   = useState<string | null>(null);
  const [savingEdit,  setSavingEdit]  = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setContractorId(user.id);

      const [{ data: contractor }, { data: portfolio }] = await Promise.all([
        supabase.from('contractors').select('plan').eq('id', user.id).single(),
        supabase.from('contractor_portfolio').select('*').eq('contractor_id', user.id).order('sort_order'),
      ]);

      setPlan(contractor?.plan ?? 'free');
      setPhotos((portfolio as PortfolioItem[]) ?? []);
    } finally {
      setLoading(false);
    }
  }

  const limit = PLAN_LIMITS[plan] ?? 5;

  // ── Add photo ─────────────────────────────────────────────────────────────────

  const addPhoto = useCallback(async () => {
    if (photos.length >= limit) {
      const nextPlan = plan === 'free' ? 'Just Leads ($5/mo)' : plan === 'leads' ? 'Pro ($19/mo)' : null;
      const upgradeMsg = nextPlan ? ` Upgrade to ${nextPlan} for more.` : '';
      Alert.alert('Limit Reached', `Your ${plan === 'free' ? 'free' : plan} plan supports up to ${limit} photos.${upgradeMsg}`);
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to upload portfolio images.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [1, 1],
      base64: true,
    });
    if (result.canceled || !result.assets[0]?.base64) return;

    const asset = result.assets[0];
    setUploading(true);
    try {
      const uid  = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const ext  = (asset.mimeType ?? 'image/jpeg').split('/')[1] || 'jpg';
      const path = `${contractorId}/${uid}.${ext}`;

      // base64 → ArrayBuffer without external package
      const binary = atob(asset.base64!);
      const bytes  = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      const { error: upErr } = await supabase.storage
        .from('portfolio')
        .upload(path, bytes.buffer, { contentType: asset.mimeType ?? 'image/jpeg', upsert: false });
      if (upErr) throw upErr;

      const { data: row, error: insErr } = await supabase
        .from('contractor_portfolio')
        .insert({ contractor_id: contractorId, storage_path: path, sort_order: photos.length })
        .select()
        .single();
      if (insErr) throw insErr;

      setPhotos(prev => [...prev, row as PortfolioItem]);
    } catch (e: any) {
      Alert.alert('Upload failed', e.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  }, [photos, limit, plan, contractorId]);

  // ── Delete photo ──────────────────────────────────────────────────────────────

  const deletePhoto = useCallback(async (item: PortfolioItem) => {
    setDeletingId(item.id);
    try {
      await supabase.storage.from('portfolio').remove([item.storage_path]);
      await supabase.from('contractor_portfolio').delete().eq('id', item.id);
      setPhotos(prev => prev.filter(p => p.id !== item.id));
      setViewerItem(null);
    } catch (e: any) {
      Alert.alert('Delete failed', e.message ?? 'Please try again.');
    } finally {
      setDeletingId(null);
    }
  }, []);

  const confirmDelete = (item: PortfolioItem) => {
    Alert.alert('Delete Photo', 'Remove this photo from your portfolio?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deletePhoto(item) },
    ]);
  };

  // ── Save edits (caption + trade) ──────────────────────────────────────────────

  const saveEdits = async () => {
    if (!viewerItem) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from('contractor_portfolio')
        .update({ caption: editCaption || null, trade: editTrade })
        .eq('id', viewerItem.id);
      if (error) throw error;
      setPhotos(prev => prev.map(p => p.id === viewerItem.id ? { ...p, caption: editCaption || null, trade: editTrade } : p));
      setViewerItem(null);
    } catch (e: any) {
      Alert.alert('Save failed', e.message ?? 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  // ── Reorder (long-press swap) ─────────────────────────────────────────────────

  const handleLongPress = (item: PortfolioItem) => {
    setPickedId(prev => prev === item.id ? null : item.id);
  };

  const handleTapForSwap = async (tappedItem: PortfolioItem) => {
    if (!pickedId || pickedId === tappedItem.id) {
      setPickedId(null);
      return;
    }
    const pickedIdx  = photos.findIndex(p => p.id === pickedId);
    const tappedIdx  = photos.findIndex(p => p.id === tappedItem.id);
    if (pickedIdx === -1 || tappedIdx === -1) return;

    const newPhotos = [...photos];
    [newPhotos[pickedIdx], newPhotos[tappedIdx]] = [newPhotos[tappedIdx], newPhotos[pickedIdx]];
    const withOrder = newPhotos.map((p, i) => ({ ...p, sort_order: i }));
    setPhotos(withOrder);
    setPickedId(null);

    // Persist new order
    await Promise.all(
      withOrder.map(p => supabase.from('contractor_portfolio').update({ sort_order: p.sort_order }).eq('id', p.id))
    );
  };

  const openViewer = (item: PortfolioItem) => {
    if (pickedId) { handleTapForSwap(item); return; }
    setEditCaption(item.caption ?? '');
    setEditTrade(item.trade ?? null);
    setViewerItem(item);
  };

  // ── Grid rendering ────────────────────────────────────────────────────────────

  type GridItem = PortfolioItem | { id: '__add__' };

  const gridData: GridItem[] = photos.length < limit
    ? [...photos, { id: '__add__' }]
    : photos;

  const renderItem = ({ item }: { item: GridItem }) => {
    if (item.id === '__add__') {
      return (
        <TouchableOpacity
          style={[st.gridItem, { borderStyle: 'dashed', borderWidth: 1.5, borderColor: C.border, backgroundColor: C.surfaceAlt, alignItems: 'center', justifyContent: 'center' }]}
          onPress={addPhoto}
          disabled={uploading}
        >
          {uploading
            ? <ActivityIndicator color={C.orange} size="small" />
            : <>
                <Ionicons name="add" size={28} color={C.textMuted} />
                <Text style={{ fontSize: TY.xs, color: C.textMuted, marginTop: SP[1] }}>Add Photo</Text>
              </>
          }
        </TouchableOpacity>
      );
    }

    const photo = item as PortfolioItem;
    const isPicked = pickedId === photo.id;
    const isOther  = !!pickedId && !isPicked;

    return (
      <TouchableOpacity
        style={[
          st.gridItem,
          isPicked && { borderWidth: 2, borderColor: C.orange, opacity: 0.75 },
          isOther  && { borderWidth: 2, borderColor: C.border },
        ]}
        onPress={() => openViewer(photo)}
        onLongPress={() => handleLongPress(photo)}
        delayLongPress={400}
        activeOpacity={0.85}
      >
        <Image
          source={{ uri: STORAGE_URL + photo.storage_path }}
          style={{ width: '100%', height: '100%', borderRadius: Radius.sm }}
          resizeMode="cover"
        />
        {isPicked && (
          <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', borderRadius: Radius.sm, backgroundColor: 'rgba(255,98,0,0.15)' }}>
            <Ionicons name="move-outline" size={24} color={C.orange} />
          </View>
        )}
        {photo.trade && (
          <View style={{ position: 'absolute', bottom: 4, left: 4, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 }}>
            <Text style={{ fontSize: 9, color: '#fff', fontWeight: Font.bold }}>{photo.trade}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: C.background }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[st.container, { backgroundColor: C.background }]} edges={['top']}>

      {/* Header */}
      <View style={[st.header, { borderBottomColor: C.border }]}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={st.backBtn}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={[st.title, { color: C.textPrimary }]}>My Portfolio</Text>
        <View style={{ width: 36 }} />
      </View>

      <>
        {/* Counter + reorder hint */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: GRID_PAD, paddingVertical: SP[3] }}>
          <Text style={{ fontSize: TY.xs, color: C.textMuted, fontWeight: Font.semibold }}>
            {photos.length} / {limit} photos
          </Text>
          {pickedId
            ? <View style={{ backgroundColor: 'rgba(255,98,0,0.12)', borderRadius: Radius.full, borderWidth: 0.5, borderColor: C.orange, paddingHorizontal: SP[3], paddingVertical: SP[1] }}>
                <Text style={{ fontSize: TY.xs, color: C.orange, fontWeight: Font.bold }}>Tap another photo to swap</Text>
              </View>
            : <Text style={{ fontSize: TY.xs, color: C.textMuted }}>Long-press to reorder</Text>
          }
        </View>

        {photos.length === 0 && !uploading ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP[8] }}>
            <Ionicons name="images-outline" size={48} color={C.textMuted} />
            <Text style={{ fontSize: TY.base, fontWeight: Font.bold, color: C.textPrimary, marginTop: SP[4], marginBottom: SP[2], textAlign: 'center' }}>
              No photos yet
            </Text>
            <Text style={{ fontSize: TY.sm, color: C.textSecondary, textAlign: 'center', marginBottom: SP[6] }}>
              Add photos of your completed work to attract more customers.
            </Text>
            <TouchableOpacity
              style={{ backgroundColor: C.orange, borderRadius: Radius.lg, paddingVertical: SP[3], paddingHorizontal: SP[6], flexDirection: 'row', alignItems: 'center', gap: SP[2] }}
              onPress={addPhoto}
            >
              <Ionicons name="add" size={18} color="#fff" />
              <Text style={{ fontSize: TY.sm, fontWeight: Font.black, color: '#fff' }}>Add First Photo</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={gridData}
            keyExtractor={item => item.id}
            numColumns={3}
            renderItem={renderItem}
            contentContainerStyle={{ paddingHorizontal: GRID_PAD, gap: GRID_GAP }}
            columnWrapperStyle={{ gap: GRID_GAP }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </>

      {/* Full-screen upload overlay */}
      {uploading && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 99 }}>
          <View style={{ backgroundColor: C.surface, borderRadius: Radius.lg, padding: SP[6], alignItems: 'center', gap: SP[3], borderWidth: 0.5, borderColor: C.border }}>
            <ActivityIndicator color={C.orange} size="large" />
            <Text style={{ fontSize: TY.sm, color: C.textSecondary, fontWeight: Font.semibold }}>Uploading photo…</Text>
          </View>
        </View>
      )}

      {/* Photo viewer + edit modal */}
      <Modal visible={!!viewerItem} animationType="slide" presentationStyle="fullScreen">
        {viewerItem && (
          <SafeAreaView style={{ flex: 1, backgroundColor: C.background }} edges={['top', 'bottom']}>
            {/* Top bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5, borderBottomColor: C.border }}>
              <TouchableOpacity onPress={() => setViewerItem(null)} style={{ padding: SP[2] }}>
                <Ionicons name="close" size={24} color={C.textPrimary} />
              </TouchableOpacity>
              <Text style={{ fontSize: TY.base, fontWeight: Font.bold, color: C.textPrimary }}>Edit Photo</Text>
              <TouchableOpacity
                onPress={() => confirmDelete(viewerItem)}
                style={{ padding: SP[2] }}
                disabled={!!deletingId}
              >
                {deletingId === viewerItem.id
                  ? <ActivityIndicator color={C.error} size="small" />
                  : <Ionicons name="trash-outline" size={20} color={C.error} />
                }
              </TouchableOpacity>
            </View>

            {/* Image */}
            <View style={{ aspectRatio: 1, width: '100%' }}>
              <Image
                source={{ uri: STORAGE_URL + viewerItem.storage_path }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            </View>

            {/* Edit fields */}
            <View style={{ flex: 1, paddingHorizontal: SP[5], paddingTop: SP[5], gap: SP[4] }}>
              <View>
                <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>CAPTION</Text>
                <TextInput
                  style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: SP[4], paddingVertical: SP[3], fontSize: TY.base, color: C.textPrimary }}
                  placeholder="Describe this job..."
                  placeholderTextColor={C.textMuted}
                  value={editCaption}
                  onChangeText={setEditCaption}
                  maxLength={120}
                />
              </View>
              <View>
                <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>TRADE</Text>
                <TradePicker value={editTrade} onChange={setEditTrade} C={C} />
              </View>

              <TouchableOpacity
                style={{ backgroundColor: C.orange, borderRadius: Radius.lg, paddingVertical: SP[4], alignItems: 'center', marginTop: SP[2] }}
                onPress={saveEdits}
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
  container: { flex: 1 },
  header:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SP[4], paddingVertical: SP[3], borderBottomWidth: 0.5 },
  backBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  title:     { fontSize: TY.md, fontWeight: Font.black },
  gridItem:  { width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: Radius.sm, overflow: 'hidden' },
});
