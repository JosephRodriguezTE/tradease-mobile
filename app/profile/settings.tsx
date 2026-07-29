// app/profile/settings.tsx — THEMED VERSION
// Replaces the previous settings.tsx. Now uses useTheme() and has a working
// Appearance toggle with Dark / Light / System options.

import { useTheme } from '@/context/ThemeContext';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/lib/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Font, Radius } from '../../constants/theme';

const SP = { 1:4,2:8,3:12,4:16,5:20,6:24,8:32,10:40 } as const;
const TY = { xs:11,sm:13,base:15,md:17,lg:20,xl:24 } as const;

// ─── Appearance Modal ─────────────────────────────────────────────────────────

function AppearanceModal({ visible, onClose }: { visible:boolean; onClose:()=>void }) {
  const { colors: C, mode, setMode } = useTheme();

  const options = [
    { value:'dark'   as const, label:'Dark',   icon:'moon',         desc:'Easier on the eyes at night' },
    { value:'light'  as const, label:'Light',  icon:'sunny',        desc:'Clean look in bright environments' },
    { value:'system' as const, label:'System', icon:'phone-portrait',desc:'Matches your device setting' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex:1, backgroundColor:'rgba(0,0,0,0.6)', justifyContent:'flex-end' }}>
        <View style={{ backgroundColor:C.surface, borderTopLeftRadius:28, borderTopRightRadius:28, padding:24, paddingBottom:40, borderTopWidth:0.5, borderColor:C.border }}>
          <View style={{ width:36,height:4,backgroundColor:C.border,borderRadius:2,alignSelf:'center',marginBottom:20 }} />
          <Text style={{ fontSize:TY.xl, fontWeight:Font.black, color:C.textPrimary, marginBottom:6 }}>Appearance</Text>
          <Text style={{ fontSize:TY.sm, color:C.textSecondary, marginBottom:24 }}>Choose how Tradease looks on your device.</Text>

          {options.map((opt, i) => {
            const active = mode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => { setMode(opt.value); onClose(); }}
                style={{
                  flexDirection:'row', alignItems:'center', gap:14,
                  backgroundColor: active ? 'rgba(255,98,0,0.10)' : C.surfaceAlt,
                  borderRadius:Radius.lg,
                  borderWidth: active ? 1.5 : 0.5,
                  borderColor: active ? C.orange : C.border,
                  padding:16,
                  marginBottom: i < options.length - 1 ? 10 : 0,
                }}
              >
                <View style={{ width:38,height:38,borderRadius:10,backgroundColor: active ? 'rgba(255,98,0,0.15)' : C.surface, alignItems:'center',justifyContent:'center' }}>
                  <Ionicons name={opt.icon as any} size={20} color={active ? C.orange : C.textSecondary} />
                </View>
                <View style={{ flex:1 }}>
                  <Text style={{ fontSize:TY.base, fontWeight:Font.bold, color: active ? C.orange : C.textPrimary }}>{opt.label}</Text>
                  <Text style={{ fontSize:TY.xs, color:C.textSecondary, marginTop:2 }}>{opt.desc}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={C.orange} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

interface RowItem {
  id:string; icon:string; iconColor?:string; label:string;
  value?:string; onPress?:()=>void;
  toggle?:boolean; toggleValue?:boolean; onToggle?:(v:boolean)=>void;
  destructive?:boolean; disabled?:boolean; comingSoon?:boolean;
}

function SettingsRow({ item, C }: { item:RowItem; C:any }) {
  const labelColor = item.destructive ? C.error : item.disabled ? C.textMuted : C.textPrimary;
  return (
    <TouchableOpacity
      style={[{ flexDirection:'row',alignItems:'center',paddingHorizontal:SP[4],paddingVertical:SP[4],gap:SP[3] }, item.disabled && {opacity:0.45}]}
      onPress={item.onPress} disabled={item.disabled || item.toggle} activeOpacity={0.65}
    >
      <View style={{ width:34,height:34,borderRadius:Radius.sm,backgroundColor: item.iconColor ? item.iconColor+'22' : C.surfaceAlt,alignItems:'center',justifyContent:'center' }}>
        <Ionicons name={item.icon as any} size={18} color={item.iconColor ?? C.textSecondary} />
      </View>
      <Text style={{ flex:1, fontSize:TY.base, fontWeight:Font.medium, color:labelColor }}>{item.label}</Text>
      {item.comingSoon && (
        <View style={{ backgroundColor:'rgba(251,191,36,0.12)',borderRadius:999,paddingHorizontal:8,paddingVertical:3,marginRight:SP[2] }}>
          <Text style={{ fontSize:10,fontWeight:Font.black,color:'#FBBF24' }}>Soon</Text>
        </View>
      )}
      {item.value && <Text style={{ fontSize:TY.sm,color:C.textMuted,marginRight:SP[1] }}>{item.value}</Text>}
      {item.toggle
        ? <Switch value={item.toggleValue} onValueChange={item.onToggle}
            trackColor={{ false:C.border, true:C.orange }} thumbColor="#fff" />
        : !item.comingSoon && <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
      }
    </TouchableOpacity>
  );
}

function Section({ title, items, C }: { title:string; items:RowItem[]; C:any }) {
  return (
    <View style={{ marginBottom:SP[5] }}>
      <Text style={{ fontSize:TY.xs,fontWeight:Font.black,color:C.textMuted,letterSpacing:0.8,marginBottom:SP[2],paddingHorizontal:SP[1] }}>
        {title.toUpperCase()}
      </Text>
      <View style={{ backgroundColor:C.surface,borderRadius:Radius.lg,borderWidth:0.5,borderColor:C.border,overflow:'hidden' }}>
        {items.map((item, i) => (
          <View key={item.id}>
            {i > 0 && <View style={{ height:0.5,backgroundColor:C.border,marginHorizontal:SP[4] }} />}
            <SettingsRow item={item} C={C} />
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function SettingsScreen() {
  const router = useRouter();
  const { colors: C, isDark, mode, toggleTheme } = useTheme();
  const { isContractor } = useRole();

  const [pushEnabled,  setPushEnabled]   = useState(true);
  const [emailEnabled, setEmailEnabled]  = useState(true);
  const [signingOut,   setSigningOut]    = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  const modeLabel = mode === 'system' ? 'System' : isDark ? 'Dark' : 'Light';

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text:'Cancel', style:'cancel' },
      { text:'Sign Out', style:'destructive', onPress: async () => {
        setSigningOut(true);
        await supabase.auth.signOut();
        router.replace('/login');
      }},
    ]);
  }

  function handleDeleteAccount() {
    Alert.alert('Delete Account',
      'This permanently deletes your account and all data. This cannot be undone.',
      [
        { text:'Cancel', style:'cancel' },
        { text:'Delete My Account', style:'destructive', onPress: () =>
          Alert.alert('Contact Support', 'Email joseph.rodriguez.te@gmail.com to complete account deletion.')
        },
      ],
    );
  }

  const accountRows: RowItem[] = [
    { id:'personal',      icon:'person-outline',       iconColor:'#38BDF8', label:'Personal Info',    onPress:() => router.push('/profile/personal-info') },
    { id:'payments',      icon:'card-outline',          iconColor:C.orange,  label:'Payment Methods',  onPress:() => router.push('/profile/payments') },
    { id:'password',      icon:'lock-closed-outline',   iconColor:'#A78BFA', label:'Change Password',  onPress:() => router.push('/profile/change-password' as any) },
    { id:'security',      icon:'shield-checkmark-outline', iconColor:'#22C55E', label:'Security',      onPress:() => router.push('/profile/security' as any) },
    { id:'notifications', icon:'notifications-outline', iconColor:'#FB923C', label:'Notifications',    onPress:() => router.push('/profile/notifications') },
    ...(isContractor ? [
      { id:'subscription', icon:'diamond-outline', iconColor:'#FBBF24', label:'Subscription & Plan', onPress:() => router.push('/profile/subscription' as any) },
      { id:'employees',    icon:'people-outline',   iconColor:'#34D399', label:'Team Members',        onPress:() => router.push('/profile/employees' as any) },
    ] : []),
  ];

  const prefRows: RowItem[] = [
    { id:'push',  icon:'phone-portrait-outline', iconColor:'#34D399', label:'Push Notifications', toggle:true, toggleValue:pushEnabled,  onToggle:setPushEnabled },
    { id:'email', icon:'mail-outline',           iconColor:'#60A5FA', label:'Email Updates',       toggle:true, toggleValue:emailEnabled, onToggle:setEmailEnabled },
    { id:'appearance', icon: isDark ? 'moon' : 'sunny', iconColor:'#FBBF24', label:'Appearance', value:modeLabel, onPress:() => setAppearanceOpen(true) },
    { id:'lang',  icon:'language-outline',       iconColor:'#F472B6', label:'Language',            value:'English', comingSoon:true, disabled:true },
  ];

  const supportRows: RowItem[] = [
    { id:'contact', icon:'chatbubble-ellipses-outline', iconColor:'#34D399', label:'Contact Us',    onPress:() => router.push('/profile/contact') },
    { id:'help',    icon:'help-circle-outline',          iconColor:'#60A5FA', label:'Help Center',   onPress:() => Alert.alert('Help Center', 'help.tradease.app — coming soon.') },
    { id:'rate',    icon:'star-outline',                 iconColor:C.orange,  label:'Rate Tradease', onPress:() => Alert.alert('Rate Us', 'App Store rating — coming soon.') },
  ];

  const legalRows: RowItem[] = [
    { id:'terms',   icon:'document-text-outline',    iconColor:C.textMuted, label:'Terms of Service', onPress:() => router.push('/profile/terms') },
    { id:'privacy', icon:'shield-checkmark-outline', iconColor:C.textMuted, label:'Privacy Policy',   onPress:() => router.push('/profile/privacy') },
  ];

  const dangerRows: RowItem[] = [
    { id:'signout', icon:'log-out-outline', iconColor:C.error, label:'Sign Out',       destructive:true, onPress:handleSignOut },
    { id:'delete',  icon:'trash-outline',   iconColor:C.error, label:'Delete Account', destructive:true, onPress:handleDeleteAccount },
  ];

  return (
    <SafeAreaView style={{ flex:1, backgroundColor:C.background }} edges={['top']}>

      {/* Header */}
      <View style={{ flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:SP[4],paddingVertical:SP[3],borderBottomWidth:0.5,borderBottomColor:C.border }}>
        <TouchableOpacity onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)')} style={{ width:36,height:36,alignItems:'center',justifyContent:'center' }}>
          <Ionicons name="chevron-back" size={22} color={C.textPrimary} />
        </TouchableOpacity>
        <Text style={{ fontSize:TY.md, fontWeight:Font.black, color:C.textPrimary, letterSpacing:-0.3 }}>Settings</Text>
        <View style={{ width:36 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal:SP[4], paddingTop:SP[4] }} showsVerticalScrollIndicator={false}>

        {/* App version card */}
        <View style={{ flexDirection:'row',alignItems:'center',gap:SP[3],backgroundColor:C.surface,borderRadius:Radius.lg,borderWidth:0.5,borderColor:C.border,padding:SP[4],marginBottom:SP[6] }}>
          <View style={{ width:44,height:44,borderRadius:Radius.md,backgroundColor:'rgba(255,98,0,0.12)',alignItems:'center',justifyContent:'center' }}>
            <Ionicons name="construct" size={22} color={C.orange} />
          </View>
          <View>
            <Text style={{ fontSize:TY.base, fontWeight:Font.black, color:C.textPrimary }}>Tradease</Text>
            <Text style={{ fontSize:TY.xs, color:C.textMuted, marginTop:2 }}>Version 1.0.0 · Build 1</Text>
          </View>
          {/* Live theme preview chip */}
          <View style={{ marginLeft:'auto', backgroundColor: isDark ? 'rgba(255,98,0,0.12)' : 'rgba(255,98,0,0.10)', borderRadius:999, paddingHorizontal:10, paddingVertical:5, flexDirection:'row', alignItems:'center', gap:5 }}>
            <Ionicons name={isDark ? 'moon' : 'sunny'} size={13} color={C.orange} />
            <Text style={{ fontSize:11, fontWeight:Font.bold, color:C.orange }}>{modeLabel}</Text>
          </View>
        </View>

        <Section title="Account"     items={accountRows}  C={C} />
        <Section title="Preferences" items={prefRows}     C={C} />
        <Section title="Support"     items={supportRows}  C={C} />
        <Section title="Legal"       items={legalRows}    C={C} />
        <Section title="Danger Zone" items={dangerRows}   C={C} />

        <Text style={{ textAlign:'center', fontSize:TY.xs, color:C.textMuted, lineHeight:18, marginTop:SP[2], paddingHorizontal:SP[8] }}>
          © {new Date().getFullYear()} Tradease Inc. All rights reserved.
        </Text>

        <View style={{ height:SP[10] }} />
      </ScrollView>

      {signingOut && (
        <View style={{ ...StyleSheet.absoluteFillObject, backgroundColor:'rgba(0,0,0,0.7)', alignItems:'center', justifyContent:'center', gap:SP[3] }}>
          <ActivityIndicator color={C.orange} size="large" />
          <Text style={{ fontSize:TY.base, color:'#fff', fontWeight:Font.bold }}>Signing out...</Text>
        </View>
      )}

      <AppearanceModal visible={appearanceOpen} onClose={() => setAppearanceOpen(false)} />
    </SafeAreaView>
  );
}