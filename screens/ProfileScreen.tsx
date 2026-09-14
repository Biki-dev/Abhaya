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
  address: '', city: '', createdAt: '', updatedAt: '',
};

type FieldKey = 'name' | 'email' | 'gender' | 'dateOfBirth' | 'bloodGroup' | 'address' | 'city';
type FieldErrors = Partial<Record<FieldKey, string>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BLOOD_GROUPS = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);

function validateProfile(profile: UserProfile): FieldErrors {
  const errors: FieldErrors = {};
  const name = profile.name.trim();
  const email = profile.email.trim();
  const bloodGroup = profile.bloodGroup.trim().toUpperCase();
  const dateOfBirth = profile.dateOfBirth.trim();

  if (!name) errors.name = 'Full name is required.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or less.';
  if (email && !EMAIL_PATTERN.test(email)) errors.email = 'Enter a valid email address.';
  if (bloodGroup && !BLOOD_GROUPS.has(bloodGroup)) errors.bloodGroup = 'Use a valid group: A+, A-, B+, B-, AB+, AB-, O+, or O-.';
  if (dateOfBirth) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateOfBirth);
    const parsedDate = match ? new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1])) : null;
    if (!match || !parsedDate || parsedDate.getDate() !== Number(match[1]) || parsedDate.getMonth() !== Number(match[2]) - 1 || parsedDate > new Date()) {
      errors.dateOfBirth = 'Use a valid past date in DD/MM/YYYY format.';
    }
  }
  if (profile.gender.trim().length > 40) errors.gender = 'Gender must be 40 characters or less.';
  if (profile.address.trim().length > 250) errors.address = 'Address must be 250 characters or less.';
  if (profile.city.trim().length > 100) errors.city = 'City must be 100 characters or less.';
  return errors;
}

export default function ProfileScreen({ navigation }: any) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

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
    setErrors((current) => ({ ...current, [field]: undefined }));
    setProfile((current) => ({ ...current, [field]: value }));
  };

  const handleSave = async () => {
    const validationErrors = validateProfile(profile);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      Alert.alert('Check your details', 'Please correct the highlighted fields before saving.');
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
        bloodGroup: profile.bloodGroup.trim().toUpperCase(),
        address: profile.address.trim(),
        city: profile.city.trim(),
      });
      setProfile({ ...EMPTY_PROFILE, ...saved });
      setDirty(false);
      setErrors({});
      Alert.alert('Profile saved', 'Your profile details have been updated successfully.');
    } catch (error: any) {
      Alert.alert('Could not save profile', error?.message ?? 'Please check your details and try again.');
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
          <Field label="Full name" value={profile.name} error={errors.name} onChangeText={(v) => updateField('name', v)} placeholder="Your full name" />
          <Field label="Email address" value={profile.email} error={errors.email} onChangeText={(v) => updateField('email', v)} placeholder="you@example.com" keyboardType="email-address" />
          <Field label="Gender" value={profile.gender} error={errors.gender} onChangeText={(v) => updateField('gender', v)} placeholder="e.g. Female, Male, Non-binary" />
          <Field label="Date of birth" value={profile.dateOfBirth} error={errors.dateOfBirth} onChangeText={(v) => updateField('dateOfBirth', v)} placeholder="DD/MM/YYYY" />
          <Field label="Blood group" value={profile.bloodGroup} error={errors.bloodGroup} onChangeText={(v) => updateField('bloodGroup', v)} placeholder="e.g. O+" last />
        </View>

        <Text style={styles.sectionTitle}>Address</Text>
        <View style={styles.card}>
          <Field label="Address" value={profile.address} error={errors.address} onChangeText={(v) => updateField('address', v)} placeholder="House number, street, locality" multiline />
          <Field label="City" value={profile.city} error={errors.city} onChangeText={(v) => updateField('city', v)} placeholder="Your city" last />
        </View>

        <TouchableOpacity style={[styles.saveButton, (!dirty || saving) && styles.saveButtonDisabled]} onPress={handleSave} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" /> : <><Ionicons name="cloud-upload-outline" size={18} color="#fff" /><Text style={styles.saveText}>{dirty ? 'Save changes' : 'Profile is up to date'}</Text></>}
        </TouchableOpacity>
        <Text style={styles.syncHint}>Changes are saved to your account and kept available offline.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, value, error, onChangeText, placeholder, keyboardType, multiline, last }: { label: string; value: string; error?: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: any; multiline?: boolean; last?: boolean }) {
  return <View style={[styles.field, last && styles.fieldLast]}><Text style={styles.label}>{label}</Text><TextInput style={[styles.input, multiline && styles.multiline, error && styles.inputError]} value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.muted} keyboardType={keyboardType} multiline={multiline} /><Text style={[styles.errorText, !error && styles.hiddenError]}>{error || ' '}</Text></View>;
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
  sectionTitle: { ...typography.subheading, color: colors.text, marginBottom: spacing.sm, marginTop: spacing.sm }, card: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, paddingHorizontal: spacing.lg, marginBottom: spacing.lg }, field: { paddingTop: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }, fieldLast: { borderBottomWidth: 0 }, label: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.xs }, input: { ...typography.body, color: colors.text, padding: 0, minHeight: 24 }, inputError: { color: colors.danger }, multiline: { minHeight: 56, textAlignVertical: 'top' }, errorText: { ...typography.caption, color: colors.danger, marginTop: spacing.xs, marginBottom: spacing.xs }, hiddenError: { color: 'transparent' },
  saveButton: { minHeight: 52, borderRadius: borderRadius.lg, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }, saveButtonDisabled: { backgroundColor: colors.textSecondary }, saveText: { ...typography.body, color: '#fff', fontFamily: 'Manrope_700Bold' }, syncHint: { ...typography.caption, color: colors.muted, textAlign: 'center', marginTop: spacing.md },
});
