// app/profile/company-profile.tsx
// Contractor edits their public company profile.
// Photo limits: Free = 5, Leads = 10, Pro = 15.

import { useTheme } from '@/context/ThemeContext';
import { POPULAR_SEARCHES, TRADE_SPECIALTIES } from '@/lib/tradeJobs';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform,
    ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// ─── Tokens ───────────────────────────────────────────────────────────────────
const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { sm:8,md:12,lg:16,xl:20,full:999 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24 } as const;
const FW = { regular:'400' as const, medium:'500' as const, semibold:'600' as const, bold:'700' as const, black:'800' as const };


const TRADE_TYPE_LIST = [
  'Plumbing','Electrical','HVAC','Carpentry','Roofing','Painting',
  'Landscaping','General Contracting','Masonry','Flooring','Drywall','Handyman',
];

const PHOTO_LIMITS: Record<string, number> = { free: 5, leads: 10, pro: 15 };

type Photo = { uri: string; caption: string; uploaded?: boolean; url?: string };

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ label, C }: { label: string; C: any }) {
  return (
    <Text style={{ fontSize:TY.xs, fontWeight:FW.black, color:C.textSecondary,
      letterSpacing:0.9, marginBottom:SP[2], marginTop:SP[5] }}>
      {label}
    </Text>
  );
}

// ─── Field ────────────────────────────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, C, multiline = false, maxLength }: any) {
  return (
    <View style={{ marginBottom:SP[3] }}>
      <Text style={{ fontSize:TY.xs, fontWeight:FW.black, color:C.textSecondary, letterSpacing:0.7, marginBottom:SP[1] }}>
        {label}
      </Text>
      <TextInput
        style={[{ backgroundColor:C.surfaceAlt, borderRadius:R.md, borderWidth:0.5,
          borderColor:C.border, paddingHorizontal:SP[4], paddingVertical:SP[3],
          fontSize:TY.base, color:C.textPrimary, fontWeight:FW.medium },
          multiline && { minHeight:100, textAlignVertical:'top' }
        ]}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        maxLength={maxLength}
        autoCapitalize="sentences"
      />
      {maxLength && (
        <Text style={{ fontSize:TY.xs, color:C.textMuted, textAlign:'right', marginTop:2 }}>
          {(value ?? '').length}/{maxLength}
        </Text>
      )}
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function CompanyProfileScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();

  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [profile,  setProfile]  = useState<any>(null);

  // Fields
  const [companyName,      setCompanyName]      = useState('');
  const [tagline,          setTagline]          = useState('');
  const [description,      setDescription]      = useState('');
  const [yearsInBusiness,  setYearsInBusiness]  = useState('');
  const [serviceArea,      setServiceArea]      = useState('');
  const [website,          setWebsite]          = useState('');
  const [languages,        setLanguages]        = useState('English');
  const [specializations,  setSpecializations]  = useState<string[]>([]);
  const [selectedTrades,   setSelectedTrades]   = useState<string[]>([]);
  const [showAllSpecs,     setShowAllSpecs]     = useState(false);
  const [customSpecInput,  setCustomSpecInput]  = useState('');
  const [photos,           setPhotos]           = useState<Photo[]>([]);
  const [bannerUri,        setBannerUri]        = useState('');
  const [avatarUri,        setAvatarUri]        = useState('');

  const photoLimit = PHOTO_LIMITS[profile?.plan ?? 'free'] ?? 5;

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('contractors')
        .select('*')
        .eq('id', user.id)
        .single();
      if (data) {
        setProfile(data);
        setCompanyName(data.company_name ?? '');
        setTagline(data.tagline ?? '');
        setDescription(data.description ?? '');
        setYearsInBusiness(data.years_in_business?.toString() ?? '');
        setServiceArea(data.service_area ?? data.service_areas ?? '');
        setWebsite(data.website ?? '');
        setLanguages(data.languages ?? 'English');
        setSpecializations(data.specializations ?? []);
        setSelectedTrades(
          data.trade_type
            ? data.trade_type.split(',').map((t: string) => t.trim()).filter(Boolean)
            : []
        );
        setPhotos((data.portfolio_photos ?? []) as Photo[]);
        setBannerUri(data.banner_url ?? '');
        setAvatarUri(data.avatar_url ?? '');
      }
      setLoading(false);
    }
    load();
  }, []);

  // ── Photo upload ──────────────────────────────────────────────────────────
  async function uploadToStorage(uri: string, bucket: string, path: string): Promise<string | null> {
    try {
      const res  = await fetch(uri);
      const blob = await res.blob();
      const ext  = uri.split('.').pop() ?? 'jpg';
      const { error } = await supabase.storage.from(bucket).upload(path, blob, { contentType:`image/${ext}`, upsert:true });
      if (error) throw error;
      return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    } catch { return null; }
  }

  async function pickBanner() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes:ImagePicker.MediaTypeOptions.Images, allowsEditing:true, aspect:[3,1], quality:0.8 });
    if (!r.canceled) setBannerUri(r.assets[0].uri);
  }

  async function pickAvatar() {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes:ImagePicker.MediaTypeOptions.Images, allowsEditing:true, aspect:[1,1], quality:0.9 });
    if (!r.canceled) setAvatarUri(r.assets[0].uri);
  }

  async function addPhoto() {
    if (photos.length >= photoLimit) {
      const planLabel = (profile?.plan ?? 'free').charAt(0).toUpperCase() + (profile?.plan ?? 'free').slice(1);
      Alert.alert('Photo limit reached', `${planLabel} accounts allow up to ${photoLimit} portfolio photos.`);
      return;
    }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes:ImagePicker.MediaTypeOptions.Images, allowsEditing:true, aspect:[1,1], quality:0.8 });
    if (!r.canceled) {
      setPhotos(prev => [...prev, { uri:r.assets[0].uri, caption:'' }]);
    }
  }

  function removePhoto(index: number) {
    Alert.alert('Remove photo?', '', [
      { text:'Cancel', style:'cancel' },
      { text:'Remove', style:'destructive', onPress:() => setPhotos(prev => prev.filter((_,i) => i !== index)) },
    ]);
  }

  function updateCaption(index: number, caption: string) {
    setPhotos(prev => prev.map((p, i) => i === index ? { ...p, caption } : p));
  }

  function toggleTrade(trade: string) {
    setSelectedTrades(prev =>
      prev.includes(trade) ? prev.filter(t => t !== trade) : [...prev, trade]
    );
  }

  function toggleSpec(spec: string) {
    setSpecializations(prev =>
      prev.includes(spec) ? prev.filter(s => s !== spec) : [...prev, spec]
    );
  }

  function addCustomSpec() {
    const val = customSpecInput.trim();
    if (!val) return;
    if (!specializations.includes(val)) setSpecializations(prev => [...prev, val]);
    setCustomSpecInput('');
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!companyName.trim()) { Alert.alert('Required', 'Company name is required.'); return; }
    if (!description.trim()) { Alert.alert('Required', 'About section is required.'); return; }
    if (specializations.length === 0) { Alert.alert('Required', 'Select at least one specialization.'); return; }

    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSaving(false); return; }

    // Upload banner & avatar if new local URIs
    let finalBanner = bannerUri;
    let finalAvatar = avatarUri;
    if (bannerUri && bannerUri.startsWith('file')) {
      finalBanner = await uploadToStorage(bannerUri, 'contractor-media', `banners/${user.id}_banner.jpg`) ?? bannerUri;
    }
    if (avatarUri && avatarUri.startsWith('file')) {
      finalAvatar = await uploadToStorage(avatarUri, 'contractor-media', `avatars/${user.id}_avatar.jpg`) ?? avatarUri;
    }

    // Upload new portfolio photos
    const finalPhotos = await Promise.all(photos.map(async (p, i) => {
      if (p.uri.startsWith('file') && !p.uploaded) {
        const url = await uploadToStorage(p.uri, 'contractor-media', `portfolio/${user.id}_photo_${i}_${Date.now()}.jpg`);
        return { ...p, uri: url ?? p.uri, url: url ?? '', uploaded: true };
      }
      return p;
    }));

    const isComplete = !!(companyName && description && serviceArea && specializations.length > 0 && finalPhotos.length > 0);

    const { error } = await supabase.from('contractors').update({
      company_name:      companyName.trim(),
      tagline:           tagline.trim(),
      description:       description.trim(),
      years_in_business: parseInt(yearsInBusiness) || null,
      service_area:      serviceArea.trim(),
      service_areas:     serviceArea.trim(),
      website:           website.trim(),
      languages:         languages.trim(),
      specializations,
      trade_type:        selectedTrades.join(', '),
      portfolio_photos:  finalPhotos,
      banner_url:        finalBanner,
      avatar_url:        finalAvatar,
      profile_complete:  isComplete,
      profile_published: isComplete,
    }).eq('id', user.id);

    setSaving(false);
    if (error) { Alert.alert('Error', 'Could not save profile. Try again.'); return; }
    Alert.alert('Saved!', 'Your company profile has been updated.', [
      { text:'OK', onPress:() => router.canGoBack() ? router.back() : router.replace('/(tabs)') },
    ]);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor:C.background }]} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  const initials = companyName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2) || '?';

  // Derived specialty lists
  const activeTradeKeys = selectedTrades.filter(t => TRADE_SPECIALTIES[t]);
  const specTradeKeys   = activeTradeKeys.length > 0 ? activeTradeKeys : Object.keys(TRADE_SPECIALTIES);
  const popularForTrades = specTradeKeys.flatMap(t => POPULAR_SEARCHES[t] ?? []).filter((v, i, a) => a.indexOf(v) === i);
  const allForTrades     = specTradeKeys.flatMap(t => TRADE_SPECIALTIES[t] ?? []).filter((v, i, a) => a.indexOf(v) === i);
  const quickPickSpecs   = popularForTrades.slice(0, 12);
  const remainingSpecs   = allForTrades.filter(s => !quickPickSpecs.includes(s));

  return (
    <SafeAreaView style={[s.container, { backgroundColor:C.background }]} edges={['top']}>
      <KeyboardAvoidingView style={{ flex:1 }} behavior={Platform.OS==='ios'?'padding':undefined}>

        {/* Header */}
        <View style={[s.header, { borderBottomColor:C.border }]}>
          <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <Text style={[s.headerTitle, { color:C.textPrimary }]}>Company Profile</Text>
          <TouchableOpacity onPress={() => router.push(`/company/${profile?.id}` as any)} style={s.previewBtn}>
            <Ionicons name="eye-outline" size={17} color={C.orange} />
            <Text style={{ fontSize:TY.sm, fontWeight:FW.bold, color:C.orange }}>Preview</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal:SP[4], paddingBottom:SP[10] }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Plan badge */}
          <View style={[s.planBanner, { backgroundColor:C.surface, borderColor:C.border }]}>
            <Ionicons name="camera-outline" size={16} color={C.orange} />
            <Text style={{ flex:1, fontSize:TY.sm, color:C.textSecondary }}>
              <Text style={{ color:C.orange, fontWeight:FW.bold }}>
                {((profile?.plan ?? 'free').charAt(0).toUpperCase() + (profile?.plan ?? 'free').slice(1))}
              </Text>
              {' '}account — up to <Text style={{ color:C.orange, fontWeight:FW.bold }}>{photoLimit} portfolio photos</Text>
            </Text>
            {(profile?.plan === 'free' || !profile?.plan) && (
              <TouchableOpacity style={[s.upgradePill, { borderColor:C.orange }]}>
                <Text style={{ fontSize:TY.xs, fontWeight:FW.black, color:C.orange }}>Upgrade</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Banner + Avatar */}
          <SectionHeader label="BRANDING" C={C} />
          <TouchableOpacity onPress={pickBanner} style={[s.bannerUpload, { backgroundColor:C.surface, borderColor:C.border }]}>
            {bannerUri
              ? <Image source={{ uri:bannerUri }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
              : <View style={s.bannerEmpty}>
                  <Ionicons name="image-outline" size={28} color={C.textMuted} />
                  <Text style={{ fontSize:TY.sm, color:C.textMuted, marginTop:SP[2] }}>Tap to add cover photo</Text>
                  <Text style={{ fontSize:TY.xs, color:C.textMuted }}>Recommended: 1200 × 400px</Text>
                </View>
            }
            <View style={[s.bannerEditBtn, { backgroundColor:'rgba(0,0,0,0.55)' }]}>
              <Ionicons name="camera-outline" size={14} color="#fff" />
              <Text style={{ fontSize:TY.xs, color:'#fff', fontWeight:FW.bold }}>
                {bannerUri ? 'Change' : 'Add banner'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Avatar */}
          <TouchableOpacity onPress={pickAvatar} style={[s.avatarRow]}>
            <View style={[s.avatarCircle, { backgroundColor:avatarUri ? 'transparent' : C.orange, borderColor:C.background }]}>
              {avatarUri
                ? <Image source={{ uri:avatarUri }} style={{ width:'100%', height:'100%', borderRadius:30 }} />
                : <Text style={s.avatarInitials}>{initials}</Text>
              }
            </View>
            <View>
              <Text style={{ fontSize:TY.base, fontWeight:FW.bold, color:C.textPrimary }}>Logo / Profile Photo</Text>
              <Text style={{ fontSize:TY.sm, color:C.textMuted, marginTop:2 }}>Tap to upload a square image</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={C.textMuted} style={{ marginLeft:'auto' }} />
          </TouchableOpacity>

          {/* Basic info */}
          <SectionHeader label="BASIC INFO" C={C} />
          <Field label="COMPANY NAME *"   value={companyName}     onChange={setCompanyName}     placeholder="Smith Plumbing LLC"             C={C} maxLength={60} />
          <Field label="TAGLINE"          value={tagline}         onChange={setTagline}         placeholder="Fast, reliable — 24/7 service"  C={C} maxLength={80} />
          <Field label="YEARS IN BUSINESS" value={yearsInBusiness} onChange={setYearsInBusiness} placeholder="8"                             C={C} />
          <Field label="LANGUAGES"        value={languages}       onChange={setLanguages}       placeholder="English, Spanish..."            C={C} />
          <Field label="WEBSITE"          value={website}         onChange={setWebsite}         placeholder="yourwebsite.com"                C={C} />

          {/* About */}
          <SectionHeader label="ABOUT YOUR BUSINESS *" C={C} />
          <Field
            label="" value={description} onChange={setDescription}
            placeholder="Describe your business, experience, and what makes you stand out..."
            C={C} multiline maxLength={600}
          />

          {/* Service area */}
          <SectionHeader label="SERVICE AREA *" C={C} />
          <Field
            label="" value={serviceArea} onChange={setServiceArea}
            placeholder="e.g. All of Nassau County, Queens, Brooklyn — zip codes 11501, 11530..."
            C={C} multiline maxLength={300}
          />

          {/* Specializations */}
          <SectionHeader label="TRADE TYPES *" C={C} />
          <Text style={{ fontSize:TY.xs, color:C.textMuted, marginBottom:SP[3] }}>
            Select the trades you work in — this filters your specializations below
          </Text>
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:SP[4] }}>
            {TRADE_TYPE_LIST.map(trade => {
              const active = selectedTrades.includes(trade);
              return (
                <TouchableOpacity
                  key={trade}
                  onPress={() => toggleTrade(trade)}
                  style={{
                    borderRadius:R.full, borderWidth: active ? 1.5 : 0.5,
                    borderColor: active ? C.orange : C.border,
                    backgroundColor: active ? 'rgba(255,98,0,0.12)' : C.surface,
                    paddingHorizontal:12, paddingVertical:6,
                  }}
                >
                  <Text style={{ fontSize:TY.sm, fontWeight: active ? FW.bold : FW.medium, color: active ? C.orange : C.textSecondary }}>
                    {trade}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <SectionHeader label="SPECIALIZATIONS *" C={C} />
          <Text style={{ fontSize:TY.xs, color:C.textMuted, marginBottom:SP[3] }}>
            {selectedTrades.length > 0
              ? `Showing specialties for ${selectedTrades.join(', ')}`
              : 'Select trade types above to filter relevant specializations'}
          </Text>

          {/* Quick picks — popular specialties for selected trades */}
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:SP[2] }}>
            {quickPickSpecs.map(spec => {
              const sel = specializations.includes(spec);
              return (
                <TouchableOpacity
                  key={spec}
                  onPress={() => toggleSpec(spec)}
                  style={[s.specChip, { borderColor: sel ? C.orange : C.border, backgroundColor: sel ? 'rgba(255,98,0,0.12)' : C.surface }]}
                >
                  <Text style={[s.specChipText, { color: sel ? C.orange : C.textSecondary, fontWeight: sel ? FW.bold : FW.medium }]}>
                    {spec}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* More toggle */}
          {remainingSpecs.length > 0 && !showAllSpecs && (
            <TouchableOpacity onPress={() => setShowAllSpecs(true)} style={[s.moreBtn, { borderColor: C.border }]}>
              <Ionicons name="chevron-down" size={14} color={C.orange} />
              <Text style={[s.moreBtnText, { color: C.orange }]}>+ {remainingSpecs.length} more specialties</Text>
            </TouchableOpacity>
          )}

          {showAllSpecs && (
            <>
              <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:SP[2], marginTop:SP[1] }}>
                {remainingSpecs.map(spec => {
                  const sel = specializations.includes(spec);
                  return (
                    <TouchableOpacity
                      key={spec}
                      onPress={() => toggleSpec(spec)}
                      style={[s.specChip, { borderColor: sel ? C.orange : C.border, backgroundColor: sel ? 'rgba(255,98,0,0.12)' : C.surface }]}
                    >
                      <Text style={[s.specChipText, { color: sel ? C.orange : C.textSecondary, fontWeight: sel ? FW.bold : FW.medium }]}>
                        {spec}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity onPress={() => setShowAllSpecs(false)} style={[s.moreBtn, { borderColor: C.border }]}>
                <Ionicons name="chevron-up" size={14} color={C.textMuted} />
                <Text style={[s.moreBtnText, { color: C.textMuted }]}>Show less</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Custom specialty input */}
          <View style={s.customInputRow}>
            <TextInput
              style={[s.customInput, { backgroundColor:C.surface, borderColor:C.border, color:C.textPrimary }]}
              placeholder="Add custom specialty..."
              placeholderTextColor={C.textMuted}
              value={customSpecInput}
              onChangeText={setCustomSpecInput}
              onSubmitEditing={addCustomSpec}
              returnKeyType="done"
              maxLength={60}
            />
            <TouchableOpacity onPress={addCustomSpec} style={[s.customAddBtn, { backgroundColor:C.orange }]}>
              <Ionicons name="add" size={16} color="#fff" />
              <Text style={s.customAddText}>Add</Text>
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize:TY.xs, color:C.textMuted, marginTop:SP[2], marginBottom:SP[2] }}>
            {specializations.length} selected
          </Text>

          {/* Portfolio photos */}
          <SectionHeader label={`PORTFOLIO PHOTOS  ${photos.length} / ${photoLimit}`} C={C} />
          <Text style={{ fontSize:TY.xs, color:C.textMuted, marginBottom:SP[3] }}>
            Show customers your best work. Add a caption to each photo.
          </Text>

          <View style={{ gap:SP[3] }}>
            {photos.map((photo, index) => (
              <View key={index} style={[s.photoCard, { backgroundColor:C.surface, borderColor:C.border }]}>
                <View style={{ flexDirection:'row', gap:SP[3] }}>
                  <Image source={{ uri:photo.uri || photo.url }} style={s.photoThumb} resizeMode="cover" />
                  <View style={{ flex:1 }}>
                    <TextInput
                      style={[s.captionInput, { backgroundColor:C.surfaceAlt, borderColor:C.border, color:C.textPrimary }]}
                      placeholder="Add a caption..."
                      placeholderTextColor={C.textMuted}
                      value={photo.caption}
                      onChangeText={v => updateCaption(index, v)}
                      maxLength={60}
                    />
                    <TouchableOpacity onPress={() => removePhoto(index)} style={s.removeBtn}>
                      <Ionicons name="trash-outline" size={14} color={C.error} />
                      <Text style={{ fontSize:TY.xs, color:C.error, fontWeight:FW.bold }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ))}

            {photos.length < photoLimit && (
              <TouchableOpacity onPress={addPhoto} style={[s.addPhotoBtn, { backgroundColor:C.surface, borderColor:C.border }]}>
                <Ionicons name="add-circle-outline" size={22} color={C.orange} />
                <Text style={{ fontSize:TY.base, fontWeight:FW.bold, color:C.orange }}>Add Photo</Text>
                <Text style={{ fontSize:TY.xs, color:C.textMuted, marginLeft:'auto' }}>
                  {photoLimit - photos.length} remaining
                </Text>
              </TouchableOpacity>
            )}

            {photos.length >= photoLimit && profile?.plan === 'free' && (
              <View style={[s.limitBanner, { backgroundColor:'rgba(255,98,0,0.08)', borderColor:'rgba(255,98,0,0.25)' }]}>
                <Ionicons name="lock-closed-outline" size={15} color={C.orange} />
                <Text style={{ flex:1, fontSize:TY.sm, color:C.orange }}>
                  Upgrade to Pro to add up to 15 photos
                </Text>
              </View>
            )}
          </View>

          {/* Save */}
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor:C.orange }, saving && { opacity:0.5 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
                  <Text style={s.saveBtnText}>Save Company Profile</Text>
                </>
            }
          </TouchableOpacity>

          <Text style={{ fontSize:TY.xs, color:C.textMuted, textAlign:'center', marginTop:SP[3], lineHeight:18 }}>
            Your profile is visible to customers once verification is approved.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:    { flex:1 },
  center:       { flex:1, alignItems:'center', justifyContent:'center' },
  header:       { flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:14, borderBottomWidth:0.5 },
  backBtn:      { width:36, height:36, alignItems:'center', justifyContent:'center' },
  headerTitle:  { flex:1, textAlign:'center', fontSize:17, fontWeight:'700', letterSpacing:-0.3 },
  previewBtn:   { flexDirection:'row', alignItems:'center', gap:5 },
  planBanner:   { flexDirection:'row', alignItems:'center', gap:10, borderRadius:12, borderWidth:0.5, padding:12, marginTop:16, marginBottom:4 },
  upgradePill:  { borderRadius:999, borderWidth:1, paddingHorizontal:10, paddingVertical:4 },
  bannerUpload: { height:120, borderRadius:14, borderWidth:1.5, borderStyle:'dashed', overflow:'hidden', marginBottom:12, justifyContent:'center' },
  bannerEmpty:  { alignItems:'center', gap:4 },
  bannerEditBtn:{ position:'absolute', bottom:8, right:8, flexDirection:'row', gap:5, borderRadius:8, paddingHorizontal:10, paddingVertical:5, alignItems:'center' },
  avatarRow:    { flexDirection:'row', alignItems:'center', gap:14, marginBottom:8 },
  avatarCircle: { width:60, height:60, borderRadius:16, borderWidth:3, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  avatarInitials:{ fontSize:20, fontWeight:'800', color:'#fff' },
  photoCard:    { borderRadius:12, borderWidth:0.5, padding:12 },
  photoThumb:   { width:72, height:72, borderRadius:10 },
  captionInput: { borderRadius:8, borderWidth:0.5, paddingHorizontal:10, paddingVertical:8, fontSize:13, marginBottom:8 },
  removeBtn:    { flexDirection:'row', alignItems:'center', gap:4 },
  addPhotoBtn:  { flexDirection:'row', alignItems:'center', gap:10, borderRadius:12, borderWidth:1.5, borderStyle:'dashed', padding:16 },
  limitBanner:  { flexDirection:'row', alignItems:'center', gap:10, borderRadius:12, borderWidth:1, padding:12 },
  saveBtn:      { borderRadius:14, paddingVertical:16, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8, marginTop:24 },
  saveBtnText:  { fontSize:16, fontWeight:'800', color:'#fff' },

  specChip:       { borderRadius:999, borderWidth:0.5, paddingHorizontal:12, paddingVertical:6 },
  specChipText:   { fontSize:13 },
  moreBtn:        { flexDirection:'row', alignItems:'center', gap:6, borderRadius:10, borderWidth:0.5, paddingHorizontal:14, paddingVertical:9, marginBottom:8, alignSelf:'flex-start' },
  moreBtnText:    { fontSize:13, fontWeight:'600' },
  customInputRow: { flexDirection:'row', gap:8, alignItems:'center', marginTop:12 },
  customInput:    { flex:1, borderRadius:10, borderWidth:0.5, paddingHorizontal:12, paddingVertical:9, fontSize:13 },
  customAddBtn:   { flexDirection:'row', alignItems:'center', gap:4, borderRadius:10, paddingHorizontal:14, paddingVertical:10 },
  customAddText:  { fontSize:13, fontWeight:'700', color:'#fff' },
});