
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, typography, sizes, borderRadius } from '../theme';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { upsertUser } from '../services/api';
import { setContacts as saveEmergencyContacts } from '../services/emergencyContacts';

export default function OnboardingScreen({ navigation, onComplete }: any) {
  const [step, setStep] = useState<'phone' | 'otp' | 'profile' | 'contacts'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [contacts, setContacts] = useState([{ name: '', phone: '' }]);

  const handlePhoneSubmit = () => {
    if (phone.length >= 10) setStep('otp');
  };

  const handleOtpSubmit = () => {
    if (otp.length === 4) setStep('profile');
  };

  const handleProfileSubmit = () => {
    if (name.length > 0) setStep('contacts');
  };

  const handleAddContact = () => {
    setContacts([...contacts, { name: '', phone: '' }]);
  };

  const handleContactChange = (index: number, field: 'name' | 'phone', value: string) => {
    const updated = [...contacts];
    updated[index][field] = value;
    setContacts(updated);
  };

  const handleRemoveContact = (index: number) => {
    if (contacts.length === 1) return; // keep at least one row
    setContacts(contacts.filter((_, i) => i !== index));
  };

  const handleFinish = async () => {
    const validContacts = contacts.filter((c) => c.name.trim() && c.phone.trim());

    const userData = {
      phone,
      name,
      email,
      // Legacy field kept for backwards-compat (Settings screen reads this
      // as a fallback, but the real source of truth is emergencyContacts service)
      contacts: validContacts,
      onboardingComplete: true,
    };

    await AsyncStorage.setItem('AbhayaUserData', JSON.stringify(userData));

    // 1. Upsert user in backend (MANDATORY for first-time sync)
    try {
      console.log('[Onboarding] Upserting user:', { phone, name, email });
      const user = await upsertUser({ phone, name, email });
      console.log('[Onboarding] User upserted successfully:', user);
    } catch (err) {
      console.error('[Onboarding] Backend user sync failed:', err);
      // Even if it fails, we continue so the user can use the app offline.
      // But contact sync might fail until the user is created in DB.
    }

    // 2. Save emergency contacts via the offline-first service.
    //    This writes to AsyncStorage first, then pushes to backend in background.
    if (validContacts.length > 0) {
      try {
        console.log('[Onboarding] Saving contacts:', validContacts);
        // We use await here to ensure it's saved to AsyncStorage before moving on,
        // although backgroundSync inside saveEmergencyContacts is fire-and-forget.
        await saveEmergencyContacts(validContacts);
        console.log('[Onboarding] Contacts saved to local storage and sync triggered');
      } catch (err) {
        console.error('[Onboarding] Emergency contacts save failed:', err);
      }
    }

    if (typeof onComplete === 'function') {
      onComplete(phone);
      return;
    }

    navigation.replace('App');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoBadge}>
            <Ionicons name="shield-checkmark" size={18} color={colors.primary} />
            <Text style={styles.logo}>Abhaya</Text>
          </View>
          <Text style={styles.tagline}>Personal safety, designed to feel calm and reliable</Text>
          <View style={styles.stepDots}>
            <View style={[styles.dot, step === 'phone' ? styles.dotActive : null]} />
            <View style={[styles.dot, step === 'otp' ? styles.dotActive : null]} />
            <View style={[styles.dot, step === 'profile' ? styles.dotActive : null]} />
            <View style={[styles.dot, step === 'contacts' ? styles.dotActive : null]} />
          </View>
        </View>

        {/* ── Phone ── */}
        {step === 'phone' && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Enter Your Phone Number</Text>
            <Text style={styles.subtitle}>We'll verify it with a one-time code</Text>
            <View style={styles.inputGroup}>
              <View style={styles.phoneInput}>
                <Ionicons name="call-outline" size={18} color={colors.muted} />
                <Text style={styles.countryCode}>+91</Text>
                <TextInput
                  style={styles.input}
                  placeholder="98765 43210"
                  placeholderTextColor={colors.muted}
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  maxLength={10}
                />
              </View>
            </View>
            <TouchableOpacity
              style={[styles.button, phone.length >= 10 ? styles.buttonActive : styles.buttonDisabled]}
              onPress={handlePhoneSubmit}
              disabled={phone.length < 10}
            >
              <Text style={styles.buttonText}>Send OTP</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── OTP ── */}
        {step === 'otp' && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Verify OTP</Text>
            <Text style={styles.subtitle}>Enter the 4-digit code we sent to +91 {phone}</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.otpInput}
                placeholder="0000"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                value={otp}
                onChangeText={setOtp}
                maxLength={4}
              />
            </View>
            <TouchableOpacity
              style={[styles.button, otp.length === 4 ? styles.buttonActive : styles.buttonDisabled]}
              onPress={handleOtpSubmit}
              disabled={otp.length < 4}
            >
              <Text style={styles.buttonText}>Verify</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep('phone')}>
              <Text style={styles.link}>Use a different phone number</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Profile ── */}
        {step === 'profile' && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Your Profile</Text>
            <Text style={styles.subtitle}>Help your guardians know who they're protecting</Text>
            <View style={styles.inputGroup}>
              <TextInput
                style={styles.inputField}
                placeholder="Your Name"
                placeholderTextColor={colors.muted}
                value={name}
                onChangeText={setName}
              />
              <TextInput
                style={[styles.inputField, styles.inputMargin]}
                placeholder="Email (optional)"
                placeholderTextColor={colors.muted}
                value={email}
                onChangeText={setEmail}
              />
            </View>
            <TouchableOpacity
              style={[styles.button, name.length > 0 ? styles.buttonActive : styles.buttonDisabled]}
              onPress={handleProfileSubmit}
              disabled={name.length === 0}
            >
              <Text style={styles.buttonText}>Continue</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Emergency Contacts ── */}
        {step === 'contacts' && (
          <View style={styles.stepContainer}>
            <Text style={styles.title}>Emergency Contacts</Text>
            <Text style={styles.subtitle}>
              Add people who'll receive your SOS alerts. These are stored securely
              and work even without internet.
            </Text>

            <View style={styles.contactsList}>
              {contacts.map((contact, index) => (
                <View key={index} style={styles.contactCard}>
                  <View style={styles.contactCardHeader}>
                    <Text style={styles.contactCardLabel}>Contact {index + 1}</Text>
                    {contacts.length > 1 && (
                      <TouchableOpacity onPress={() => handleRemoveContact(index)}>
                        <Text style={styles.removeText}>Remove</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput
                    style={styles.inputField}
                    placeholder="Contact Name"
                    placeholderTextColor={colors.muted}
                    value={contact.name}
                    onChangeText={(v) => handleContactChange(index, 'name', v)}
                  />
                  <TextInput
                    style={[styles.inputField, styles.inputMargin]}
                    placeholder="Phone Number (+91XXXXXXXXXX)"
                    placeholderTextColor={colors.muted}
                    keyboardType="phone-pad"
                    value={contact.phone}
                    onChangeText={(v) => handleContactChange(index, 'phone', v)}
                  />
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.addContactButton} onPress={handleAddContact}>
              <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
              <Text style={styles.addContactText}>Add another contact</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.button, styles.buttonActive]} onPress={handleFinish}>
              <Text style={styles.buttonText}>Get Started</Text>
            </TouchableOpacity>

            <Text style={styles.skipNote}>
              You can add contacts later from Settings
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.xxxl,
  },
  logoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.md,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  logo: {
    ...typography.title,
    color: colors.text,
  },
  tagline: {
    ...typography.bodySmall,
    color: colors.muted,
    textAlign: 'center',
  },
  stepDots: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: spacing.lg,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.inactive,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 18,
  },
  stepContainer: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    shadowColor: '#1A202C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  title: {
    ...typography.title,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
    marginBottom: spacing.xxl,
  },
  inputGroup: {
    marginBottom: spacing.xxl,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
  },
  inputField: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    color: colors.text,
    fontSize: 16,
    fontFamily: 'Manrope_500Medium',
  },
  inputMargin: {
    marginTop: spacing.lg,
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
  },
  countryCode: {
    color: colors.text,
    fontSize: 16,
    marginRight: spacing.md,
    marginLeft: spacing.sm,
    fontFamily: 'Manrope_600SemiBold',
  },
  button: {
    height: sizes.buttonHeight,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  buttonActive: {
    backgroundColor: colors.primary,
  },
  buttonDisabled: {
    backgroundColor: colors.inactive,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontFamily: 'Manrope_700Bold',
  },
  link: {
    color: colors.primary,
    textAlign: 'center',
    marginTop: spacing.lg,
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  otpInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    color: colors.text,
    fontSize: 32,
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 12,
    textAlign: 'center',
  },
  contactsList: {
    marginBottom: spacing.lg,
    gap: spacing.lg,
  },
  contactCard: {
    backgroundColor: colors.bg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  contactCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  contactCardLabel: {
    ...typography.caption,
    color: colors.muted,
    fontFamily: 'Manrope_600SemiBold',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  removeText: {
    fontSize: 12,
    color: colors.danger,
    fontFamily: 'Manrope_600SemiBold',
  },
  addContactButton: {
    paddingVertical: spacing.lg,
    marginBottom: spacing.xxl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  addContactText: {
    color: colors.primary,
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  skipNote: {
    ...typography.caption,
    color: colors.muted,
    textAlign: 'center',
    marginTop: spacing.md,
  },
});