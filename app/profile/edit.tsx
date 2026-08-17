import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
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
import { useAuth } from '../../hooks/useAuth';
import { useRole } from '../../hooks/useRole';
import { supabase } from '../../lib/supabase';

function EditField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
  hint,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: any;
  hint?: string;
}) {
  return (
    <View style={styles.fieldContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.fieldInput, multiline && styles.fieldInputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        keyboardType={keyboardType ?? 'default'}
        selectionColor={Colors.orange}
      />
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

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
    // Cache-bust so the image reloads immediately
    return `${data.publicUrl}?t=${Date.now()}`;
  } catch (err) {
    console.error('avatar upload error:', err);
    return null;
  }
}

function ContractorEditForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [companyName, setCompanyName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [serviceArea, setServiceArea] = useState('');
  const [website, setWebsite] = useState('');
  const [experience, setExperience] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('contractors')
        .select('company_name, username, description, service_area, website, experience, location, avatar_url')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      if (data) {
        setCompanyName(data.company_name ?? '');
        setUsername(data.username ?? '');
        setBio(data.description ?? '');
        setServiceArea(data.service_area ?? '');
        setWebsite(data.website ?? '');
        setExperience(data.experience ?? '');
        setLocation(data.location ?? '');
        setAvatarUrl(data.avatar_url ?? '');
      }
    } catch (err) {
      console.log('load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingAvatar(true);
    const url = await uploadAvatar(user!.id, result.assets[0].uri);
    if (url) {
      setAvatarUrl(url);
      await supabase.from('contractors').update({ avatar_url: url }).eq('id', user!.id);
    } else {
      Alert.alert('Upload failed', 'Could not save photo. Check your connection and try again.');
    }
    setUploadingAvatar(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const [{ error: contractorError }, { error: userError }] = await Promise.all([
        supabase
          .from('contractors')
          .update({
            company_name:  companyName.trim(),
            username:      username.trim(),
            description:   bio.trim(),
            service_area:  serviceArea.trim(),
            website:       website.trim(),
            experience:    experience.trim(),
            location:      location.trim(),
          })
          .eq('id', user!.id),
        // Keep users table in sync for shared fields
        supabase
          .from('users')
          .update({ username: username.trim() })
          .eq('id', user!.id),
      ]);
      if (contractorError) throw contractorError;
      if (userError) throw userError;
      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account', style: 'destructive', onPress: async () => {
            if (!user) return;
            const { error } = await supabase.from('account_deletion_requests').insert({
              user_id: user.id,
              email:   user.email,
              role:    'contractor',
            });
            if (error) {
              Alert.alert('Error', "Couldn't submit your deletion request. Please try again.");
              return;
            }
            Alert.alert(
              'Account Scheduled for Deletion',
              "Your account is scheduled for deletion and will be permanently removed within 30 days. You'll be signed out now.",
              [{ text: 'OK', onPress: async () => {
                await supabase.auth.signOut();
                router.replace('/login');
              }}],
            );
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.orange} size="large" />
      </View>
    );
  }

  const isValidUrl = avatarUrl && !avatarUrl.startsWith('file://');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        {/* Avatar */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} style={styles.avatarWrap}>
            {isValidUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarCircle}>
                <Text style={styles.avatarInitial}>{companyName.trim()[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changePhotoBtn} onPress={handlePickAvatar} disabled={uploadingAvatar}>
            <Text style={styles.changePhotoText}>{uploadingAvatar ? 'Uploading…' : 'Change Photo'}</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title="BASIC INFO" />
        <View style={styles.card}>
          <EditField label="Business Name" value={companyName} onChangeText={setCompanyName} placeholder="Your company name" />
          <View style={styles.fieldDivider} />
          <EditField label="Username" value={username} onChangeText={setUsername} placeholder="@username" hint="tradease.com/@username" />
        </View>

        <SectionHeader title="BUSINESS INFO" />
        <View style={styles.card}>
          <EditField label="Years of Experience" value={experience} onChangeText={setExperience} placeholder="e.g. 12 years" />
          <View style={styles.fieldDivider} />
          <EditField label="Website" value={website} onChangeText={setWebsite} placeholder="www.yoursite.com" keyboardType="url" />
        </View>

        <SectionHeader title="LOCATION" />
        <View style={styles.card}>
          <EditField label="City / Location" value={location} onChangeText={setLocation} placeholder="e.g. Dallas, TX" />
          <View style={styles.fieldDivider} />
          <EditField
            label="Service Area"
            value={serviceArea}
            onChangeText={setServiceArea}
            placeholder="e.g. Dallas, Plano, Frisco, TX"
            hint="List all areas you serve"
          />
        </View>

        <SectionHeader title="BIO" />
        <View style={styles.card}>
          <EditField
            label="About You"
            value={bio}
            onChangeText={setBio}
            placeholder="Tell customers about your experience and services..."
            multiline
          />
        </View>

        <SectionHeader title="VERIFICATION" />
        <View style={styles.verifyCard}>
          <View style={styles.verifyRow}>
            <Text style={styles.verifyIcon}>📋</Text>
            <View style={styles.verifyInfo}>
              <Text style={styles.verifyLabel}>Contractor License</Text>
              <Text style={styles.verifyStatus}>Upload to get verified</Text>
            </View>
            <TouchableOpacity style={styles.verifyBtn} onPress={() => router.push('/profile/get-verified')}>
              <Text style={styles.verifyBtnText}>Verify</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.fieldDivider} />
          <View style={styles.verifyRow}>
            <Text style={styles.verifyIcon}>🛡️</Text>
            <View style={styles.verifyInfo}>
              <Text style={styles.verifyLabel}>Insurance Certificate</Text>
              <Text style={styles.verifyStatus}>Upload to get verified</Text>
            </View>
            <TouchableOpacity style={styles.verifyBtn} onPress={() => router.push('/profile/get-verified')}>
              <Text style={styles.verifyBtnText}>Verify</Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>DANGER ZONE</Text>
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={handleDeleteAccount}
          >
            <Text style={styles.dangerBtnText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CustomerEditForm() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [location, setLocation] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    if (user) loadProfile();
  }, [user]);

  const loadProfile = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('full_name, username, location, avatar_url')
        .eq('id', user!.id)
        .single();
      if (error) throw error;
      if (data) {
        setFullName(data.full_name ?? '');
        setUsername(data.username ?? '');
        setLocation(data.location ?? '');
        setAvatarUrl(data.avatar_url ?? '');
      }
    } catch (err) {
      console.log('load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePickAvatar = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to change your profile photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;

    setUploadingAvatar(true);
    const url = await uploadAvatar(user!.id, result.assets[0].uri);
    if (url) {
      setAvatarUrl(url);
      await supabase.from('users').update({ avatar_url: url }).eq('id', user!.id);
    } else {
      Alert.alert('Upload failed', 'Could not save photo. Check your connection and try again.');
    }
    setUploadingAvatar(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('users')
        .update({
          full_name: fullName.trim(),
          username:  username.trim(),
          location:  location.trim(),
        })
        .eq('id', user!.id);
      if (error) throw error;
      Alert.alert('Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)') },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete My Account', style: 'destructive', onPress: async () => {
            if (!user) return;
            const { error } = await supabase.from('account_deletion_requests').insert({
              user_id: user.id,
              email:   user.email,
              role:    'customer',
            });
            if (error) {
              Alert.alert('Error', "Couldn't submit your deletion request. Please try again.");
              return;
            }
            Alert.alert(
              'Account Scheduled for Deletion',
              "Your account is scheduled for deletion and will be permanently removed within 30 days. You'll be signed out now.",
              [{ text: 'OK', onPress: async () => {
                await supabase.auth.signOut();
                router.replace('/login');
              }}],
            );
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={Colors.orange} size="large" />
      </View>
    );
  }

  const isValidUrl = avatarUrl && !avatarUrl.startsWith('file://');

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handlePickAvatar} disabled={uploadingAvatar} style={styles.avatarWrap}>
            {isValidUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
            ) : (
              <View style={[styles.avatarCircle, styles.avatarCircleCustomer]}>
                <Text style={styles.avatarInitial}>{fullName.trim()[0]?.toUpperCase() ?? '?'}</Text>
              </View>
            )}
            {uploadingAvatar && (
              <View style={styles.avatarOverlay}>
                <ActivityIndicator color="#fff" />
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.changePhotoBtn} onPress={handlePickAvatar} disabled={uploadingAvatar}>
            <Text style={styles.changePhotoText}>{uploadingAvatar ? 'Uploading…' : 'Change Photo'}</Text>
          </TouchableOpacity>
        </View>

        <SectionHeader title="BASIC INFO" />
        <View style={styles.card}>
          <EditField label="Full Name" value={fullName} onChangeText={setFullName} placeholder="Your full name" />
          <View style={styles.fieldDivider} />
          <EditField label="Username" value={username} onChangeText={setUsername} placeholder="@username" hint="tradease.com/@username" />
        </View>

        <SectionHeader title="LOCATION" />
        <View style={styles.card}>
          <EditField label="City / County" value={location} onChangeText={setLocation} placeholder="e.g. Brooklyn, NY" />
        </View>

        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color={Colors.background} /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
        </TouchableOpacity>

        <View style={styles.dangerZone}>
          <Text style={styles.dangerTitle}>DANGER ZONE</Text>
          <TouchableOpacity
            style={styles.dangerBtn}
            onPress={handleDeleteAccount}
          >
            <Text style={styles.dangerBtnText}>Delete Account</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function EditProfileScreen() {
  const router = useRouter();
  const { isContractor } = useRole();

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Profile</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {isContractor ? <ContractorEditForm /> : <CustomerEditForm />}
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: Colors.background },
  flex:        { flex: 1 },
  headerSafe:  { backgroundColor: Colors.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
    borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow:   { fontSize: 18, color: Colors.white },
  headerTitle: { fontSize: 16, fontWeight: Font.bold, color: Colors.white },

  scroll: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.md,
  },

  // Avatar
  avatarSection: { alignItems: 'center', gap: 12, paddingVertical: Spacing.md },
  avatarWrap:    { position: 'relative' },
  avatarImage: {
    width: 90, height: 90,
    borderRadius: 45,
    borderWidth: 3, borderColor: Colors.orangeDim,
  },
  avatarCircle: {
    width: 90, height: 90,
    borderRadius: 45,
    backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3, borderColor: Colors.orangeDim,
  },
  avatarCircleCustomer: { backgroundColor: '#38BDF8' },
  avatarInitial: { fontSize: 36, fontWeight: Font.black, color: Colors.background },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 45,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
  },
  changePhotoBtn: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 18, paddingVertical: 8,
  },
  changePhotoText: { fontSize: 13, fontWeight: Font.semibold, color: Colors.orange },

  // Section header
  sectionHeader: { paddingTop: 4 },
  sectionTitle: {
    fontSize: 11, fontWeight: Font.black,
    color: Colors.textSecondary, letterSpacing: 1.5,
  },

  // Card
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },

  // Fields
  fieldContainer: { padding: Spacing.md, gap: 6 },
  fieldLabel: {
    fontSize: 11, fontWeight: Font.semibold,
    color: Colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  fieldInput:      { fontSize: 15, color: Colors.white, paddingVertical: 4 },
  fieldInputMulti: { height: 100, textAlignVertical: 'top' },
  fieldHint:       { fontSize: 11, color: Colors.textMuted },
  fieldDivider:    { height: 1, backgroundColor: Colors.border },

  // Verify
  verifyCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border,
    overflow: 'hidden',
  },
  verifyRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, padding: Spacing.md,
  },
  verifyIcon:   { fontSize: 20 },
  verifyInfo:   { flex: 1 },
  verifyLabel:  { fontSize: 14, fontWeight: Font.semibold, color: Colors.white },
  verifyStatus: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  verifyBtn: {
    backgroundColor: Colors.orangeDim,
    borderRadius: Radius.sm,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: Colors.orange,
  },
  verifyBtnText: { fontSize: 12, fontWeight: Font.bold, color: Colors.orange },

  // Save
  saveBtn: {
    backgroundColor: Colors.orange,
    borderRadius: Radius.lg,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  saveBtnText: { fontSize: 16, fontWeight: Font.black, color: Colors.background },

  // Danger zone
  dangerZone:  { gap: 12 },
  dangerTitle: { fontSize: 11, fontWeight: Font.black, color: Colors.error, letterSpacing: 1.5 },
  dangerBtn: {
    borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.error,
    paddingVertical: 14, alignItems: 'center',
  },
  dangerBtnText: { fontSize: 14, fontWeight: Font.bold, color: Colors.error },
});
