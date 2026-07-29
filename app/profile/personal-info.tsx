import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated, Image, KeyboardAvoidingView, Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../../constants/Layout';
import { Colors, Font, Radius } from '../../constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '../../hooks/useAuth';
import { useRole } from '../../hooks/useRole';
import { supabase } from '../../lib/supabase';

async function uploadAvatar(userId: string, uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop()?.toLowerCase()?.split('?')[0] ?? 'jpg';
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const path = `${userId}/avatar.${ext === 'jpg' ? 'jpg' : ext}`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: mime, upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return `${data.publicUrl}?t=${Date.now()}`;
  } catch (e) {
    console.log('uploadAvatar error:', e);
    return null;
  }
}

function FocusInput({ label, value, onChangeText, placeholder, keyboardType, editable = true, hint }: any) {
  const [focused, setFocused] = useState(false);
  const glow = useRef(new Animated.Value(0)).current;
  const border = glow.interpolate({ inputRange: [0, 1], outputRange: ['#2A2A2A', '#FF6200'] });

  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Animated.View style={[styles.fieldBox, { borderColor: border }]}>
        <TextInput
          style={[styles.fieldInput, !editable && styles.fieldInputDisabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#444"
          keyboardType={keyboardType ?? 'default'}
          editable={editable}
          selectionColor={Colors.orange}
          autoCapitalize="none"
          onFocus={() => { setFocused(true); Animated.timing(glow, { toValue: 1, duration: 200, useNativeDriver: false }).start(); }}
          onBlur={() => { setFocused(false); Animated.timing(glow, { toValue: 0, duration: 200, useNativeDriver: false }).start(); }}
        />
        {!editable && <Text style={styles.lockIcon}>🔒</Text>}
      </Animated.View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

export default function PersonalInfoScreen() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const { isContractor, loading: roleLoading } = useRole();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [username, setUsername] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [memberSince, setMemberSince] = useState('');
  const [plan, setPlan] = useState('free');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (user && !roleLoading) loadProfile();
  }, [user, isContractor, roleLoading]);

  const loadProfile = async () => {
    try {
      if (isContractor) {
        const { data } = await supabase.from('contractors').select('*').eq('id', user!.id).single();
        if (data) {
          setCompanyName(data.company_name ?? '');
          setEmail(data.email ?? user!.email ?? '');
          setPhone(data.phone ?? '');
          setLocation(data.location ?? '');
          setUsername(data.username ?? '');
          setWebsite(data.website ?? '');
          setDescription(data.description ?? '');
          setPlan(data.plan ?? 'free');
          setAvatarUrl(data.avatar_url ?? null);
          setMemberSince(data.created_at ? new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '');
        }
      } else {
        const { data } = await supabase.from('users').select('*').eq('id', user!.id).single();
        if (data) {
          setFullName(data.full_name ?? '');
          setEmail(data.email ?? user!.email ?? '');
          setPhone(data.phone ?? '');
          setLocation(data.location ?? '');
          setUsername(data.username ?? '');
          setAvatarUrl(data.avatar_url ?? null);
          setMemberSince(data.created_at ? new Date(data.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : '');
        }
      }
    } catch (err) {
      console.log('load profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  const pickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;
    setUploadingAvatar(true);
    const url = await uploadAvatar(user!.id, result.assets[0].uri);
    if (url) {
      setAvatarUrl(url);
      const table = isContractor ? 'contractors' : 'users';
      await supabase.from(table).update({ avatar_url: url }).eq('id', user!.id);
    } else {
      Alert.alert('Upload failed', 'Could not upload photo. Try again.');
    }
    setUploadingAvatar(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (isContractor) {
        const { error } = await supabase.from('contractors').update({
          company_name: companyName.trim(),
          phone: phone.trim(),
          location: location.trim(),
          username: username.trim(),
          website: website.trim(),
          description: description.trim(),
        }).eq('id', user!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('users').update({
          full_name: fullName.trim(),
          phone: phone.trim(),
          location: location.trim(),
          username: username.trim(),
        }).eq('id', user!.id);
        if (error) throw error;
      }
      Alert.alert('Saved', 'Your information has been updated.', [
        { text: 'OK', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingState}>
          <ActivityIndicator color={Colors.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Personal Information</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* Avatar */}
          <View style={styles.avatarSection}>
            <TouchableOpacity onPress={pickAvatar} disabled={uploadingAvatar}>
              <View style={styles.avatar}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <Text style={styles.avatarText}>
                    {isContractor
                      ? (companyName[0] ?? '?').toUpperCase()
                      : (fullName[0] ?? '?').toUpperCase()}
                  </Text>
                )}
                {uploadingAvatar && (
                  <View style={styles.avatarOverlay}>
                    <ActivityIndicator color="#fff" />
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.changePhotoBtn} onPress={pickAvatar} disabled={uploadingAvatar}>
              <Text style={styles.changePhotoText}>
                {uploadingAvatar ? 'Uploading…' : 'Edit Profile Photo'}
              </Text>
            </TouchableOpacity>
            {memberSince ? <Text style={styles.memberSince}>Member since {memberSince}</Text> : null}
          </View>

          {/* Plan badge */}
          {isContractor && (
            <View style={styles.planBadge}>
              <Text style={styles.planIcon}>{plan === 'pro' ? '⭐' : '🆓'}</Text>
              <Text style={styles.planText}>
                {plan === 'pro' ? 'Pro Member' : plan === 'leads' ? 'Leads Plan' : 'Free Member'}
              </Text>
            </View>
          )}

          <Text style={styles.sectionLabel}>BASIC INFO</Text>
          <View style={styles.card}>
            {isContractor ? (
              <>
                <FocusInput label="Business Name" value={companyName} onChangeText={setCompanyName} placeholder="Your company name" />
                <View style={styles.divider} />
                <FocusInput label="Username" value={username} onChangeText={setUsername} placeholder="@username" />
                <View style={styles.divider} />
                <FocusInput label="Email Address" value={email} onChangeText={() => {}} placeholder="" editable={false} hint="Email cannot be changed here" />
                <View style={styles.divider} />
                <FocusInput label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+1 (555) 000-0000" keyboardType="phone-pad" />
              </>
            ) : (
              <>
                <FocusInput label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Your full name" />
                <View style={styles.divider} />
                <FocusInput label="Username" value={username} onChangeText={setUsername} placeholder="@username" />
                <View style={styles.divider} />
                <FocusInput label="Email Address" value={email} onChangeText={() => {}} placeholder="" editable={false} hint="Email cannot be changed here" />
                <View style={styles.divider} />
                <FocusInput label="Phone Number" value={phone} onChangeText={setPhone} placeholder="+1 (555) 000-0000" keyboardType="phone-pad" />
              </>
            )}
          </View>

          <Text style={styles.sectionLabel}>LOCATION</Text>
          <View style={styles.card}>
            <FocusInput
              label="Service Area / County"
              value={location}
              onChangeText={setLocation}
              placeholder="e.g. Brooklyn, NY"
              hint="Only your county is shown publicly"
            />
          </View>

          {isContractor && (
            <>
              <Text style={styles.sectionLabel}>BUSINESS INFO</Text>
              <View style={styles.card}>
                <FocusInput label="Website" value={website} onChangeText={setWebsite} placeholder="www.yoursite.com" keyboardType="url" />
                <View style={styles.divider} />
                <FocusInput label="About / Bio" value={description} onChangeText={setDescription} placeholder="Describe your services..." />
              </View>
            </>
          )}

          {/* Contact preference */}
          <Text style={styles.sectionLabel}>CONTACT PREFERENCE</Text>
          <View style={styles.card}>
            {['Phone', 'Email', 'In-App'].map((method, i, arr) => (
              <View key={method}>
                <TouchableOpacity style={styles.prefRow}>
                  <Text style={styles.prefLabel}>{method}</Text>
                  <View style={[styles.radio, method === 'In-App' && styles.radioActive]}>
                    {method === 'In-App' && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
                {i < arr.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>

          {/* Save button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color={Colors.background} />
              : <Text style={styles.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  flex: { flex: 1 },
  loadingState: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1E1E',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: Colors.white },
  headerTitle: { fontSize: 16, fontWeight: Font.bold, color: Colors.white },
  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.md, paddingBottom: 40 },

  avatarSection: { alignItems: 'center', gap: 10, paddingBottom: 8 },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: 'rgba(255,98,0,0.3)',
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 8,
  },
  avatarText: { fontSize: 34, fontWeight: Font.black, color: Colors.background },
  avatarImage: { width: 88, height: 88, borderRadius: 44 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  changePhotoBtn: {
    backgroundColor: '#1A1A1A', borderRadius: Radius.md,
    borderWidth: 1, borderColor: '#2A2A2A',
    paddingHorizontal: 18, paddingVertical: 8,
  },
  changePhotoText: { fontSize: 13, fontWeight: Font.semibold, color: Colors.orange },
  memberSince: { fontSize: 12, color: '#555' },

  planBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: Colors.orangeDim,
    borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.orange,
    paddingHorizontal: 18, paddingVertical: 8, alignSelf: 'center',
  },
  planIcon: { fontSize: 16 },
  planText: { fontSize: 13, fontWeight: Font.bold, color: Colors.orange },

  sectionLabel: {
    fontSize: 11, fontWeight: Font.black,
    color: '#555', letterSpacing: 1.5,
  },

  card: {
    backgroundColor: '#141414', borderRadius: 18,
    borderWidth: 1, borderColor: '#1E1E1E', overflow: 'hidden',
  },
  divider: { height: 1, backgroundColor: '#1E1E1E' },

  fieldWrap: { padding: Spacing.md, gap: 8 },
  fieldLabel: { fontSize: 11, fontWeight: Font.semibold, color: '#666', letterSpacing: 0.5, textTransform: 'uppercase' },
  fieldBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D0D0D', borderRadius: Radius.md,
    borderWidth: 1.5, paddingHorizontal: 14, minHeight: 50,
  },
  fieldInput: { flex: 1, fontSize: 15, color: Colors.white, paddingVertical: 10 },
  fieldInputDisabled: { color: '#555' },
  fieldHint: { fontSize: 11, color: '#555' },
  lockIcon: { fontSize: 14 },

  prefRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', padding: Spacing.md,
  },
  prefLabel: { fontSize: 15, color: Colors.textPrimary },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#333',
    alignItems: 'center', justifyContent: 'center',
  },
  radioActive: { borderColor: Colors.orange },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.orange },

  saveBtn: {
    height: 56, borderRadius: 16,
    backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 10,
  },
  saveBtnText: { fontSize: 16, fontWeight: Font.black, color: Colors.background, letterSpacing: 0.3 },
});