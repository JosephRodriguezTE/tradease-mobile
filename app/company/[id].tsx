// app/company/[id].tsx
// Public contractor profile — what customers see when browsing.

import { useTheme } from '@/context/ThemeContext';
import { deriveChatId } from '@/lib/messageService';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator, Alert, Animated, Dimensions, FlatList,
    Image, Linking, Modal, ScrollView, Share,
    StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');
const GRID_PAD  = 16;
const GRID_GAP  = 3;
const ITEM_SIZE = (SCREEN_W - GRID_PAD * 2 - GRID_GAP * 2) / 3;
const PORTFOLIO_URL = 'https://linqsojbszglbgpoxgtv.supabase.co/storage/v1/object/public/portfolio/';

const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const R  = { sm:8,md:12,lg:16,xl:20,full:999 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24,'2xl':30 } as const;
const FW = { regular:'400' as const, medium:'500' as const, semibold:'600' as const, bold:'700' as const, black:'800' as const };

interface PortfolioItem {
  id: string;
  storage_path: string;
  caption: string | null;
  trade: string | null;
  sort_order: number;
}

function StarRating({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection:'row', gap:2 }}>
      {[1,2,3,4,5].map(s => (
        <Ionicons key={s} name={s <= Math.round(rating) ? 'star' : 'star-outline'} size={size} color="#FBBF24" />
      ))}
    </View>
  );
}

export default function ContractorPublicProfile() {
  const { id }   = useLocalSearchParams<{ id:string }>();
  const router   = useRouter();
  const { colors: C } = useTheme();

  const [contractor,     setContractor]     = useState<any>(null);
  const [reviews,        setReviews]        = useState<any[]>([]);
  const [portfolioItems, setPortfolioItems] = useState<PortfolioItem[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [lightboxItem,   setLightboxItem]   = useState<PortfolioItem | null>(null);

  const scrollY = useRef(new Animated.Value(0)).current;
  const headerOpacity = scrollY.interpolate({ inputRange:[80,160], outputRange:[0,1], extrapolate:'clamp' });

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('contractors_public')
        .select(`
          id, company_name, trade_type, plan, rating, review_count,
          is_available, service_area, avatar_url, hourly_rate,
          description, experience, location, portfolio_photos,
          banner_url, tagline, business_city, business_state, phone,
          insured, license_verified, verification_status, verified,
          total_bookings, response_time_avg, years_in_business,
          specializations, languages, website
        `)
        .eq('id', id)
        .single();
      setContractor(data);

      const [{ data: rev }, { data: portfolio }] = await Promise.all([
        supabase
          .from('reviews')
          .select('id, rating_overall, review_text, created_at, users(full_name)')
          .eq('contractor_id', id)
          .order('created_at', { ascending: false })
          .limit(10),
        supabase
          .from('contractor_portfolio')
          .select('*')
          .eq('contractor_id', id)
          .order('sort_order'),
      ]);
      setReviews(rev ?? []);
      setPortfolioItems((portfolio as PortfolioItem[]) ?? []);
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor:C.background }]} edges={['top']}>
        <View style={s.center}><ActivityIndicator color={C.orange} size="large" /></View>
      </SafeAreaView>
    );
  }

  if (!contractor) {
    return (
      <SafeAreaView style={[s.container, { backgroundColor:C.background }]} edges={['top']}>
        <View style={s.center}>
          <Text style={{ color:C.textSecondary, fontSize:TY.base }}>Contractor not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const initials   = (contractor.company_name ?? '?').split(' ').map((w:string) => w[0]).join('').toUpperCase().slice(0,2);
  const specs      = (contractor.specializations ?? []) as string[];
  const isVerified = contractor.verification_status === 'approved' || contractor.verified;
  const responseT  = contractor.response_time_avg ? `${contractor.response_time_avg}m` : '—';

  return (
    <View style={[s.container, { backgroundColor:C.background }]}>

      {/* Floating header on scroll */}
      <Animated.View style={[s.floatingHeader, { backgroundColor:C.background, borderBottomColor:C.border, opacity:headerOpacity }]}>
        <SafeAreaView edges={['top']}>
          <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingBottom:10, gap:12 }}>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={s.backBtn}>
              <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
            </TouchableOpacity>
            <Text style={{ flex:1, fontSize:TY.md, fontWeight:FW.black, color:C.textPrimary }} numberOfLines={1}>
              {contractor.company_name}
            </Text>
            <TouchableOpacity style={[s.bookBtnSmall, { backgroundColor:C.orange }]} onPress={() => router.push(`/create-job?contractor=${id}`)}>
              <Text style={{ fontSize:TY.sm, fontWeight:FW.black, color:'#fff' }}>Book</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </Animated.View>

      <Animated.ScrollView
        onScroll={Animated.event([{ nativeEvent:{ contentOffset:{ y:scrollY } } }], { useNativeDriver:true })}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
      >
        {/* Back button (top of page) */}
        <SafeAreaView edges={['top']} style={{ position:'absolute', zIndex:10, left:0, right:0 }}>
          <View style={{ padding:12 }}>
            <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={[s.backCircle, { backgroundColor:'rgba(0,0,0,0.45)' }]}>
              <Ionicons name="chevron-back" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        {/* Banner */}
        <View style={s.banner}>
          {contractor.banner_url
            ? <Image source={{ uri:contractor.banner_url }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
            : <View style={[StyleSheet.absoluteFillObject, { backgroundColor:C.surface }]}>
                <View style={{ position:'absolute', inset:0, opacity:0.06, backgroundColor:C.orange }} />
              </View>
          }
        </View>

        {/* Avatar + name block */}
        <View style={[s.nameBlock, { backgroundColor:C.background }]}>
          <View style={s.avatarWrap}>
            {contractor.avatar_url
              ? <Image source={{ uri:contractor.avatar_url }} style={[s.avatar, { borderColor:C.background }]} />
              : <View style={[s.avatar, { backgroundColor:C.orange, borderColor:C.background }]}>
                  <Text style={s.avatarText}>{initials}</Text>
                </View>
            }
            {isVerified && (
              <View style={[s.verifiedBadge, { backgroundColor:'#22C55E', borderColor:C.background }]}>
                <Ionicons name="checkmark" size={10} color="#fff" />
              </View>
            )}
          </View>

          <View style={{ flex:1, paddingTop:SP[2] }}>
            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:3 }}>
              <Text style={{ fontSize:TY.xl, fontWeight:FW.black, color:C.textPrimary, letterSpacing:-0.4 }}>
                {contractor.company_name}
              </Text>
              {contractor.plan && contractor.plan !== 'free' && (
                <View style={[s.planPill, { backgroundColor:'rgba(255,98,0,0.12)', borderColor:'rgba(255,98,0,0.3)' }]}>
                  <Text style={{ fontSize:10, fontWeight:FW.black, color:C.orange }}>
                    {(contractor.plan ?? '').toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <Text style={{ fontSize:TY.sm, color:C.textSecondary, marginBottom:8 }}>
              {contractor.trade_type}{contractor.business_city ? ` · ${contractor.business_city}, ${contractor.business_state}` : ''}
            </Text>
            {contractor.tagline && (
              <Text style={{ fontSize:TY.sm, color:C.textMuted, fontStyle:'italic' }}>
                "{contractor.tagline}"
              </Text>
            )}
          </View>
        </View>

        <View style={{ paddingHorizontal:SP[4] }}>

          {/* Rating + actions */}
          {contractor.rating && (
            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:SP[4] }}>
              <StarRating rating={contractor.rating} size={16} />
              <Text style={{ fontSize:TY.md, fontWeight:FW.black, color:C.textPrimary }}>{contractor.rating?.toFixed(1)}</Text>
              <Text style={{ fontSize:TY.sm, color:C.textSecondary }}>({contractor.review_count ?? 0} reviews)</Text>
            </View>
          )}

          <View style={{ flexDirection:'row', gap:SP[3], marginBottom:SP[5] }}>
            <TouchableOpacity
              style={[s.bookBtn, { backgroundColor:C.orange }]}
              onPress={() => router.push(`/create-job?contractor=${id}`)}
            >
              <Ionicons name="calendar-outline" size={18} color="#fff" />
              <Text style={s.bookBtnText}>Book Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.msgBtn, { backgroundColor:C.surface, borderColor:C.border }]}
              onPress={async () => {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                  Alert.alert(
                    'Sign up required',
                    'Create an account to message contractors.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Sign Up', onPress: () => router.push('/signup' as any) },
                    ]
                  );
                  return;
                }
                const chatId = deriveChatId(user.id, id!);
                router.push(`/chat/${chatId}?contractorId=${id}` as any);
              }}
            >
              <Ionicons name="chatbubble-outline" size={18} color={C.textSecondary} />
            </TouchableOpacity>
            {contractor.phone && (
              <TouchableOpacity
                style={[s.msgBtn, { backgroundColor:C.surface, borderColor:C.border }]}
                onPress={() => Linking.openURL(`tel:${contractor.phone}`)}
              >
                <Ionicons name="call-outline" size={18} color={C.textSecondary} />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[s.msgBtn, { backgroundColor:C.surface, borderColor:C.border }]}
              onPress={() => Share.share({
                title: contractor.company_name,
                message: `Check out ${contractor.company_name} on Tradease — ${contractor.trade_type ?? 'contractor'} in ${contractor.business_city ?? contractor.location ?? 'your area'}.\nhttps://tradease.app/contractor/${id}`,
              })}
            >
              <Ionicons name="share-outline" size={18} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Stats */}
          <View style={[s.statsCard, { backgroundColor:C.surface, borderColor:C.border }]}>
            {[
              { val: contractor.total_bookings ?? 0,       lbl:'Jobs done' },
              { val: contractor.rating?.toFixed(1) ?? '—', lbl:'Rating'    },
              { val: responseT,                             lbl:'Response'  },
              { val: contractor.years_in_business ? `${contractor.years_in_business}` : '—', lbl:'Yrs exp' },
            ].map((s, i, arr) => (
              <React.Fragment key={i}>
                <View style={{ flex:1, alignItems:'center' }}>
                  <Text style={{ fontSize:TY.lg, fontWeight:FW.black, color:C.textPrimary }}>{s.val}</Text>
                  <Text style={{ fontSize:TY.xs, color:C.textMuted, fontWeight:FW.semibold, marginTop:2 }}>{s.lbl}</Text>
                </View>
                {i < arr.length-1 && <View style={{ width:0.5, backgroundColor:C.border, height:36 }} />}
              </React.Fragment>
            ))}
          </View>

          {/* Trust badges */}
          <View style={{ flexDirection:'row', gap:SP[2], marginBottom:SP[5] }}>
            {[
              { icon:'shield-checkmark', color:'#22C55E', bg:'rgba(34,197,94,0.08)', border:'rgba(34,197,94,0.25)', label:'Verified',  active: isVerified },
              { icon:'shield-outline',   color:'#22C55E', bg:'rgba(34,197,94,0.08)', border:'rgba(34,197,94,0.25)', label:'Insured',   active: contractor.insured },
              { icon:'ribbon-outline',   color:'#22C55E', bg:'rgba(34,197,94,0.08)', border:'rgba(34,197,94,0.25)', label:'Licensed',  active: contractor.license_verified },
            ].map(b => (
              <View key={b.label} style={[s.trustBadge, {
                backgroundColor: b.active ? b.bg : C.surface,
                borderColor:     b.active ? b.border : C.border,
              }]}>
                <Ionicons name={b.icon as any} size={16} color={b.active ? b.color : C.textMuted} />
                <Text style={{ fontSize:TY.xs, fontWeight:FW.bold, color:b.active ? b.color : C.textMuted }}>
                  {b.label}
                </Text>
              </View>
            ))}
          </View>

          {/* About */}
          {contractor.description && (
            <>
              <Text style={[s.sectionLabel, { color:C.textMuted }]}>ABOUT</Text>
              <Text style={{ fontSize:TY.base, color:C.textSecondary, lineHeight:24, marginBottom:SP[5] }}>
                {contractor.description}
              </Text>
            </>
          )}

          {/* Portfolio */}
          {portfolioItems.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color:C.textMuted }]}>
                PORTFOLIO <Text style={{ color:C.orange }}>{portfolioItems.length} photos</Text>
              </Text>
              <View style={{ marginHorizontal: -SP[4], marginBottom: SP[5] }}>
                <FlatList
                  data={portfolioItems}
                  keyExtractor={item => item.id}
                  numColumns={3}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={{ width: ITEM_SIZE, height: ITEM_SIZE, margin: GRID_GAP / 2 }}
                      onPress={() => setLightboxItem(item)}
                      activeOpacity={0.85}
                    >
                      <Image
                        source={{ uri: PORTFOLIO_URL + item.storage_path }}
                        style={{ width: '100%', height: '100%', borderRadius: R.sm }}
                        resizeMode="cover"
                      />
                      {item.trade && (
                        <View style={{ position:'absolute', bottom:4, left:4, backgroundColor:'rgba(0,0,0,0.6)', borderRadius:4, paddingHorizontal:5, paddingVertical:2 }}>
                          <Text style={{ fontSize:9, color:'#fff', fontWeight:FW.bold }}>{item.trade}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                  contentContainerStyle={{ paddingHorizontal: GRID_PAD - GRID_GAP / 2 }}
                />
              </View>
            </>
          )}

          {/* Specializations */}
          {specs.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color:C.textMuted }]}>SPECIALIZATIONS</Text>
              <View style={{ flexDirection:'row', flexWrap:'wrap', gap:SP[2], marginBottom:SP[5] }}>
                {specs.map(spec => (
                  <View key={spec} style={[s.specTag, { backgroundColor:C.surface, borderColor:C.border }]}>
                    <Text style={{ fontSize:TY.sm, color:C.textPrimary, fontWeight:FW.medium }}>{spec}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Info pills */}
          <View style={{ flexDirection:'row', flexWrap:'wrap', gap:SP[2], marginBottom:SP[5] }}>
            {contractor.service_area && (
              <View style={[s.infoPill, { backgroundColor:C.surface, borderColor:C.border }]}>
                <Ionicons name="location-outline" size={13} color={C.textMuted} />
                <Text style={{ fontSize:TY.xs, color:C.textSecondary }}>{contractor.service_area}</Text>
              </View>
            )}
            {contractor.languages && (
              <View style={[s.infoPill, { backgroundColor:C.surface, borderColor:C.border }]}>
                <Ionicons name="language-outline" size={13} color={C.textMuted} />
                <Text style={{ fontSize:TY.xs, color:C.textSecondary }}>{contractor.languages}</Text>
              </View>
            )}
            {contractor.website && (
              <TouchableOpacity onPress={() => Linking.openURL(`https://${contractor.website.replace('https://','').replace('http://','')}`)}
                style={[s.infoPill, { backgroundColor:C.surface, borderColor:C.border }]}>
                <Ionicons name="globe-outline" size={13} color={C.orange} />
                <Text style={{ fontSize:TY.xs, color:C.orange }}>{contractor.website}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Reviews */}
          {reviews.length > 0 && (
            <>
              <View style={{ flexDirection:'row', alignItems:'center', marginBottom:SP[3] }}>
                <Text style={[s.sectionLabel, { color:C.textMuted, marginBottom:0, flex:1 }]}>REVIEWS</Text>
                <Text style={{ fontSize:TY.xs, color:C.textMuted }}>{reviews.length} shown</Text>
              </View>
              <View style={{ gap:SP[3], marginBottom:SP[5] }}>
                {reviews.map(rev => {
                  const reviewerName = (rev.users as any)?.full_name ?? 'Anonymous';
                  return (
                    <View key={rev.id} style={[s.reviewCard, { backgroundColor:C.surface, borderColor:C.border }]}>
                      <View style={{ flexDirection:'row', alignItems:'center', gap:SP[3], marginBottom:SP[2] }}>
                        <View style={[s.reviewerAvatar, { backgroundColor:C.surfaceAlt }]}>
                          <Text style={{ fontSize:TY.sm, fontWeight:FW.black, color:C.textSecondary }}>
                            {reviewerName.charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex:1 }}>
                          <Text style={{ fontSize:TY.sm, fontWeight:FW.bold, color:C.textPrimary }}>{reviewerName}</Text>
                          <StarRating rating={rev.rating_overall ?? 5} size={12} />
                        </View>
                        <Text style={{ fontSize:TY.xs, color:C.textMuted }}>
                          {rev.created_at ? new Date(rev.created_at).toLocaleDateString('en-US',{ month:'short', day:'numeric' }) : ''}
                        </Text>
                      </View>
                      {rev.review_text && (
                        <Text style={{ fontSize:TY.sm, color:C.textSecondary, lineHeight:20 }}>{rev.review_text}</Text>
                      )}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {/* Bottom CTA */}
          <TouchableOpacity
            style={[s.bookBtn, { backgroundColor:C.orange, marginBottom:SP[10] }]}
            onPress={() => router.push(`/create-job?contractor=${id}`)}
          >
            <Ionicons name="calendar-outline" size={18} color="#fff" />
            <Text style={s.bookBtnText}>Book {contractor.company_name}</Text>
          </TouchableOpacity>
        </View>
      </Animated.ScrollView>

      {/* Lightbox modal */}
      <Modal visible={!!lightboxItem} animationType="fade" transparent>
        <TouchableOpacity
          style={{ flex:1, backgroundColor:'rgba(0,0,0,0.92)', alignItems:'center', justifyContent:'center' }}
          activeOpacity={1}
          onPress={() => setLightboxItem(null)}
        >
          {lightboxItem && (
            <View style={{ width: SCREEN_W, alignItems: 'center' }}>
              <Image
                source={{ uri: PORTFOLIO_URL + lightboxItem.storage_path }}
                style={{ width: SCREEN_W, height: SCREEN_W }}
                resizeMode="contain"
              />
              {lightboxItem.caption && (
                <View style={{ paddingHorizontal: SP[5], paddingTop: SP[3] }}>
                  <Text style={{ fontSize: TY.sm, color: '#fff', textAlign: 'center', lineHeight: 20 }}>
                    {lightboxItem.caption}
                  </Text>
                </View>
              )}
              {lightboxItem.trade && (
                <View style={{ marginTop: SP[2], backgroundColor: 'rgba(255,98,0,0.2)', borderRadius: R.full, borderWidth: 0.5, borderColor: 'rgba(255,98,0,0.4)', paddingHorizontal: SP[3], paddingVertical: SP[1] }}>
                  <Text style={{ fontSize: TY.xs, color: '#FF6200', fontWeight: FW.bold }}>{lightboxItem.trade}</Text>
                </View>
              )}
              <TouchableOpacity
                style={{ position: 'absolute', top: -48, right: SP[5], width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' }}
                onPress={() => setLightboxItem(null)}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex:1 },
  center:          { flex:1, alignItems:'center', justifyContent:'center' },
  floatingHeader:  { position:'absolute', top:0, left:0, right:0, zIndex:99, borderBottomWidth:0.5 },
  backBtn:         { width:36, height:36, alignItems:'center', justifyContent:'center' },
  backCircle:      { width:36, height:36, borderRadius:18, alignItems:'center', justifyContent:'center' },
  bookBtnSmall:    { borderRadius:20, paddingVertical:8, paddingHorizontal:14 },
  banner:          { height:200, overflow:'hidden' },
  nameBlock:       { flexDirection:'row', gap:16, paddingHorizontal:16, paddingTop:12, paddingBottom:16, alignItems:'flex-start' },
  avatarWrap:      { position:'relative', marginTop:-44 },
  avatar:          { width:80, height:80, borderRadius:22, borderWidth:4, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  avatarText:      { fontSize:26, fontWeight:'800', color:'#fff' },
  verifiedBadge:   { position:'absolute', bottom:-2, right:-2, width:22, height:22, borderRadius:11, borderWidth:2, alignItems:'center', justifyContent:'center' },
  planPill:        { borderRadius:999, borderWidth:0.5, paddingHorizontal:8, paddingVertical:3 },
  bookBtn:         { flex:1, borderRadius:14, paddingVertical:14, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
  bookBtnText:     { fontSize:15, fontWeight:'800', color:'#fff' },
  msgBtn:          { width:48, height:48, borderRadius:14, borderWidth:0.5, alignItems:'center', justifyContent:'center' },
  statsCard:       { flexDirection:'row', borderRadius:16, borderWidth:0.5, paddingVertical:14, marginBottom:16 },
  trustBadge:      { flex:1, flexDirection:'row', alignItems:'center', justifyContent:'center', gap:5, borderRadius:10, borderWidth:0.5, paddingVertical:10 },
  sectionLabel:    { fontSize:11, fontWeight:'700', letterSpacing:0.8, marginBottom:12 },
  portfolioPhoto:  { width:120, height:120, borderRadius:12, borderWidth:0.5 },
  specTag:         { borderRadius:999, borderWidth:0.5, paddingHorizontal:12, paddingVertical:6 },
  infoPill:        { flexDirection:'row', alignItems:'center', gap:5, borderRadius:999, borderWidth:0.5, paddingHorizontal:10, paddingVertical:6 },
  reviewCard:      { borderRadius:14, borderWidth:0.5, padding:14 },
  reviewerAvatar:  { width:34, height:34, borderRadius:17, alignItems:'center', justifyContent:'center' },
});