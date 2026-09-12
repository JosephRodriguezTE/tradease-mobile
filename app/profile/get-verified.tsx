// app/profile/get-verified.tsx
import * as Sentry from '@sentry/react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView,
  Platform, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { decode as decodeBase64 } from 'base64-arraybuffer';
import { supabase } from '@/lib/supabase';
import { useTheme, AppColors } from '@/context/ThemeContext';
import { Font, Radius } from '../../constants/theme';

const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24,'2xl':30 } as const;
const TOTAL_STEPS = 4;

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
];

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total, C }: { step: number; total: number; C: AppColors }) {
  const pct = ((step + 1) / total) * 100;
  return (
    <View style={{ height: 3, backgroundColor: C.border, borderRadius: 2 }}>
      <View style={{
        height: 3, borderRadius: 2,
        width: `${pct}%` as any,
        backgroundColor: C.orange,
      }} />
    </View>
  );
}

// ─── Month/Year Picker ────────────────────────────────────────────────────────

function MonthYearPicker({
  month, year, onSelect, C,
}: {
  month: number; year: number;
  onSelect: (m: number, y: number) => void;
  C: AppColors;
}) {
  const now = new Date();
  const [displayYear, setDisplayYear] = useState(year || now.getFullYear());

  return (
    <View style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.lg, borderWidth: 0.5, borderColor: C.border, padding: SP[4] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: SP[4] }}>
        <TouchableOpacity onPress={() => setDisplayYear(y => y - 1)} style={{ padding: SP[2] }}>
          <Ionicons name="chevron-back" size={20} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize: TY.md, fontWeight: Font.black, color: C.textPrimary }}>{displayYear}</Text>
        <TouchableOpacity onPress={() => setDisplayYear(y => y + 1)} style={{ padding: SP[2] }}>
          <Ionicons name="chevron-forward" size={20} color={C.textPrimary} />
        </TouchableOpacity>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP[2] }}>
        {MONTHS.map((m, i) => {
          const isSelected = i + 1 === month && displayYear === year;
          const isPast = new Date(displayYear, i) < new Date(now.getFullYear(), now.getMonth());
          return (
            <TouchableOpacity
              key={m}
              onPress={() => !isPast && onSelect(i + 1, displayYear)}
              style={{
                width: '30%',
                paddingVertical: SP[3],
                borderRadius: Radius.md,
                alignItems: 'center',
                backgroundColor: isSelected ? C.orange : C.surface,
                borderWidth: 0.5,
                borderColor: isSelected ? C.orange : C.border,
                opacity: isPast ? 0.3 : 1,
              }}
            >
              <Text style={{ fontSize: TY.sm, fontWeight: Font.semibold, color: isSelected ? '#fff' : C.textPrimary }}>
                {m}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Upload Field ─────────────────────────────────────────────────────────────

function UploadField({
  label, uri, fileName, onPickImage, onPickDoc, C,
}: {
  label: string;
  uri: string;
  fileName: string;
  onPickImage: () => void;
  onPickDoc: () => void;
  C: AppColors;
}) {
  const isImage = uri && (uri.startsWith('file:') || uri.startsWith('ph://') || uri.startsWith('content:'));

  return (
    <View style={{ marginBottom: SP[4] }}>
      <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>
        {label.toUpperCase()}
      </Text>
      {uri ? (
        <View style={{ backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: Radius.lg, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', padding: SP[4], flexDirection: 'row', alignItems: 'center', gap: SP[3] }}>
          {isImage
            ? <Image source={{ uri }} style={{ width: 56, height: 56, borderRadius: Radius.sm }} resizeMode="cover" />
            : <View style={{ width: 56, height: 56, borderRadius: Radius.sm, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="document-outline" size={26} color="#22C55E" />
              </View>
          }
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#22C55E' }}>✓ Document selected</Text>
            <Text style={{ fontSize: TY.xs, color: C.textMuted, marginTop: 2 }} numberOfLines={1}>{fileName}</Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <TouchableOpacity onPress={onPickImage} style={{ padding: SP[2] }}>
              <Ionicons name="camera-outline" size={16} color={C.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={onPickDoc} style={{ padding: SP[2] }}>
              <Ionicons name="document-outline" size={16} color={C.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={{ gap: SP[2] }}>
          <TouchableOpacity
            onPress={onPickImage}
            style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 1, borderColor: C.border, borderStyle: 'dashed', padding: SP[4], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2] }}
          >
            <Ionicons name="camera-outline" size={18} color={C.textSecondary} />
            <Text style={{ fontSize: TY.sm, fontWeight: Font.semibold, color: C.textSecondary }}>Choose Photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onPickDoc}
            style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, padding: SP[3], flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2] }}
          >
            <Ionicons name="document-outline" size={16} color={C.textMuted} />
            <Text style={{ fontSize: TY.xs, fontWeight: Font.medium, color: C.textMuted }}>Choose PDF</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Text Field ───────────────────────────────────────────────────────────────

function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', maxLength, hint, C }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder: string; keyboardType?: any; maxLength?: number; hint?: string; C: AppColors;
}) {
  return (
    <View style={{ marginBottom: SP[4] }}>
      <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>
        {label.toUpperCase()}
      </Text>
      <TextInput
        style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: SP[4], paddingVertical: SP[4], fontSize: TY.base, color: C.textPrimary }}
        placeholder={placeholder}
        placeholderTextColor={C.textMuted}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        maxLength={maxLength}
      />
      {hint && <Text style={{ fontSize: TY.xs, color: C.textMuted, marginTop: SP[2] }}>{hint}</Text>}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

// Sentinel meaning "keep the document already on file" -- distinct from a
// real uri (never starts with file:/ph:/content:), so UploadField falls
// into its document-icon branch and canProceed()'s truthy check still
// passes without needing a fresh pick. Cleared the moment the user taps
// through and picks a real replacement.
const KEPT_DOC = 'kept-existing-document';

export default function GetVerifiedScreen() {
  const router = useRouter();
  const { colors: C } = useTheme();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [contractorId, setContractorId] = useState('');

  // Existing-application state -- loaded before the form is shown, so a
  // pending or rejected contractor edits/resubmits instead of starting a
  // second, unrelated-looking application from a blank form.
  const [loadingExisting,   setLoadingExisting]   = useState(true);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);
  const [rejectionReason,    setRejectionReason]    = useState<string | null>(null);
  const [existingLicenseDocPath, setExistingLicenseDocPath] = useState<string | null>(null);
  const [existingInsDocPath,     setExistingInsDocPath]     = useState<string | null>(null);
  const [existingIdDocPath,      setExistingIdDocPath]      = useState<string | null>(null);

  // Step 1 — Business Info
  const [businessName,     setBusinessName]     = useState('');
  const [yearsInBusiness,  setYearsInBusiness]  = useState('');
  const [primaryTrade,     setPrimaryTrade]      = useState('');

  // Step 2 — License
  const [licenseNumber,    setLicenseNumber]    = useState('');
  const [licenseState,     setLicenseState]     = useState('');
  const [stateOpen,        setStateOpen]        = useState(false);
  const [licenseDocUri,    setLicenseDocUri]    = useState('');
  const [licenseDocName,   setLicenseDocName]   = useState('');
  const [licenseDocMime,   setLicenseDocMime]   = useState('image/jpeg');
  const [licenseDocB64,    setLicenseDocB64]    = useState<string | null>(null);

  // Step 3 — Insurance
  const [insuranceProvider, setInsuranceProvider] = useState('');
  const [expiryMonth,        setExpiryMonth]       = useState(0);
  const [expiryYear,         setExpiryYear]        = useState(0);
  const [showDatePicker,     setShowDatePicker]     = useState(false);
  const [insDocUri,          setInsDocUri]          = useState('');
  const [insDocName,         setInsDocName]         = useState('');
  const [insDocMime,         setInsDocMime]         = useState('image/jpeg');
  const [insDocB64,          setInsDocB64]          = useState<string | null>(null);

  // Step 4 — Government ID
  const [govIdUri,  setGovIdUri]  = useState('');
  const [govIdName, setGovIdName] = useState('');
  const [govIdMime, setGovIdMime] = useState('image/jpeg');
  const [govIdB64,  setGovIdB64]  = useState<string | null>(null);

  // Pre-fill from contractor profile, and -- the point of this whole
  // effect -- load any existing contractor_verification row so a pending
  // or rejected contractor edits/resubmits instead of retyping and
  // re-uploading everything from a blank form. verification_status is
  // checked here too: an approved contractor never sees the form at all
  // (rendered below), since submitting again would silently reset them
  // to pending_review.
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoadingExisting(false); return; }
      setContractorId(user.id);

      const [{ data: contractor }, { data: verification }] = await Promise.all([
        supabase
          .from('contractors')
          .select('company_name, trade_type, years_in_business, verification_status, verification_rejection_reason')
          .eq('id', user.id)
          .single(),
        supabase
          .from('contractor_verification')
          .select('license_number, license_state, license_doc_path, insurance_provider, insurance_expiry, insurance_doc_path, id_doc_path, years_in_business')
          .eq('contractor_id', user.id)
          .maybeSingle(),
      ]);

      if (contractor) {
        setBusinessName(contractor.company_name ?? '');
        setPrimaryTrade(contractor.trade_type ?? '');
        setVerificationStatus(contractor.verification_status ?? null);
        setRejectionReason(contractor.verification_rejection_reason ?? null);
        setYearsInBusiness(contractor.years_in_business ? String(contractor.years_in_business) : '');
      }

      if (verification) {
        if (verification.years_in_business) setYearsInBusiness(String(verification.years_in_business));
        setLicenseNumber(verification.license_number ?? '');
        setLicenseState(verification.license_state ?? '');
        setInsuranceProvider(verification.insurance_provider ?? '');
        if (verification.insurance_expiry) {
          const d = new Date(verification.insurance_expiry);
          setExpiryMonth(d.getMonth() + 1);
          setExpiryYear(d.getFullYear());
        }
        if (verification.license_doc_path) {
          setExistingLicenseDocPath(verification.license_doc_path);
          setLicenseDocUri(KEPT_DOC);
          setLicenseDocName('Current document on file');
        }
        if (verification.insurance_doc_path) {
          setExistingInsDocPath(verification.insurance_doc_path);
          setInsDocUri(KEPT_DOC);
          setInsDocName('Current document on file');
        }
        if (verification.id_doc_path) {
          setExistingIdDocPath(verification.id_doc_path);
          setGovIdUri(KEPT_DOC);
          setGovIdName('Current document on file');
        }
      }

      setLoadingExisting(false);
    }
    load();
  }, []);

  const canProceed = useCallback((): boolean => {
    if (step === 0) return businessName.trim().length > 2 && parseInt(yearsInBusiness) >= 1;
    if (step === 1) return licenseNumber.trim().length > 2 && licenseState.length === 2 && !!licenseDocUri;
    if (step === 2) return insuranceProvider.trim().length > 2 && expiryMonth > 0 && expiryYear > 0 && !!insDocUri;
    if (step === 3) return !!govIdUri;
    return false;
  }, [step, businessName, yearsInBusiness, licenseNumber, licenseState, licenseDocUri, insuranceProvider, expiryMonth, expiryYear, insDocUri, govIdUri]);

  // ── File pickers ─────────────────────────────────────────────────────────────

  async function pickImage(setUri: (s: string) => void, setName: (s: string) => void, setMime: (s: string) => void, setB64: (s: string | null) => void) {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Please allow access to your photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: false,
      // Gallery-picked images (screenshots especially) commonly come back as
      // content:// URIs on Android, which RN's fetch polyfill does not
      // reliably turn into bytes (see uploadFile below) — base64 sidesteps
      // reading the URI a second time entirely.
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setB64(asset.base64 ?? null);
      setUri(asset.uri);
      setName(asset.fileName ?? `doc_${Date.now()}.jpg`);
      setMime(asset.mimeType ?? 'image/jpeg');
    }
  }

  async function pickDoc(setUri: (s: string) => void, setName: (s: string) => void, setMime: (s: string) => void, setB64: (s: string | null) => void) {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      setUri(asset.uri);
      setName(asset.name);
      setMime('application/pdf');
      // Clear any base64 left over from a prior image pick for this same
      // field — otherwise uploadFile would upload stale image bytes under
      // the new PDF's path.
      setB64(null);
    }
  }

  // ── Upload single file ────────────────────────────────────────────────────────

  type UploadResult = { ok: true; path: string } | { ok: false; error: string };

  async function uploadFile(uri: string, mime: string, storagePath: string, base64?: string | null): Promise<UploadResult> {
    try {
      // Prefer the base64 the picker already gave us over re-reading the
      // URI. Gallery-picked images (screenshots especially) commonly come
      // back as content:// URIs on Android, and fetch(uri).arrayBuffer()
      // is not reliable for those — this is the same class of issue the
      // .blob() vs .arrayBuffer() choice above was already working around,
      // just one layer further in. PDFs (copyToCacheDirectory: true, so
      // always a real file:// path) keep using fetch — no base64 available
      // from the document picker for those.
      const buffer = base64
        ? decodeBase64(base64)
        : await (await fetch(uri)).arrayBuffer();
      const ext = mime === 'application/pdf' ? 'pdf' : (mime.split('/')[1] || 'jpg');
      const fullPath = `${storagePath}.${ext}`;
      const { error } = await supabase.storage
        .from('verification-docs')
        .upload(fullPath, buffer, { contentType: mime, upsert: true });
      if (error) throw error;
      return { ok: true, path: fullPath };
    } catch (e: any) {
      const message = e?.message ?? 'Upload failed';
      Sentry.captureException(
        e instanceof Error ? e : new Error(message),
        { tags: { feature: 'get-verified-upload' }, extra: { storagePath, mime, hadBase64: !!base64 } }
      );
      return { ok: false, error: message };
    }
  }

  // Reuses the document already on file when the user hasn't picked a
  // replacement (uri is still the KEPT_DOC sentinel) -- redoing all four
  // steps because one document was wrong is exactly what this avoids.
  async function resolveDoc(
    uri: string, mime: string, storagePath: string, base64: string | null, existingPath: string | null
  ): Promise<UploadResult> {
    if (uri === KEPT_DOC) {
      return existingPath
        ? { ok: true, path: existingPath }
        : { ok: false, error: 'No document on file' };
    }
    return uploadFile(uri, mime, storagePath, base64);
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    // Defensive: nothing currently routes an approved contractor to this
    // screen (see the render below), but resubmitting would silently
    // reset them to pending_review if something ever did.
    if (verificationStatus === 'approved') return;

    setSubmitting(true);
    try {
      const uid = contractorId;
      if (!uid) throw new Error('Not logged in');

      const [licRes, insRes, idRes] = await Promise.all([
        resolveDoc(licenseDocUri, licenseDocMime, `verification/${uid}/license`,   licenseDocB64, existingLicenseDocPath),
        resolveDoc(insDocUri,     insDocMime,     `verification/${uid}/insurance`, insDocB64,     existingInsDocPath),
        resolveDoc(govIdUri,      govIdMime,      `verification/${uid}/id`,        govIdB64,      existingIdDocPath),
      ]);

      const failed = [
        !licRes.ok && `Trade License (${licRes.error})`,
        !insRes.ok && `Insurance (${insRes.error})`,
        !idRes.ok  && `Government ID (${idRes.error})`,
      ].filter(Boolean) as string[];

      if (failed.length > 0) {
        Alert.alert('Upload failed', `Could not upload: ${failed.join(', ')}. Please try again.`);
        return;
      }

      const licPath = (licRes as { ok: true; path: string }).path;
      const insPath = (insRes as { ok: true; path: string }).path;
      const idPath  = (idRes  as { ok: true; path: string }).path;

      const expiryDate = `${expiryYear}-${String(expiryMonth).padStart(2, '0')}-01`;

      const { error: upsertErr } = await supabase
        .from('contractor_verification')
        .upsert({
          contractor_id:      uid,
          status:             'pending_review',
          license_number:     licenseNumber.trim(),
          license_state:      licenseState,
          license_doc_path:   licPath,
          insurance_provider: insuranceProvider.trim(),
          insurance_expiry:   expiryDate,
          insurance_doc_path: insPath,
          id_doc_path:        idPath,
          years_in_business:  parseInt(yearsInBusiness) || null,
          submitted_at:       new Date().toISOString(),
        }, { onConflict: 'contractor_id' });

      if (upsertErr) throw upsertErr;

      await supabase
        .from('contractors')
        .update({ verification_status: 'pending_review', years_in_business: parseInt(yearsInBusiness) || null })
        .eq('id', uid);

      setStep(TOTAL_STEPS); // success
    } catch (err: any) {
      Alert.alert('Submission failed', err.message ?? 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Skip ──────────────────────────────────────────────────────────────────────

  function handleSkip() {
    Alert.alert(
      'Skip Verification?',
      "You can finish this later from your profile, but you won't be able to accept jobs until your account is verified.",
      [
        { text: 'Continue Verifying', style: 'cancel' },
        { text: 'Skip for Now', style: 'destructive', onPress: () => router.replace('/(tabs)') },
      ]
    );
  }

  // ── Loading existing application ────────────────────────────────────────────

  if (loadingExisting) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: C.background }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={C.orange} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  // ── Already verified — block entirely ───────────────────────────────────────
  // The priority fix: nothing should let an approved contractor land back on
  // this form and silently reset themselves to pending_review by submitting
  // again.
  if (verificationStatus === 'approved') {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: C.background }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP[8] }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(34,197,94,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: SP[6] }}>
            <Ionicons name="shield-checkmark" size={52} color="#22C55E" />
          </View>
          <Text style={{ fontSize: TY['2xl'], fontWeight: Font.black, color: C.textPrimary, textAlign: 'center', marginBottom: SP[3] }}>
            Already Verified
          </Text>
          <Text style={{ fontSize: TY.base, color: C.textSecondary, textAlign: 'center', lineHeight: 26, marginBottom: SP[8] }}>
            Your account is already verified. There&apos;s nothing to resubmit.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: C.orange, borderRadius: Radius.lg, paddingVertical: SP[4], paddingHorizontal: SP[8] }}
            onPress={() => router.replace('/profile/verification-status')}
          >
            <Text style={{ fontSize: TY.md, fontWeight: Font.black, color: '#fff' }}>View Verification Status</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Success screen ────────────────────────────────────────────────────────────

  if (step === TOTAL_STEPS) {
    return (
      <SafeAreaView style={[st.container, { backgroundColor: C.background }]} edges={['top']}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP[8] }}>
          <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(34,197,94,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: SP[6] }}>
            <Ionicons name="checkmark-circle" size={52} color="#22C55E" />
          </View>
          <Text style={{ fontSize: TY['2xl'], fontWeight: Font.black, color: C.textPrimary, textAlign: 'center', marginBottom: SP[3] }}>
            Under Review
          </Text>
          <Text style={{ fontSize: TY.base, color: C.textSecondary, textAlign: 'center', lineHeight: 26, marginBottom: SP[8] }}>
            Your application is being reviewed by the Tradease team. We'll notify you within 24 hours once approved.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: C.orange, borderRadius: Radius.lg, paddingVertical: SP[4], paddingHorizontal: SP[8] }}
            onPress={() => router.replace('/(tabs)/profile')}
          >
            <Text style={{ fontSize: TY.md, fontWeight: Font.black, color: '#fff' }}>Back to Profile</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Editing an existing application changes the framing (title, submit
  // label) but not the steps themselves -- same four steps either way.
  const isEditingPending = verificationStatus === 'pending_review';
  const isResubmitting   = verificationStatus === 'rejected';
  const submitLabel = isEditingPending ? 'Save Changes' : isResubmitting ? 'Resubmit for Review' : 'Submit for Review';

  // ── Step definitions ──────────────────────────────────────────────────────────

  const stepTitles    = ['Business Info', 'Trade License', 'Insurance', 'Government ID'];
  const stepSubtitles = [
    'Confirm your business details before we begin.',
    'Enter your license number and upload your license document.',
    'Provide your insurance details and upload your certificate.',
    'Upload a government-issued photo ID to verify your identity.',
  ];
  const stepIcons = ['business-outline', 'ribbon-outline', 'shield-outline', 'card-outline'];

  const stepContent = [
    // Step 1 — Business Info
    <>
      <Field label="Business Name" value={businessName} onChangeText={setBusinessName} placeholder="Smith Plumbing LLC" C={C} />
      <Field label="Years in Business" value={yearsInBusiness} onChangeText={setYearsInBusiness} placeholder="e.g. 5" keyboardType="number-pad" maxLength={2} C={C} />
      <View style={{ marginBottom: SP[4] }}>
        <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>PRIMARY TRADE</Text>
        <View style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: SP[4], paddingVertical: SP[4], flexDirection: 'row', alignItems: 'center', gap: SP[2] }}>
          <Ionicons name="lock-closed-outline" size={14} color={C.textMuted} />
          <Text style={{ fontSize: TY.base, color: primaryTrade ? C.textPrimary : C.textMuted }}>
            {primaryTrade || 'Not set on profile'}
          </Text>
        </View>
      </View>
      <View style={st.note}>
        <Ionicons name="information-circle-outline" size={14} color={C.textMuted} />
        <Text style={[st.noteText, { color: C.textMuted }]}>Edit your trade type in your company profile before submitting.</Text>
      </View>
    </>,

    // Step 2 — License
    <>
      <Field label="License Number" value={licenseNumber} onChangeText={setLicenseNumber} placeholder="Enter it exactly as issued" maxLength={30} hint="No need to reformat it — dashes or spaces are fine either way" C={C} />
      <View style={{ marginBottom: SP[4] }}>
        <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>ISSUING STATE</Text>
        <TouchableOpacity
          style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, paddingHorizontal: SP[4], paddingVertical: SP[4], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
          onPress={() => setStateOpen(!stateOpen)}
        >
          <Text style={{ fontSize: TY.base, color: licenseState ? C.textPrimary : C.textMuted }}>
            {licenseState || 'Select state'}
          </Text>
          <Ionicons name={stateOpen ? 'chevron-up' : 'chevron-down'} size={16} color={C.textMuted} />
        </TouchableOpacity>
        {stateOpen && (
          <View style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: C.border, marginTop: SP[1], maxHeight: 180, overflow: 'hidden' }}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
              {US_STATES.map((st, i) => (
                <TouchableOpacity
                  key={st}
                  style={{ paddingHorizontal: SP[4], paddingVertical: SP[3], borderTopWidth: i > 0 ? 0.5 : 0, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-between' }}
                  onPress={() => { setLicenseState(st); setStateOpen(false); }}
                >
                  <Text style={{ fontSize: TY.base, color: licenseState === st ? C.orange : C.textPrimary, fontWeight: licenseState === st ? Font.bold : Font.regular }}>
                    {st}
                  </Text>
                  {licenseState === st && <Ionicons name="checkmark" size={16} color={C.orange} />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
      <UploadField
        label="License Document"
        uri={licenseDocUri}
        fileName={licenseDocName}
        onPickImage={() => pickImage(setLicenseDocUri, setLicenseDocName, setLicenseDocMime, setLicenseDocB64)}
        onPickDoc={() => pickDoc(setLicenseDocUri, setLicenseDocName, setLicenseDocMime, setLicenseDocB64)}
        C={C}
      />
    </>,

    // Step 3 — Insurance
    <>
      <Field label="Insurance Provider" value={insuranceProvider} onChangeText={setInsuranceProvider} placeholder="e.g. State Farm" C={C} />
      <View style={{ marginBottom: SP[4] }}>
        <Text style={{ fontSize: TY.xs, fontWeight: Font.black, color: C.textSecondary, letterSpacing: 0.8, marginBottom: SP[2] }}>POLICY EXPIRY DATE</Text>
        <TouchableOpacity
          style={{ backgroundColor: C.surfaceAlt, borderRadius: Radius.md, borderWidth: 0.5, borderColor: expiryMonth > 0 ? C.orange : C.border, paddingHorizontal: SP[4], paddingVertical: SP[4], flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: showDatePicker ? SP[2] : 0 }}
          onPress={() => setShowDatePicker(!showDatePicker)}
        >
          <Text style={{ fontSize: TY.base, color: expiryMonth > 0 ? C.textPrimary : C.textMuted }}>
            {expiryMonth > 0 ? `${MONTHS[expiryMonth - 1]} ${expiryYear}` : 'Select expiry date'}
          </Text>
          <Ionicons name={showDatePicker ? 'chevron-up' : 'calendar-outline'} size={16} color={expiryMonth > 0 ? C.orange : C.textMuted} />
        </TouchableOpacity>
        {showDatePicker && (
          <MonthYearPicker
            month={expiryMonth}
            year={expiryYear}
            onSelect={(m, y) => { setExpiryMonth(m); setExpiryYear(y); setShowDatePicker(false); }}
            C={C}
          />
        )}
      </View>
      <UploadField
        label="Insurance Certificate"
        uri={insDocUri}
        fileName={insDocName}
        onPickImage={() => pickImage(setInsDocUri, setInsDocName, setInsDocMime, setInsDocB64)}
        onPickDoc={() => pickDoc(setInsDocUri, setInsDocName, setInsDocMime, setInsDocB64)}
        C={C}
      />
      <View style={st.note}>
        <Ionicons name="lock-closed-outline" size={14} color={C.textMuted} />
        <Text style={[st.noteText, { color: C.textMuted }]}>Your certificate is stored securely and only reviewed by Tradease staff.</Text>
      </View>
    </>,

    // Step 4 — Government ID
    <>
      <UploadField
        label="Government-Issued Photo ID"
        uri={govIdUri}
        fileName={govIdName}
        onPickImage={() => pickImage(setGovIdUri, setGovIdName, setGovIdMime, setGovIdB64)}
        onPickDoc={() => pickDoc(setGovIdUri, setGovIdName, setGovIdMime, setGovIdB64)}
        C={C}
      />
      <View style={[st.note, { marginTop: SP[2] }]}>
        <Ionicons name="shield-checkmark-outline" size={14} color={C.textMuted} />
        <Text style={[st.noteText, { color: C.textMuted }]}>
          Accepted: driver's license, passport, state ID. Your ID is encrypted at rest and never shared publicly.
        </Text>
      </View>
    </>,
  ];

  return (
    <SafeAreaView style={[st.container, { backgroundColor: C.background }]} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Header */}
        <View style={[st.header, { borderBottomColor: C.border }]}>
          <TouchableOpacity onPress={() => step === 0 ? router.canGoBack() ? router.back() : router.replace('/(tabs)') : setStep(step - 1)} style={st.backBtn}>
            <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginHorizontal: SP[4] }}>
            <ProgressBar step={step} total={TOTAL_STEPS} C={C} />
          </View>
          <Text style={{ fontSize: TY.xs, color: C.textMuted, fontWeight: Font.bold, minWidth: 40, textAlign: 'right' }}>
            {step + 1} / {TOTAL_STEPS}
          </Text>
        </View>

        <TouchableOpacity onPress={handleSkip} style={{ alignSelf: 'flex-end', paddingHorizontal: SP[5], paddingTop: SP[3] }}>
          <Text style={{ fontSize: TY.sm, color: C.textMuted, fontWeight: Font.semibold }}>Skip for now</Text>
        </TouchableOpacity>

        {isEditingPending && (
          <View style={{ marginHorizontal: SP[5], marginTop: SP[3], flexDirection: 'row', gap: SP[2], backgroundColor: 'rgba(251,191,36,0.08)', borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(251,191,36,0.25)', padding: SP[3], alignItems: 'flex-start' }}>
            <Ionicons name="time-outline" size={16} color="#FBBF24" />
            <Text style={{ flex: 1, fontSize: TY.sm, color: '#FBBF24', lineHeight: 19 }}>
              Editing your pending application. It's already under review — changes here update it in place.
            </Text>
          </View>
        )}

        {isResubmitting && (
          <View style={{ marginHorizontal: SP[5], marginTop: SP[3], flexDirection: 'row', gap: SP[2], backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: Radius.md, borderWidth: 1, borderColor: 'rgba(239,68,68,0.25)', padding: SP[3], alignItems: 'flex-start' }}>
            <Ionicons name="alert-circle-outline" size={16} color="#EF4444" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TY.sm, fontWeight: Font.bold, color: '#EF4444', marginBottom: 2 }}>Previously rejected</Text>
              <Text style={{ fontSize: TY.sm, color: '#EF4444', lineHeight: 19 }}>
                {rejectionReason || 'See the issue below, fix it, and resubmit.'} Everything else from your last submission is pre-filled — only change what needs fixing.
              </Text>
            </View>
          </View>
        )}

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: SP[5], paddingTop: SP[6], paddingBottom: SP[10] }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Step icon + title */}
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(255,98,0,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: SP[4] }}>
            <Ionicons name={stepIcons[step] as any} size={28} color={C.orange} />
          </View>
          <Text style={{ fontSize: TY.xl, fontWeight: Font.black, color: C.textPrimary, marginBottom: SP[2] }}>
            {stepTitles[step]}
          </Text>
          <Text style={{ fontSize: TY.base, color: C.textSecondary, lineHeight: 22, marginBottom: SP[6] }}>
            {stepSubtitles[step]}
          </Text>

          {stepContent[step]}
        </ScrollView>

        {/* Footer */}
        <View style={[st.footer, { borderTopColor: C.border }]}>
          <TouchableOpacity
            style={[st.nextBtn, { backgroundColor: canProceed() ? C.orange : C.border }]}
            onPress={() => step === TOTAL_STEPS - 1 ? handleSubmit() : setStep(step + 1)}
            disabled={!canProceed() || submitting}
          >
            {submitting
              ? <ActivityIndicator color="#fff" size="small" />
              : <>
                  <Text style={st.nextBtnText}>
                    {step === TOTAL_STEPS - 1 ? submitLabel : 'Continue'}
                  </Text>
                  <Ionicons name={step === TOTAL_STEPS - 1 ? 'checkmark' : 'arrow-forward'} size={18} color="#fff" />
                </>
            }
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container:   { flex: 1 },
  header:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: SP[5], paddingVertical: SP[4], borderBottomWidth: 0.5 },
  backBtn:     { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  footer:      { paddingHorizontal: SP[5], paddingBottom: 34, paddingTop: SP[3], borderTopWidth: 0.5 },
  nextBtn:     { borderRadius: Radius.lg, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SP[2] },
  nextBtnText: { fontSize: TY.base, fontWeight: Font.black, color: '#fff' },
  note:        { flexDirection: 'row', gap: SP[2], backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: Radius.sm, padding: SP[3] },
  noteText:    { flex: 1, fontSize: TY.xs, lineHeight: 17 },
});
