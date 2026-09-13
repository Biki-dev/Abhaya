import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, borderRadius, shadows } from '../theme';
import {
  getStoredUserProfile,
  getUserProfile,
  updateUserProfile,
  type UserProfile,
} from '../services/api';

const EMPTY_PROFILE: UserProfile = {
  phone: '', name: '', email: '', gender: '', dateOfBirth: '', bloodGroup: '',
  address: '', city: '', guardianName: '', guardianPhone: '', createdAt: '', updatedAt: '',
};

type FieldKey = 'name' | 'email' | 'gender' | 'dateOfBirth' | 'bloodGroup' | 'address' | 'city' | 'guardianName' | 'guardianPhone';

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const loadProfile = useCallback(async () => {
    const local = await getStoredUserProfile();
    if (local?.phone) setProfile({ ...EMPTY_PROFILE, ...local });
    try {
      if (local?.phone) {
        const remote = await getUserProfile(local.phone);
        setProfile({ ...EMPTY_PROFILE, ...remote });
      }
    } catch {
      // Local data remains available when the device is offline.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const updateField = (field: FieldKey, value: string) => {
    setDirty(true);
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    if (!profile.name.trim()) {
      Alert.alert('Name required', 'Please enter your name before saving.');
      return;
    }
    setSaving(true);
    try {
      const saved = await updateUserProfile({
        phone: profile.phone,
        name: profile.name.trim(),
        email: profile.email.trim(),
        gender: profile.gender.trim(),
        dateOfBirth: profile.dateOfBirth.trim(),
        bloodGroup: profile.bloodGroup.trim(),
        address: profile.address.trim(),
        city: profile.city.trim(),
        guardianName: profile.guardianName.trim(),
        guardianPhone: profile.guardianPhone.trim(),
      });
      setProfile({ ...EMPTY_PROFILE, ...saved });
      setDirty(false);
      Alert.alert('Profile saved', 'Your profile details have been updated successfully.');
    } catch (error: any) {
      Alert.alert('Saved offline', error?.message ?? 'Could not reach the server. Your changes will sync when you are online.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value: string) => value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Not available';

  if (loading) {
    return <View style={styles.loading}><ActivityIndicator size="large" color={colors.primary} /><Text style={styles.loadingText}>Loading profile…</Text></View>;
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={20} color={colors.textSecondary} /><Text style={styles.backText}>Settings</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Full Profile</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{(profile.name || '?').charAt(0).toUpperCase()}</Text></View>
          <View style={styles.heroCopy}><Text style={styles.profileName}>{profile.name || 'Your profile'}</Text><Text style={styles.profilePhone}>{profile.phone || 'Phone not available'}</Text></View>
        </View>

        <View style={styles.registrationCard}>
          <View style={styles.registrationIcon}><Ionicons name="calendar-outline" size={18} color={colors.primary} /></View>
          <View><Text style={styles.registrationLabel}>Registered on</Text><Text style={styles.registrationValue}>{formatDate(profile.createdAt)}</Text></View>
          <View style={styles.readOnlyPill}><Text style={styles.readOnlyText}>Read-only</Text></View>
        </View>

        <Text style={styles.sectionTitle}>Personal details</Text>
        <View style={styles.card}>
          <Field label="Full name" value={profile.name} onChangeText={(v) => updateField('name', v)} placeholder="Your full name" />
          <Field label="Email address" value={profile.email} onChangeText={(v) => updateField('email', v)} placeholder="you@example.com" keyboardType="email-address" />
          <Field label="Gender" value={profile.gender} onChangeText={(v) => updateField('gender', v)} placeholder="e.g. Female, Male, Non-binary" />
          <Field label="Date of birth" value={profile.dateOfBirth} onChangeText={(v) => updateField('dateOfBirth', v)} placeholder="DD/MM/YYYY" />
          <Field label="Blood group" value={profile.bloodGroup} onChangeText={(v) => updateField('bloodGroup', v)} placeholder="e.g. O+" last />
        </View>

        <Text style={styles.sectionTitle}>Address</Text>
        <View style={styles.card}>
          <Field label="Address" value={profile.address} onChangeText={(v) => updateField('address', v)} placeholder="House number, street, locality" multiline />
          <Field label="City" value={profile.city} onChangeText={(v) => updateField('city', v)} placeholder="Your city" last />
        </View>

        <Text style={styles.sectionTitle}>Guardian details</Text>
        <View style={styles.card}>
          <Field label="Guardian name" value={profile.guardianName} onChangeText={(v) => updateField('guardianName', v)} placeholder="Trusted guardian's name" />
          <Field label="Guardian phone" value={profile.guardianPhone} onChangeText={(v) => updateField('guardianPhone', v)} placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" last />
        </View>

        <TouchableOpacity style={[styles.saveButton, (!dirty || saving) && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={styles.saveText}>{dirty ? 'Save changes' : 'Profile is up to date'}</Text></>}
        </TouchableOpacity>
        <Text style={styles.syncHint}>Changes are saved to your account and kept available offline.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, last }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: any; multiline?: boolean; last?: boolean }) {
  return <View style={[styles.field, last && styles.fieldLast]}><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, multiline && styles.multiline]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} multiline={multiline} /></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center', gap: spacing.md },
  loadingText: { ...typography.body, color: colors.muted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  backButton: { flexDirection: 'row', alignItems: 'center', width: 82 }, backText: { ...typography.bodySmall, color: colors.textSecondary }, headerTitle: { ...typography.heading, color: colors.text }, headerSpacer: { width: 82 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  hero: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg }, avatar: { width: 64, height: 64, borderRadius: 22, backgroundColor: colors.primary + '18', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }, avatarText: { fontSize: 26, color: colors.primary, fontFamily: 'Manrope_700Bold' }, heroCopy: { flex: 1 }, profileName: { ...typography.heading, color: colors.text }, profilePhone: { ...typography.bodySmall, color: colors.muted, marginTop: 3 },
  registrationCard: { flexDirection: 'row', alignItems: 'center', padding: spacing.md, backgroundColor: colors.surface, borderRadius: borderRadius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.xl, ...shadows.xs }, registrationIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primary + '14', alignItems: 'center', justifyContent: 'center', marginRight: spacing.md }, registrationLabel: { ...typography.caption, color: colors.muted }, registrationValue: { ...typography.body, color: colors.text, marginTop: 2 }, readOnlyPill: { marginLeft: 'auto', backgroundColor: colors.bg, borderRadius: borderRadius.full, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }, readOnlyText: { ...typography.caption, color: colors.textSecondary },
  sectionTitle: { ...typography.subheading, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.lg }, field: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, fieldLast: { borderBottomWidth: 0 }, label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs }, input: { ...typography.body, color: colors.text, padding: 0, minHeight: 24 }, multiline: { minHeight: 56, textAlignVertical: 'top' },
  saveButton: { minHeight: 52, borderRadius: borderRadius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }, saveButtonDisabled: { backgroundColor: colors.textSecondary }, saveText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_700Bold' }, syncHint: { ...typography.caption, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
});
