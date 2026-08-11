import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated, Dimensions,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Spacing } from '../constants/Layout';
import { Colors, Font, Radius } from '../constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { haversine } from '../lib/geo';
import {
  ALL_TRADES,
  PRICE_RANGES,
  PriceRange,
  TIME_SLOTS,
  TimeSlot,
  TRADE_ICONS,
  TRADE_JOBS,
  TradeJob,
} from '../lib/tradeJobs';

const { width } = Dimensions.get('window');
const STEPS = ['Trade', 'Service', 'Details', 'Review'];

function ProgressBar({ step }: { step: number }) {
  return (
    <View style={styles.progressWrap}>
      {STEPS.map((label, i) => (
        <View key={label} style={styles.progressItem}>
          <View style={[styles.progressDot, i <= step && styles.progressDotActive]}>
            {i < step
              ? <Text style={styles.progressCheck}>✓</Text>
              : <Text style={[styles.progressNum, i === step && styles.progressNumActive]}>{i + 1}</Text>
            }
          </View>
          <Text style={[styles.progressLabel, i === step && styles.progressLabelActive]}>{label}</Text>
          {i < STEPS.length - 1 && (
            <View style={[styles.progressLine, i < step && styles.progressLineActive]} />
          )}
        </View>
      ))}
    </View>
  );
}

export default function CreateJobScreen() {
  const { colors: Colors } = useTheme();
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ trade?: string; draftId?: string; resume?: string }>();

  const [step, setStep] = useState(params.trade ? 1 : 0);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(params.draftId ?? null);
  const [detectingLocation, setDetectingLocation] = useState(false);

  // Selections
  const [selectedTrade, setSelectedTrade] = useState(params.trade ?? '');
  const [selectedJob, setSelectedJob] = useState<TradeJob | null>(null);
  const [selectedPrice, setSelectedPrice] = useState<PriceRange | null>(null);
  const [selectedTime, setSelectedTime] = useState<TimeSlot | null>(null);
  const [detectedCoords, setDetectedCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');

  const [showAuthSheet, setShowAuthSheet] = useState(false);
  const [isInstantBook,    setIsInstantBook]    = useState(false);
  const [instantBookPrice, setInstantBookPrice] = useState('');

  const [matchedContractors,  setMatchedContractors]  = useState<any[]>([]);
  const [sortByNearest,       setSortByNearest]       = useState(false);
  const [specialtyPricing,    setSpecialtyPricing]    = useState<{ price_min: number; price_max: number; price_common: number; unit: string } | null>(null);
  const [areaContractorCount, setAreaContractorCount] = useState<number | null>(null);
  const [loadingContractors,  setLoadingContractors]  = useState(false);
  const [selectedImages,      setSelectedImages]      = useState<string[]>([]);
  const [selectedDate,        setSelectedDate]        = useState<Date | null>(null);
  const [uploadingPhotos,     setUploadingPhotos]     = useState(false);
  const areaCountTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slideAnim = useRef(new Animated.Value(0)).current;

  // Load existing draft when draftId param is provided
  useEffect(() => {
    if (!params.draftId) return;
    (async () => {
      const { data: draft } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', params.draftId!)
        .single();
      if (!draft) return;
      setSelectedTrade(draft.trade ?? '');
      setAddress(draft.notes ?? '');
      // Description is stored as "JobLabel: free text" — recover free text portion
      const colonIdx = (draft.description ?? '').indexOf(': ');
      setDescription(colonIdx >= 0 ? draft.description.slice(colonIdx + 2) : (draft.description ?? ''));
      // Match price range and time slot by stored values
      const allPrices = draft.trade ? (PRICE_RANGES[draft.trade] ?? []) : [];
      setSelectedPrice(allPrices.find((p: any) => p.max === draft.price_estimate) ?? null);
      setSelectedTime(TIME_SLOTS.find(t => t.label === draft.booking_time) ?? null);
      // Match specific job from trade jobs list
      const tradeJobs = draft.trade ? (TRADE_JOBS[draft.trade] ?? []) : [];
      setSelectedJob(tradeJobs.find((j: any) => (draft.description ?? '').startsWith(j.label + ':')) ?? null);
      // Jump to review if complete, otherwise to the furthest filled step
      if (draft.trade && draft.price_estimate && draft.notes) setStep(3);
      else if (draft.trade) setStep(1);
    })();
  }, []);

  // Fetch matched contractors + specialty pricing when trade + job are both selected
  useEffect(() => {
    if (!selectedTrade || !selectedJob) {
      setMatchedContractors([]);
      setSpecialtyPricing(null);
      return;
    }
    let cancelled = false;
    setLoadingContractors(true);
    (async () => {
      const [{ data: contractors }, { data: pricing }] = await Promise.all([
        supabase
          .from('contractors_public')
          .select('id, company_name, avatar_url, rating, specializations, service_area, lat, lng')
          .eq('verification_status', 'approved')
          .eq('is_available', true),
        supabase
          .from('specialty_pricing')
          .select('price_min, price_max, price_common, unit')
          .eq('trade', selectedTrade)
          .eq('specialty', selectedJob.label)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const matched = (contractors ?? []).filter(c =>
        Array.isArray(c.specializations) && c.specializations.includes(selectedJob.label)
      );
      setMatchedContractors(matched);
      setLoadingContractors(false);
      if (pricing) {
        setSpecialtyPricing(pricing);
        const ranges = PRICE_RANGES[selectedTrade] ?? [];
        const best = (ranges as any[]).find(r => r.min <= pricing.price_common && pricing.price_common <= r.max)
          ?? (ranges as any[]).find(r => pricing.price_common <= r.max)
          ?? null;
        if (best) setSelectedPrice(best);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedTrade, selectedJob?.label]);

  // Debounced area contractor count — triggers when address changes
  useEffect(() => {
    if (areaCountTimerRef.current) clearTimeout(areaCountTimerRef.current);
    if (!address.trim()) { setAreaContractorCount(null); return; }
    areaCountTimerRef.current = setTimeout(async () => {
      const parts = address.split(',');
      const city  = parts.length >= 2 ? parts[parts.length - 2]?.trim() : '';
      const zipM  = address.match(/\b\d{5}\b/);
      const zip   = zipM?.[0] ?? '';
      const term  = city || zip;
      if (!term) { setAreaContractorCount(null); return; }
      const { count } = await supabase
        .from('contractors_public')
        .select('id', { count: 'exact', head: true })
        .eq('verification_status', 'approved')
        .eq('is_available', true)
        .ilike('service_area', `%${term}%`);
      setAreaContractorCount(count ?? 0);
    }, 800);
    return () => { if (areaCountTimerRef.current) clearTimeout(areaCountTimerRef.current); };
  }, [address]);

  const animateNext = () => {
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: -30, duration: 100, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  };

  const handleNext = () => {
    if (step === 0 && !selectedTrade) {
      Alert.alert('Select a Trade', 'Please choose the type of service you need.');
      return;
    }
    if (step === 1 && !selectedJob) {
      Alert.alert('Select a Service', 'Please choose the specific service you need.');
      return;
    }
    if (step === 2) {
      if (isInstantBook) {
        const p = parseInt(instantBookPrice.replace(/[^0-9]/g, ''), 10);
        if (!p || p <= 0) { Alert.alert('Enter Price', 'Please enter a fixed price for Instant Book.'); return; }
      } else {
        if (!selectedPrice) { Alert.alert('Select Budget', 'Please choose your budget range.'); return; }
      }
      if (!selectedTime) { Alert.alert('Select Time', 'Please choose when you need the work done.'); return; }
      if (!address.trim()) { Alert.alert('Add Address', 'Please enter or detect your address.'); return; }
    }
    animateNext();
    setStep(s => s + 1);
  };


  const detectLocation = async () => {
    setDetectingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Enable location in Settings.');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setDetectedCoords({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      const [addr] = await Location.reverseGeocodeAsync(loc.coords);
      if (addr) {
        setAddress(`${addr.streetNumber ?? ''} ${addr.street ?? ''}, ${addr.city ?? ''}, ${addr.region ?? ''} ${addr.postalCode ?? ''}`.trim());
      }
    } catch {
      Alert.alert('Error', 'Could not detect location.');
    } finally {
      setDetectingLocation(false);
    }
  };

  const toggleSortByNearest = async () => {
    if (!sortByNearest && !detectedCoords) {
      await detectLocation();
    }
    setSortByNearest(v => !v);
  };

  const sortedMatchedContractors = (sortByNearest && detectedCoords)
    ? [...matchedContractors]
        .map(c => ({
          ...c,
          distance_miles: (c.lat != null && c.lng != null)
            ? haversine(detectedCoords.lat, detectedCoords.lng, c.lat, c.lng)
            : null,
        }))
        .sort((a, b) => (a.distance_miles ?? Infinity) - (b.distance_miles ?? Infinity))
    : matchedContractors;

  const pickImages = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo access in Settings to attach job photos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as any,
      allowsMultipleSelection: true,
      quality: 0.7,
      selectionLimit: 4,
    });
    if (!result.canceled) {
      setSelectedImages(result.assets.map(a => a.uri));
    }
  };

  const removeImage = (uri: string) => {
    setSelectedImages(prev => prev.filter(u => u !== uri));
  };

  // Persists guest form state to AsyncStorage so it survives auth redirect
  const saveGuestDraft = async () => {
    await AsyncStorage.setItem('guestPendingJob', JSON.stringify({
      selectedTrade, selectedJob, selectedPrice, selectedTime,
      address, description, detectedCoords,
    }));
  };

  // Restore a previously saved guest draft after the user logs in
  useEffect(() => {
    if (!user || params.resume !== '1') return;
    (async () => {
      const raw = await AsyncStorage.getItem('guestPendingJob');
      if (!raw) return;
      await AsyncStorage.removeItem('guestPendingJob');
      const d = JSON.parse(raw);
      if (d.selectedTrade) setSelectedTrade(d.selectedTrade);
      if (d.selectedJob)   setSelectedJob(d.selectedJob);
      if (d.selectedPrice) setSelectedPrice(d.selectedPrice);
      if (d.selectedTime)  setSelectedTime(d.selectedTime);
      if (d.address)       setAddress(d.address);
      if (d.description)   setDescription(d.description);
      if (d.detectedCoords) setDetectedCoords(d.detectedCoords);
      const s = d.selectedTrade && d.selectedJob && d.selectedPrice && d.selectedTime && d.address
        ? 3 : d.selectedTrade && d.selectedJob ? 2 : d.selectedTrade ? 1 : 0;
      setStep(s);
    })();
  }, [user?.id]);

  // Saves current form state as a draft booking row (insert or update)
  const saveDraft = async (): Promise<string | null> => {
    if (!user || !selectedTrade) return null;
    const { data: profile } = await supabase.from('users').select('full_name, phone').eq('id', user.id).single();
    const fullDesc = selectedJob
      ? `${selectedJob.label}: ${description.trim() || selectedJob.description}`
      : description.trim() || selectedTrade;
    let coords = detectedCoords;
    if (!coords && address.trim()) {
      try {
        const results = await Location.geocodeAsync(address);
        if (results.length > 0) coords = { lat: results[0].latitude, lng: results[0].longitude };
      } catch {}
    }
    const payload: any = {
      customer_id:    user.id,
      user_id:        user.id,
      customer_name:  profile?.full_name ?? user.email,
      customer_phone: profile?.phone ?? '',
      trade:          selectedTrade,
      description:    fullDesc,
      notes:          address,
      job_lat:        coords?.lat ?? null,
      job_lng:        coords?.lng ?? null,
      price_estimate: selectedPrice?.max ?? null,
      booking_time:   selectedTime?.label ?? '',
      status:         'draft',
      payment_status: 'unpaid',
      refund_status:  'none',
    };
    if (draftId) {
      await supabase.from('bookings').update(payload).eq('id', draftId);
      return draftId;
    }
    const { data, error } = await supabase.from('bookings').insert(payload).select().single();
    if (!error && data) { setDraftId(data.id); return data.id as string; }
    return null;
  };

  // Handles back navigation — prompts to save when leaving with selections
  const handleBack = () => {
    if (step > 0) { setStep(s => s - 1); return; }
    if (!selectedTrade) { router.canGoBack() ? router.back() : router.replace('/(tabs)'); return; }

    if (!user) {
      Alert.alert('Save your progress?', 'Your job details will be saved. Create an account to post it when you\'re ready.', [
        { text: 'Discard', style: 'destructive', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)') },
        { text: 'Save & Sign Up', onPress: async () => { await saveGuestDraft(); setShowAuthSheet(true); } },
        { text: 'Keep Editing', style: 'cancel' },
      ]);
      return;
    }

    Alert.alert('Save Draft?', 'Save your progress so you can finish it later.', [
      { text: 'Discard', style: 'destructive', onPress: () => router.canGoBack() ? router.back() : router.replace('/(tabs)') },
      {
        text: 'Save Draft', onPress: async () => {
          setSaving(true);
          await saveDraft();
          setSaving(false);
          router.replace('/(tabs)/jobs' as any);
        },
      },
      { text: 'Keep Editing', style: 'cancel' },
    ]);
  };

  const handlePost = async (action: 'post' | 'find' | 'draft') => {
    if (!user) {
      await saveGuestDraft();
      setShowAuthSheet(true);
      return;
    }

    // Confirm before committing a real job post
    if (action === 'post' || action === 'find') {
      if (!selectedTrade) { Alert.alert('Select a Trade', 'Please choose the type of service you need.'); return; }
      if (!selectedJob)   { Alert.alert('Select a Service', 'Please choose the specific service you need.'); return; }
      if (!selectedPrice) { Alert.alert('Select Budget', 'Please choose your budget range.'); return; }
      if (!selectedTime)  { Alert.alert('Select Time', 'Please choose when you need the work done.'); return; }
      if (!address.trim()){ Alert.alert('Add Address', 'Please enter or detect your address.'); return; }

      const summary = [
        `${TRADE_ICONS[selectedTrade] ?? '🔧'} ${selectedJob.label}`,
        `💰 ${selectedPrice.label}`,
        `🕐 ${selectedTime.label}`,
        `📍 ${address.trim()}`,
      ].join('\n');

      const confirmed = await new Promise<boolean>(resolve =>
        Alert.alert(
          action === 'post' ? 'Post this job?' : 'Find a contractor?',
          `${summary}\n\nThis will be visible to contractors. Only post if you\'re ready to hire.`,
          [
            { text: 'Review', style: 'cancel', onPress: () => resolve(false) },
            { text: action === 'post' ? 'Post Job' : 'Find Contractor', onPress: () => resolve(true) },
          ],
        )
      );
      if (!confirmed) return;
    }

    setSaving(true);
    try {
      // Verify fresh session — bookings INSERT requires auth.uid() at the RLS layer
      const { data: { user: freshUser } } = await supabase.auth.getUser();
      if (!freshUser) {
        setSaving(false);
        Alert.alert('Session Expired', 'Your session has expired. Please log in again.', [
          { text: 'Log In', onPress: () => router.replace('/login') },
        ]);
        return;
      }

      // Save as draft and redirect to Jobs → Draft tab
      if (action === 'draft') {
        const id = await saveDraft();
        setSaving(false);
        if (id) router.replace('/(tabs)/jobs' as any);
        return;
      }

      // Get customer info
      const { data: profile } = await supabase
        .from('users')
        .select('full_name, phone')
        .eq('id', freshUser.id)
        .single();

      const fullDesc = `${selectedJob!.label}: ${description.trim() || selectedJob!.description}`;

      // Geocode address if no GPS coords yet
      let coords = detectedCoords;
      if (!coords && address.trim()) {
        try {
          const results = await Location.geocodeAsync(address);
          if (results.length > 0) {
            coords = { lat: results[0].latitude, lng: results[0].longitude };
          }
        } catch {}
      }

      // Upload photos if any were selected
      let photoUrls: string[] = [];
      if (selectedImages.length > 0) {
        setUploadingPhotos(true);
        const bookingRef = draftId ?? `new_${Date.now()}`;
        for (const uri of selectedImages) {
          try {
            const ext  = uri.split('.').pop()?.toLowerCase() ?? 'jpg';
            const path = `${bookingRef}/${Date.now()}.${ext}`;
            const res  = await fetch(uri);
            const blob = await res.blob();
            const { error: uploadErr } = await supabase.storage
              .from('job-photos')
              .upload(path, blob, { contentType: `image/${ext}`, upsert: true });
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from('job-photos').getPublicUrl(path);
              if (urlData?.publicUrl) photoUrls.push(urlData.publicUrl);
            }
          } catch {}
        }
        setUploadingPhotos(false);
      }

      const ibPrice = isInstantBook ? parseInt(instantBookPrice.replace(/[^0-9]/g, ''), 10) : null;
      // Drafts return earlier (line ~404-409) and never reach this payload.
      // 'post' = public listing, 48h window. 'find' = direct request, 24h window.
      const requestMode = action === 'post' ? 'post' : 'request';
      const windowHours = action === 'post' ? 48 : 24;
      const bookingPayload = {
        customer_id:         freshUser.id,
        user_id:             freshUser.id,
        customer_name:       profile?.full_name ?? freshUser.email ?? user?.email,
        customer_phone:      profile?.phone ?? '',
        trade:               selectedTrade,
        description:         fullDesc,
        notes:               address,
        job_lat:             coords?.lat ?? null,
        job_lng:             coords?.lng ?? null,
        price_estimate:      isInstantBook ? (ibPrice ?? 0) : (selectedPrice?.max ?? 0),
        booking_time:        selectedDate
          ? `${selectedTime?.label} · ${selectedDate.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}`
          : (selectedTime?.label ?? ''),
        status:              'pending',
        payment_status:      'unpaid',
        refund_status:       'none',
        is_instant_book:     isInstantBook,
        instant_book_price:  ibPrice,
        request_mode:        requestMode,
        request_expires_at:  new Date(Date.now() + windowHours * 60 * 60 * 1000).toISOString(),
        ...(photoUrls.length > 0 ? { photo_urls: photoUrls } : {}),
      };

      // If resuming a draft, promote it in place — no duplicate row
      const { data: insertResult, error } = draftId
        ? await supabase.from('bookings').update(bookingPayload).eq('id', draftId).select('id').single()
        : await supabase.from('bookings').insert(bookingPayload).select('id').single();

      if (error) throw error;
      if (!draftId && insertResult?.id) setDraftId(insertResult.id);

      if (action === 'post') {
        const bookingId = insertResult?.id ?? draftId;
        Alert.alert('Job Posted! 🎉', 'Contractors in your area will be notified.', [
          { text: 'View My Booking', onPress: () => router.replace(`/job/${bookingId}` as any) },
          { text: 'My Bookings', onPress: () => router.replace('/(tabs)/jobs' as any) },
        ]);
      } else {
        router.replace(`/find-contractor?trade=${encodeURIComponent(selectedTrade)}` as any);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setSaving(false);
    }
  };

  const tradeJobs = selectedTrade ? TRADE_JOBS[selectedTrade] ?? [] : [];
  const priceRanges = selectedTrade ? PRICE_RANGES[selectedTrade] ?? [] : [];

  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={handleBack}
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Job Card</Text>
          <View style={{ width: 40 }} />
        </View>
        <ProgressBar step={step} />
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ transform: [{ translateY: slideAnim }] }}>

          {/* ── STEP 0: Select Trade ── */}
          {step === 0 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>What do you need?</Text>
              <Text style={styles.stepSub}>Select the type of service you're looking for.</Text>
              <View style={styles.tradeGrid}>
                {ALL_TRADES.map((trade) => (
                  <TouchableOpacity
                    key={trade}
                    style={[styles.tradeCard, selectedTrade === trade && styles.tradeCardSelected]}
                    onPress={() => setSelectedTrade(trade)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.tradeCardIcon}>{TRADE_ICONS[trade]}</Text>
                    <Text style={[styles.tradeCardLabel, selectedTrade === trade && styles.tradeCardLabelSelected]}>
                      {trade}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* ── STEP 1: Select Job ── */}
          {step === 1 && (
            <View style={styles.stepContent}>
              <View style={styles.tradePill}>
                <Text style={styles.tradePillIcon}>{TRADE_ICONS[selectedTrade]}</Text>
                <Text style={styles.tradePillText}>{selectedTrade}</Text>
              </View>
              <Text style={styles.stepTitle}>What specifically?</Text>
              <Text style={styles.stepSub}>Choose the exact service you need.</Text>
              <View style={styles.jobList}>
                {tradeJobs.map((job) => (
                  <TouchableOpacity
                    key={job.id}
                    style={[styles.jobCard, selectedJob?.id === job.id && styles.jobCardSelected]}
                    onPress={() => setSelectedJob(job)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.jobCardIconBox, selectedJob?.id === job.id && styles.jobCardIconBoxSelected]}>
                      <Text style={styles.jobCardIcon}>{job.icon}</Text>
                    </View>
                    <View style={styles.jobCardInfo}>
                      <Text style={[styles.jobCardLabel, selectedJob?.id === job.id && styles.jobCardLabelSelected]}>
                        {job.label}
                      </Text>
                      <Text style={styles.jobCardDesc}>{job.description}</Text>
                    </View>
                    {selectedJob?.id === job.id && (
                      <View style={styles.jobCardCheck}>
                        <Text style={styles.jobCardCheckText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Matched contractor mini-cards */}
              {selectedJob && (loadingContractors ? (
                <View>
                  <Text style={styles.sectionLabel}>CONTRACTORS WHO SPECIALIZE IN THIS</Text>
                  <ActivityIndicator color={Colors.orange} style={{ marginTop: 8 }} />
                </View>
              ) : matchedContractors.length > 0 ? (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={styles.sectionLabel}>
                      CONTRACTORS WHO SPECIALIZE IN THIS ({matchedContractors.length})
                    </Text>
                    <TouchableOpacity
                      onPress={toggleSortByNearest}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: sortByNearest ? '700' : '500', color: sortByNearest ? Colors.orange : Colors.textMuted }}>
                        {detectingLocation ? 'Locating…' : 'Sort by nearest'}
                      </Text>
                      <Switch
                        value={sortByNearest}
                        onValueChange={toggleSortByNearest}
                        disabled={detectingLocation}
                      />
                    </TouchableOpacity>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginTop: 10 }}
                    contentContainerStyle={{ gap: 10, paddingRight: 4 }}
                    nestedScrollEnabled
                  >
                    {sortedMatchedContractors.map(c => {
                      const initials = (c.company_name ?? 'C')
                        .split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
                      return (
                        <View key={c.id} style={styles.contractorMiniCard}>
                          <View style={styles.contractorMiniAvatar}>
                            {c.avatar_url
                              ? <Image source={{ uri: c.avatar_url }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                              : <Text style={styles.contractorMiniInitials}>{initials}</Text>
                            }
                          </View>
                          <Text style={styles.contractorMiniName} numberOfLines={2}>{c.company_name}</Text>
                          {!!c.rating && (
                            <View style={styles.contractorMiniRatingRow}>
                              <Text style={{ fontSize: 10, color: Colors.orange }}>★</Text>
                              <Text style={styles.contractorMiniRatingText}>{Number(c.rating).toFixed(1)}</Text>
                            </View>
                          )}
                          {sortByNearest && c.distance_miles != null && (
                            <Text style={{ fontSize: 10, color: Colors.textMuted }}>
                              {c.distance_miles.toFixed(1)} mi
                            </Text>
                          )}
                          <TouchableOpacity
                            style={styles.contractorMiniViewBtn}
                            onPress={() => router.push(`/company/${c.id}` as any)}
                          >
                            <Text style={styles.contractorMiniViewText}>View</Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              ) : null)}
            </View>
          )}

          {/* ── STEP 2: Details ── */}
          {step === 2 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Job Details</Text>
              <Text style={styles.stepSub}>Set your budget, schedule, and location.</Text>

              {/* Instant Book Toggle */}
              <Text style={styles.sectionLabel}>BOOKING TYPE</Text>
              <View style={styles.instantBookRow}>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 15, fontWeight: Font.black, color: Colors.white }}>⚡ Instant Book</Text>
                    {isInstantBook && (
                      <View style={styles.ibBadge}>
                        <Text style={styles.ibBadgeText}>ON</Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: '#666', lineHeight: 17 }}>
                    Set a fixed price — first contractor to accept gets the job
                  </Text>
                </View>
                <Switch
                  value={isInstantBook}
                  onValueChange={setIsInstantBook}
                  thumbColor={isInstantBook ? Colors.orange : '#555'}
                  trackColor={{ false: '#2A2A2A', true: 'rgba(255,98,0,0.3)' }}
                />
              </View>

              {/* Budget / Fixed Price */}
              {isInstantBook ? (
                <>
                  <Text style={styles.sectionLabel}>FIXED PRICE</Text>
                  <View style={[styles.inputBox, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                    <Text style={{ fontSize: 22, fontWeight: Font.black, color: Colors.orange }}>$</Text>
                    <TextInput
                      style={[styles.addressInput, { fontSize: 24, fontWeight: Font.black, flex: 1 }]}
                      value={instantBookPrice}
                      onChangeText={setInstantBookPrice}
                      placeholder="0"
                      placeholderTextColor="#444"
                      keyboardType="number-pad"
                      selectionColor={Colors.orange}
                    />
                  </View>
                  <Text style={styles.pricingHint}>
                    Contractor accepts immediately at this price — no quote needed
                  </Text>
                  {specialtyPricing && (
                    <Text style={[styles.pricingHint, { color: Colors.orange }]}>
                      Typical range: ${specialtyPricing.price_min.toLocaleString()} – ${specialtyPricing.price_max.toLocaleString()} for this service
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>BUDGET RANGE</Text>
                  <View style={styles.optionGrid}>
                    {priceRanges.map((price) => (
                      <TouchableOpacity
                        key={price.id}
                        style={[styles.optionCard, selectedPrice?.id === price.id && styles.optionCardSelected]}
                        onPress={() => setSelectedPrice(price)}
                        activeOpacity={0.8}
                      >
                        <Text style={[styles.optionCardLabel, selectedPrice?.id === price.id && styles.optionCardLabelSelected]}>
                          {price.label}
                        </Text>
                        <Text style={[styles.optionCardSub, selectedPrice?.id === price.id && styles.optionCardSubSelected]}>
                          {price.display}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {specialtyPricing && (
                    <Text style={styles.pricingHint}>
                      Typical range: ${specialtyPricing.price_min.toLocaleString()} – ${specialtyPricing.price_max.toLocaleString()} for this service
                    </Text>
                  )}
                </>
              )}

              {/* Time */}
              <Text style={styles.sectionLabel}>WHEN DO YOU NEED IT?</Text>
              <View style={styles.timeList}>
                {TIME_SLOTS.map((slot) => (
                  <TouchableOpacity
                    key={slot.id}
                    style={[styles.timeCard, selectedTime?.id === slot.id && styles.timeCardSelected]}
                    onPress={() => setSelectedTime(slot)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.timeIcon}>{slot.icon}</Text>
                    <View style={styles.timeInfo}>
                      <Text style={[styles.timeLabel, selectedTime?.id === slot.id && styles.timeLabelSelected]}>
                        {slot.label}
                      </Text>
                      <Text style={styles.timeSub}>{slot.sub}</Text>
                    </View>
                    {selectedTime?.id === slot.id && (
                      <View style={styles.timeCheck}>
                        <Text style={styles.timeCheckText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Address */}
              <Text style={styles.sectionLabel}>JOB LOCATION</Text>
              <TouchableOpacity
                style={styles.detectBtn}
                onPress={detectLocation}
                disabled={detectingLocation}
                activeOpacity={0.85}
              >
                {detectingLocation
                  ? <ActivityIndicator color={Colors.background} size="small" />
                  : <Text style={styles.detectIcon}>📍</Text>}
                <Text style={styles.detectText}>
                  {detectingLocation ? 'Detecting...' : 'Auto-Detect My Location'}
                </Text>
              </TouchableOpacity>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.addressInput}
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Or enter address manually..."
                  placeholderTextColor="#444"
                  selectionColor={Colors.orange}
                  multiline
                />
              </View>
              {areaContractorCount !== null && (
                <Text style={styles.areaCountText}>
                  {areaContractorCount > 0
                    ? `${areaContractorCount} verified contractor${areaContractorCount === 1 ? '' : 's'} available in your area`
                    : 'No verified contractors found in this area yet'}
                </Text>
              )}

              {/* Preferred date for Today / This Week / Weekend */}
              {(selectedTime?.id === 'today' || selectedTime?.id === 'this_week' || selectedTime?.id === 'weekend') && (() => {
                const now = new Date();
                const days: Date[] = [];
                if (selectedTime.id === 'today') {
                  // Generate same-day time windows as selectable "dates"
                  ['Morning (9am–12pm)', 'Afternoon (12pm–5pm)', 'Evening (5pm–8pm)'].forEach((_, i) => {
                    const d = new Date(now);
                    d.setHours(9 + i * 4, 0, 0, 0);
                    days.push(d);
                  });
                } else {
                  // Next 7 days (for this_week / weekend)
                  for (let i = 1; i <= 7; i++) {
                    const d = new Date(now);
                    d.setDate(now.getDate() + i);
                    if (selectedTime.id === 'weekend') {
                      if (d.getDay() === 0 || d.getDay() === 6) days.push(d);
                    } else {
                      if (d.getDay() !== 0 && d.getDay() !== 6) days.push(d);
                    }
                  }
                }
                const labels = selectedTime.id === 'today'
                  ? ['Morning\n9am–12pm', 'Afternoon\n12pm–5pm', 'Evening\n5pm–8pm']
                  : days.map(d => `${d.toLocaleDateString('en-US',{weekday:'short'})}\n${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`);
                return (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={styles.sectionLabel}>PREFERRED DATE</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {days.map((d, i) => {
                        const isSelected = selectedDate?.toDateString() === d.toDateString() && (selectedTime.id === 'today' ? selectedDate?.getHours() === d.getHours() : true);
                        return (
                          <TouchableOpacity
                            key={i}
                            onPress={() => setSelectedDate(d)}
                            style={{
                              paddingHorizontal: 14, paddingVertical: 10,
                              borderRadius: 12, borderWidth: 1.5,
                              borderColor: isSelected ? Colors.orange : '#2A2A2A',
                              backgroundColor: isSelected ? 'rgba(255,98,0,0.12)' : '#141414',
                              minWidth: 72, alignItems: 'center',
                            }}
                            activeOpacity={0.8}
                          >
                            {labels[i].split('\n').map((line, li) => (
                              <Text key={li} style={{
                                fontSize: li === 0 ? 13 : 11,
                                fontWeight: li === 0 ? '700' : '500',
                                color: isSelected ? Colors.orange : (li === 0 ? Colors.white : '#666'),
                                textAlign: 'center',
                              }}>{line}</Text>
                            ))}
                          </TouchableOpacity>
                        );
                      })}
                      <TouchableOpacity
                        onPress={() => setSelectedDate(null)}
                        style={{
                          paddingHorizontal: 14, paddingVertical: 10,
                          borderRadius: 12, borderWidth: 1.5,
                          borderColor: !selectedDate ? Colors.orange : '#2A2A2A',
                          backgroundColor: !selectedDate ? 'rgba(255,98,0,0.12)' : '#141414',
                          minWidth: 72, alignItems: 'center',
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '700', color: !selectedDate ? Colors.orange : '#666' }}>Any</Text>
                        <Text style={{ fontSize: 11, color: !selectedDate ? Colors.orange : '#555' }}>Flexible</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })()}

              {/* Description */}
              <Text style={styles.sectionLabel}>DESCRIBE THE JOB (OPTIONAL)</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.descInput}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Any extra details that will help contractors understand what you need..."
                  placeholderTextColor="#444"
                  selectionColor={Colors.orange}
                  multiline
                  numberOfLines={4}
                />
              </View>

              {/* Photo upload */}
              <Text style={styles.sectionLabel}>ADD PHOTOS (OPTIONAL)</Text>
              <TouchableOpacity
                style={[styles.detectBtn, { backgroundColor: '#141414', borderColor: '#2A2A2A', borderWidth: 1 }]}
                onPress={pickImages}
                activeOpacity={0.85}
              >
                <Text style={styles.detectIcon}>📷</Text>
                <Text style={[styles.detectText, { color: '#AAA' }]}>
                  {selectedImages.length > 0 ? `${selectedImages.length} photo${selectedImages.length > 1 ? 's' : ''} selected — tap to change` : 'Add up to 4 photos'}
                </Text>
              </TouchableOpacity>
              {selectedImages.length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {selectedImages.map((uri, i) => (
                    <View key={i} style={{ position: 'relative' }}>
                      <Image source={{ uri }} style={{ width: 80, height: 80, borderRadius: 10 }} />
                      <TouchableOpacity
                        onPress={() => removeImage(uri)}
                        style={{
                          position: 'absolute', top: -6, right: -6,
                          width: 22, height: 22, borderRadius: 11,
                          backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 14 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              <Text style={{ fontSize: 11, color: '#555', marginTop: 6 }}>
                Help contractors see the problem — photos increase response rates.
              </Text>
            </View>
          )}

          {/* ── STEP 3: Review ── */}
          {step === 3 && (
            <View style={styles.stepContent}>
              <Text style={styles.stepTitle}>Review Your Job Card</Text>
              <Text style={styles.stepSub}>Confirm the details before posting.</Text>

              {/* Job Card preview */}
              <View style={styles.jobCardPreview}>
                <View style={styles.jobCardPreviewHeader}>
                  <View style={styles.jobCardPreviewTrade}>
                    <Text style={styles.jobCardPreviewTradeIcon}>{TRADE_ICONS[selectedTrade]}</Text>
                    <Text style={styles.jobCardPreviewTradeText}>{selectedTrade}</Text>
                  </View>
                  {isInstantBook ? (
                    <View style={[styles.urgentBadge, { backgroundColor: 'rgba(34,197,94,0.1)', borderColor: '#22C55E' }]}>
                      <Text style={[styles.urgentBadgeText, { color: '#22C55E' }]}>⚡ INSTANT</Text>
                    </View>
                  ) : (
                    <View style={styles.urgentBadge}>
                      <Text style={styles.urgentBadgeText}>NEW</Text>
                    </View>
                  )}
                </View>

                <Text style={styles.jobCardPreviewTitle}>{selectedJob?.label}</Text>
                <Text style={styles.jobCardPreviewDesc}>
                  {description.trim() || selectedJob?.description}
                </Text>

                <View style={styles.jobCardPreviewMeta}>
                  <View style={styles.jobCardPreviewMetaItem}>
                    <Text style={styles.jobCardPreviewMetaIcon}>📍</Text>
                    <Text style={styles.jobCardPreviewMetaText} numberOfLines={1}>{address}</Text>
                  </View>
                  <View style={styles.jobCardPreviewMetaItem}>
                    <Text style={styles.jobCardPreviewMetaIcon}>💰</Text>
                    <Text style={styles.jobCardPreviewMetaText}>{selectedPrice?.display}</Text>
                  </View>
                  <View style={styles.jobCardPreviewMetaItem}>
                    <Text style={styles.jobCardPreviewMetaIcon}>⏰</Text>
                    <Text style={styles.jobCardPreviewMetaText}>{selectedTime?.label} · {selectedTime?.sub}</Text>
                  </View>
                </View>

                {selectedImages.length > 0 && (
                  <View style={{ marginTop: 4 }}>
                    <Text style={{ fontSize: 10, color: '#666', fontWeight: '700', letterSpacing: 0.5, marginBottom: 6 }}>
                      {selectedImages.length} PHOTO{selectedImages.length > 1 ? 'S' : ''} ATTACHED
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {selectedImages.map((uri, i) => (
                        <Image key={i} source={{ uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
                      ))}
                    </View>
                  </View>
                )}

                <View style={styles.jobCardPreviewDivider} />

                <View style={styles.jobCardPreviewCustomer}>
                  <View style={styles.jobCardPreviewAvatar}>
                    <Text style={styles.jobCardPreviewAvatarText}>
                      {user?.email?.[0]?.toUpperCase() ?? '?'}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.jobCardPreviewCustomerName}>
                      {user?.user_metadata?.full_name ?? user?.email}
                    </Text>
                    <Text style={styles.jobCardPreviewCustomerLabel}>Verified Customer</Text>
                  </View>
                </View>
              </View>

              {/* Action choices */}
              <Text style={styles.sectionLabel}>WHAT WOULD YOU LIKE TO DO?</Text>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => handlePost('post')}
                disabled={saving}
                activeOpacity={0.85}
              >
                <View style={styles.actionCardLeft}>
                  <View style={[styles.actionIconBox, { backgroundColor: 'rgba(255,98,0,0.15)' }]}>
                    <Text style={styles.actionIcon}>📢</Text>
                  </View>
                  <View style={styles.actionInfo}>
                    <Text style={styles.actionTitle}>Post Job</Text>
                    <Text style={styles.actionSub}>
                      Post to the job board — contractors near you will apply
                    </Text>
                  </View>
                </View>
                <Text style={styles.actionArrow}>→</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionCard}
                onPress={() => handlePost('find')}
                disabled={saving}
                activeOpacity={0.85}
              >
                <View style={styles.actionCardLeft}>
                  <View style={[styles.actionIconBox, { backgroundColor: 'rgba(56,189,248,0.15)' }]}>
                    <Text style={styles.actionIcon}>🔍</Text>
                  </View>
                  <View style={styles.actionInfo}>
                    <Text style={styles.actionTitle}>Find a Contractor</Text>
                    <Text style={styles.actionSub}>
                      Browse and contact available contractors directly
                    </Text>
                  </View>
                </View>
                <Text style={styles.actionArrow}>→</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionCard, { borderColor: '#2A2A2A' }]}
                onPress={() => handlePost('draft')}
                disabled={saving}
                activeOpacity={0.85}
              >
                <View style={styles.actionCardLeft}>
                  <View style={[styles.actionIconBox, { backgroundColor: 'rgba(156,163,175,0.12)' }]}>
                    <Text style={styles.actionIcon}>📝</Text>
                  </View>
                  <View style={styles.actionInfo}>
                    <Text style={[styles.actionTitle, { color: '#888' }]}>Save as Draft</Text>
                    <Text style={styles.actionSub}>
                      Come back and post it later — saved under Jobs › Drafts
                    </Text>
                  </View>
                </View>
                <Text style={[styles.actionArrow, { color: '#555' }]}>→</Text>
              </TouchableOpacity>

              {(saving || uploadingPhotos) && (
                <View style={styles.savingRow}>
                  <ActivityIndicator color={Colors.orange} />
                  <Text style={styles.savingText}>
                    {uploadingPhotos ? 'Uploading photos...' : 'Creating your job card...'}
                  </Text>
                </View>
              )}
            </View>
          )}

        </Animated.View>
      </ScrollView>

      {/* Footer */}
      {step < 3 && (
        <SafeAreaView edges={['bottom']} style={styles.footerSafe}>
          <View style={styles.footer}>
            {step > 0 && (
              <TouchableOpacity style={styles.footerBackBtn} onPress={handleBack}>
                <Text style={styles.footerBackText}>Back</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.footerNextBtn} onPress={handleNext}>
              <Text style={styles.footerNextText}>
                {step === 2 ? 'Review Job Card →' : 'Continue →'}
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      )}

      {/* Auth gate — shown when guest taps Post / Find / Draft */}
      <Modal
        visible={showAuthSheet}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setShowAuthSheet(false)}
      >
        <TouchableOpacity
          style={authSheet.backdrop}
          activeOpacity={1}
          onPress={() => setShowAuthSheet(false)}
        >
          <View style={authSheet.sheet} onStartShouldSetResponder={() => true}>
            <View style={authSheet.handle} />

            <View style={authSheet.iconWrap}>
              <Text style={{ fontSize: 44 }}>🔒</Text>
            </View>

            <Text style={authSheet.title}>Account Required</Text>
            <Text style={authSheet.sub}>
              Your job card is saved. Create a free account to post it and get matched with contractors in your area.
            </Text>

            <TouchableOpacity
              style={authSheet.primaryBtn}
              activeOpacity={0.88}
              onPress={() => { setShowAuthSheet(false); router.push('/signup'); }}
            >
              <Text style={authSheet.primaryBtnText}>Create Account</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={authSheet.secondaryBtn}
              activeOpacity={0.88}
              onPress={() => { setShowAuthSheet(false); router.push('/login'); }}
            >
              <Text style={authSheet.secondaryBtnText}>Log In</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={authSheet.dismissRow}
              onPress={() => setShowAuthSheet(false)}
            >
              <Text style={authSheet.dismissText}>Maybe Later</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#1E1E1E',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: Radius.md,
    backgroundColor: '#1A1A1A', borderWidth: 1, borderColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
  },
  backArrow: { fontSize: 18, color: Colors.white },
  headerTitle: { fontSize: 16, fontWeight: Font.bold, color: Colors.white },

  progressWrap: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
    backgroundColor: '#0A0A0A',
  },
  progressItem: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  progressDot: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#1E1E1E', borderWidth: 2, borderColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
  },
  progressDotActive: { backgroundColor: Colors.orange, borderColor: Colors.orange },
  progressNum: { fontSize: 11, color: '#555', fontWeight: Font.bold },
  progressNumActive: { color: Colors.background },
  progressCheck: { fontSize: 11, color: Colors.background, fontWeight: Font.black },
  progressLabel: { fontSize: 9, color: '#555', marginLeft: 4, flex: 1 },
  progressLabelActive: { color: Colors.orange, fontWeight: Font.bold },
  progressLine: { flex: 1, height: 2, backgroundColor: '#2A2A2A', marginHorizontal: 4 },
  progressLineActive: { backgroundColor: Colors.orange },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: 120 },
  stepContent: { gap: Spacing.md },
  stepTitle: { fontSize: 24, fontWeight: Font.black, color: Colors.white },
  stepSub: { fontSize: 14, color: '#666', lineHeight: 21, marginTop: -8 },
  sectionLabel: { fontSize: 11, fontWeight: Font.black, color: '#555', letterSpacing: 1.5, marginTop: 4 },

  tradePill: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
    backgroundColor: Colors.orangeDim, borderRadius: Radius.full,
    borderWidth: 1, borderColor: Colors.orange,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  tradePillIcon: { fontSize: 16 },
  tradePillText: { fontSize: 13, fontWeight: Font.bold, color: Colors.orange },

  // Trade grid
  tradeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tradeCard: {
    width: (width - 48 - 10) / 2, backgroundColor: '#141414',
    borderRadius: 16, borderWidth: 1.5, borderColor: '#1E1E1E',
    padding: 16, alignItems: 'center', gap: 8,
  },
  tradeCardSelected: {
    borderColor: Colors.orange, backgroundColor: 'rgba(255,98,0,0.06)',
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  tradeCardIcon: { fontSize: 32 },
  tradeCardLabel: { fontSize: 13, fontWeight: Font.bold, color: '#888', textAlign: 'center' },
  tradeCardLabelSelected: { color: Colors.orange },

  // Job list
  jobList: { gap: 10 },
  jobCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#141414', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#1E1E1E', padding: 14,
  },
  jobCardSelected: {
    borderColor: Colors.orange, backgroundColor: 'rgba(255,98,0,0.04)',
  },
  jobCardIconBox: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#1E1E1E', alignItems: 'center', justifyContent: 'center',
  },
  jobCardIconBoxSelected: { backgroundColor: 'rgba(255,98,0,0.15)' },
  jobCardIcon: { fontSize: 22 },
  jobCardInfo: { flex: 1 },
  jobCardLabel: { fontSize: 14, fontWeight: Font.bold, color: '#999', marginBottom: 3 },
  jobCardLabelSelected: { color: Colors.white },
  jobCardDesc: { fontSize: 12, color: '#555', lineHeight: 17 },
  jobCardCheck: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center',
  },
  jobCardCheckText: { fontSize: 12, color: Colors.background, fontWeight: Font.black },

  // Options grid (price)
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  optionCard: {
    width: (width - 48 - 10) / 2, backgroundColor: '#141414',
    borderRadius: 14, borderWidth: 1.5, borderColor: '#1E1E1E',
    padding: 14, gap: 4,
  },
  optionCardSelected: { borderColor: Colors.orange, backgroundColor: 'rgba(255,98,0,0.06)' },
  optionCardLabel: { fontSize: 13, fontWeight: Font.bold, color: '#888' },
  optionCardLabelSelected: { color: Colors.white },
  optionCardSub: { fontSize: 12, color: '#555' },
  optionCardSubSelected: { color: Colors.orange },

  // Time slots
  timeList: { gap: 8 },
  timeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#141414', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#1E1E1E', padding: 14,
  },
  timeCardSelected: { borderColor: Colors.orange, backgroundColor: 'rgba(255,98,0,0.04)' },
  timeIcon: { fontSize: 22 },
  timeInfo: { flex: 1 },
  timeLabel: { fontSize: 14, fontWeight: Font.bold, color: '#888' },
  timeLabelSelected: { color: Colors.white },
  timeSub: { fontSize: 12, color: '#555', marginTop: 2 },
  timeCheck: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center',
  },
  timeCheckText: { fontSize: 12, color: Colors.background, fontWeight: Font.black },

  // Address
  detectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: Colors.orange, borderRadius: 14, paddingVertical: 14,
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  detectIcon: { fontSize: 18 },
  detectText: { fontSize: 15, fontWeight: Font.bold, color: Colors.background },
  inputBox: {
    backgroundColor: '#141414', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#1E1E1E', padding: 14,
  },
  addressInput: { fontSize: 14, color: Colors.white, lineHeight: 22 },
  descInput: { fontSize: 14, color: Colors.white, lineHeight: 22, minHeight: 90, textAlignVertical: 'top' },

  // Job card preview
  jobCardPreview: {
    backgroundColor: '#141414', borderRadius: 20,
    borderWidth: 1.5, borderColor: '#2A2A2A', padding: Spacing.lg, gap: 12,
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 20, elevation: 8,
  },
  jobCardPreviewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jobCardPreviewTrade: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobCardPreviewTradeIcon: { fontSize: 18 },
  jobCardPreviewTradeText: { fontSize: 13, fontWeight: Font.bold, color: Colors.orange },
  urgentBadge: {
    backgroundColor: Colors.orangeDim, borderRadius: Radius.full,
    paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: Colors.orange,
  },
  urgentBadgeText: { fontSize: 10, fontWeight: Font.black, color: Colors.orange },
  jobCardPreviewTitle: { fontSize: 18, fontWeight: Font.black, color: Colors.white },
  jobCardPreviewDesc: { fontSize: 13, color: '#888', lineHeight: 19 },
  jobCardPreviewMeta: { gap: 8 },
  jobCardPreviewMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  jobCardPreviewMetaIcon: { fontSize: 14 },
  jobCardPreviewMetaText: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  jobCardPreviewDivider: { height: 1, backgroundColor: '#2A2A2A' },
  jobCardPreviewCustomer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  jobCardPreviewAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center',
  },
  jobCardPreviewAvatarText: { fontSize: 16, fontWeight: Font.black, color: Colors.background },
  jobCardPreviewCustomerName: { fontSize: 14, fontWeight: Font.bold, color: Colors.white },
  jobCardPreviewCustomerLabel: { fontSize: 11, color: '#22C55E' },

  // Action cards
  actionCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#141414', borderRadius: 18, borderWidth: 1.5, borderColor: '#2A2A2A',
    padding: 16, gap: 12,
  },
  actionCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  actionIconBox: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  actionIcon: { fontSize: 24 },
  actionInfo: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: Font.black, color: Colors.white, marginBottom: 3 },
  actionSub: { fontSize: 12, color: '#666', lineHeight: 17 },
  actionArrow: { fontSize: 22, color: Colors.orange, fontWeight: Font.bold },

  savingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 8 },
  savingText: { fontSize: 14, color: Colors.textSecondary },

  // Footer
  footerSafe: { backgroundColor: '#0A0A0A' },
  footer: {
    flexDirection: 'row', gap: 12,
    paddingHorizontal: Spacing.lg, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: '#1E1E1E',
  },
  footerBackBtn: {
    flex: 1, height: 52, borderRadius: 14,
    backgroundColor: '#141414', borderWidth: 1, borderColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
  },
  footerBackText: { fontSize: 15, fontWeight: Font.semibold, color: '#888' },
  footerNextBtn: {
    flex: 2, height: 52, borderRadius: 14,
    backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center',
    shadowColor: Colors.orange, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 12, elevation: 8,
  },
  footerNextText: { fontSize: 15, fontWeight: Font.black, color: Colors.background },

  // Contractor mini-cards (step 1)
  contractorMiniCard: {
    width: 118, backgroundColor: '#141414', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#2A2A2A',
    padding: 12, alignItems: 'center', gap: 6,
  },
  contractorMiniAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.orange, alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  contractorMiniInitials:  { fontSize: 16, fontWeight: Font.black, color: '#fff' },
  contractorMiniName:      { fontSize: 11, fontWeight: Font.bold, color: '#ccc', textAlign: 'center', lineHeight: 14 },
  contractorMiniRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  contractorMiniRatingText:{ fontSize: 10, fontWeight: Font.bold, color: Colors.orange },
  contractorMiniViewBtn: {
    backgroundColor: 'rgba(255,98,0,0.12)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: Colors.orange,
  },
  contractorMiniViewText: { fontSize: 11, fontWeight: Font.black, color: Colors.orange },

  // Pricing + area hints (step 2)
  pricingHint:   { fontSize: 12, color: '#888', marginTop: -4, lineHeight: 18 },
  areaCountText: { fontSize: 12, fontWeight: Font.bold, color: '#22C55E', marginTop: 4 },

  // Instant Book
  instantBookRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: '#141414', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#1E1E1E', padding: 16,
  },
  ibBadge: {
    backgroundColor: 'rgba(34,197,94,0.12)', borderRadius: 999,
    borderWidth: 1, borderColor: '#22C55E',
    paddingHorizontal: 8, paddingVertical: 2,
  },
  ibBadgeText: { fontSize: 10, fontWeight: Font.black, color: '#22C55E' },
});

const authSheet = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    borderWidth: 1, borderColor: '#1E1E1E',
    paddingHorizontal: 28, paddingTop: 20, paddingBottom: 40,
    alignItems: 'center',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#333', marginBottom: 24,
  },
  iconWrap: {
    width: 80, height: 80, borderRadius: 24,
    backgroundColor: 'rgba(255,98,0,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,98,0,0.25)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24, fontWeight: '900', color: '#F0F0F0',
    letterSpacing: -0.5, marginBottom: 10, textAlign: 'center',
  },
  sub: {
    fontSize: 14, color: '#888', lineHeight: 21,
    textAlign: 'center', marginBottom: 28,
  },
  primaryBtn: {
    width: '100%', height: 56, borderRadius: 16,
    backgroundColor: Colors.orange,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
    shadowColor: Colors.orange,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  primaryBtnText: {
    fontSize: 16, fontWeight: '900', color: '#0A0A0A',
  },
  secondaryBtn: {
    width: '100%', height: 56, borderRadius: 16,
    backgroundColor: 'transparent',
    borderWidth: 1.5, borderColor: '#2A2A2A',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 20,
  },
  secondaryBtnText: {
    fontSize: 16, fontWeight: '600', color: '#F0F0F0',
  },
  dismissRow: { paddingVertical: 8 },
  dismissText: { fontSize: 13, color: '#555' },
});