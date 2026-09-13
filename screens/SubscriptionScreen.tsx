import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { PurchasesPackage } from 'react-native-purchases';
import { colors, spacing, typography, borderRadius, shadows } from '../theme';
import { isPurchaseCancelled, PRODUCT_IDS } from '../services/revenueCat';
import { useSubscription } from '../context/SubscriptionContext';

const PLUS_IDS: Set<string> = new Set([PRODUCT_IDS.plusMonthly, PRODUCT_IDS.plusYearly]);
const FAMILY_IDS: Set<string> = new Set([PRODUCT_IDS.familyMonthly, PRODUCT_IDS.familyYearly]);

export default function SubscriptionScreen({ navigation }: any) {
  const { offering, plan, isLoading, warning, purchase, restore, manageSubscriptions, refresh } = useSubscription();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => { refresh(); }, [refresh]);

  const packages = useMemo(() => offering?.availablePackages ?? [], [offering]);
  const plusPackages = packages.filter((item) => PLUS_IDS.has(item.product.identifier));
  const familyPackages = packages.filter((item) => FAMILY_IDS.has(item.product.identifier));

  const handlePurchase = useCallback(async (item: PurchasesPackage) => {
    setBusyId(item.identifier);
    try {
      await purchase(item);
      Alert.alert('Plan activated', 'Your purchased features are now available for this account.');
    } catch (error: any) {
      if (!isPurchaseCancelled(error)) {
        Alert.alert('Purchase not completed', error?.message ?? 'The purchase could not be completed. Your current plan is unchanged.');
      }
    } finally {
      setBusyId(null);
    }
  }, [purchase]);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await restore();
      Alert.alert('Purchases restored', 'Your active plan has been refreshed.');
    } catch (error: any) {
      Alert.alert('Restore unavailable', error?.message ?? 'Could not restore purchases right now. Please try again later.');
    } finally {
      setRestoring(false);
    }
  };

  const renderPackage = (item: PurchasesPackage, highlight = false) => (
    <View key={item.identifier} style={[styles.packageCard, highlight && styles.packageHighlight]}>
      <View style={styles.packageInfo}>
        <Text style={styles.packageTitle}>{item.product.title || item.product.identifier}</Text>
        <Text style={styles.packageDescription}>{item.product.description || 'Unlock more safety features for this account.'}</Text>
        <Text style={styles.packagePrice}>{item.product.priceString} <Text style={styles.packagePeriod}>{item.product.subscriptionPeriod ? `· ${item.product.subscriptionPeriod}` : ''}</Text></Text>
      </View>
      <TouchableOpacity style={styles.buyButton} onPress={() => handlePurchase(item)} disabled={busyId !== null}>
        {busyId === item.identifier ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.buyText}>Choose</Text>}
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Ionicons name="chevron-back" size={20} color={colors.textSecondary} /><Text style={styles.backText}>Settings</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>Plans & Payments</Text>
        <View style={styles.headerSpacer} />
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.testBadge}><Ionicons name="flask-outline" size={15} color={colors.warning} /><Text style={styles.testBadgeText}>TEST MODE — NO REAL CHARGE</Text></View>
        <Text style={styles.title}>Protect more with Abhaya</Text>
        <Text style={styles.subtitle}>Choose a plan for this Abhaya account. Core SOS protection always stays free.</Text>

        <View style={styles.currentPlan}><View><Text style={styles.currentLabel}>Current plan</Text><Text style={styles.currentValue}>{plan === 'family' ? 'Abhaya Family' : plan === 'plus' ? 'Abhaya Plus' : 'Free'}</Text></View><Ionicons name={plan === 'free' ? 'shield-outline' : 'shield-checkmark'} size={30} color={plan === 'free' ? colors.muted : colors.safe} /></View>

        {warning ? <View style={styles.warning}><Ionicons name="information-circle-outline" size={18} color={colors.warning} /><Text style={styles.warningText}>{warning}</Text></View> : null}
        {isLoading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.loadingText}>Loading Test Store plans…</Text></View> : null}

        <Text style={styles.sectionTitle}>Abhaya Plus</Text>
        <Text style={styles.featureText}>Unlimited emergency contacts, full route history, enhanced safety history, and guardian sharing.</Text>
        {plusPackages.length ? plusPackages.map((item, index) => renderPackage(item, index === 1)) : <EmptyPackages />}

        <Text style={styles.sectionTitle}>Abhaya Family</Text>
        <Text style={styles.featureText}>Everything in Plus, plus family-wide safety status and support for up to five family members.</Text>
        {familyPackages.length ? familyPackages.map((item, index) => renderPackage(item, index === 1)) : <EmptyPackages />}

        <TouchableOpacity style={styles.secondaryButton} onPress={handleRestore} disabled={restoring}>{restoring ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="refresh-outline" size={18} color={colors.primary} />}<Text style={styles.secondaryText}>{restoring ? 'Restoring…' : 'Restore Purchases'}</Text></TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => manageSubscriptions().catch((error) => Alert.alert('Not available', error?.message ?? 'Subscription management is not available in this build.'))}><Ionicons name="settings-outline" size={18} color={colors.primary} /><Text style={styles.secondaryText}>Manage Subscription</Text></TouchableOpacity>
        <View style={styles.legal}><Text style={styles.legalText}>Subscriptions are handled by the app store through RevenueCat Test Store. Test purchases do not charge money.</Text><TouchableOpacity onPress={() => Linking.openURL('https://www.apple.com/legal/internet-services/itunes/dev/stdeula/')}><Text style={styles.legalLink}>Terms of Use</Text></TouchableOpacity></View>
      </ScrollView>
    </View>
  );
}

function EmptyPackages() { return <View style={styles.empty}><Text style={styles.emptyText}>No Test Store products are configured yet.</Text><Text style={styles.emptyHint}>Create the product IDs in RevenueCat and attach them to the default offering.</Text></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.lg, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border }, backButton: { flexDirection: 'row', alignItems: 'center', width: 82 }, backText: { ...typography.bodySmall, color: colors.textSecondary }, headerTitle: { ...typography.heading, color: colors.text }, headerSpacer: { width: 82 }, content: { padding: spacing.lg, paddingBottom: spacing.xxxl }, testBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: borderRadius.full, backgroundColor: colors.warning + '18', marginBottom: spacing.lg }, testBadgeText: { ...typography.caption, color: colors.warning, fontFamily: 'Manrope_700Bold' }, title: { ...typography.title, color: colors.text, fontSize: 26, lineHeight: 32 }, subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, marginBottom: spacing.lg }, currentPlan: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.lg, marginBottom: spacing.lg, ...shadows.xs }, currentLabel: { ...typography.caption, color: colors.muted }, currentValue: { ...typography.heading, color: colors.text, marginTop: 3 }, warning: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.warning + '15', borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.lg }, warningText: { ...typography.caption, color: colors.text, flex: 1 }, loading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg }, loadingText: { ...typography.bodySmall, color: colors.muted }, sectionTitle: { ...typography.subheading, color: colors.text, marginTop: spacing.lg }, featureText: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.sm }, packageCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.sm }, packageHighlight: { borderColor: colors.primary, backgroundColor: colors.primary + '08' }, packageInfo: { flex: 1 }, packageTitle: { ...typography.body, color: colors.text, fontFamily: 'Manrope_700Bold' }, packageDescription: { ...typography.caption, color: colors.muted, marginTop: 2 }, packagePrice: { ...typography.subheading, color: colors.text, marginTop: spacing.xs }, packagePeriod: { ...typography.caption, color: colors.muted }, buyButton: { backgroundColor: colors.primary, borderRadius: borderRadius.md, minWidth: 76, paddingVertical: spacing.sm, alignItems: 'center' }, buyText: { ...typography.bodySmall, color: '#fff', fontFamily: 'Manrope_700Bold' }, empty: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.sm }, emptyText: { ...typography.bodySmall, color: colors.text }, emptyHint: { ...typography.caption, color: colors.muted, marginTop: spacing.xs }, secondaryButton: { minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, backgroundColor: colors.surface, marginTop: spacing.md }, secondaryText: { ...typography.body, color: colors.primary, fontFamily: 'Manrope_700Bold' }, legal: { alignItems: 'center', marginTop: spacing.xl, gap: spacing.sm }, legalText: { ...typography.caption, color: colors.muted, textAlign: 'center' }, legalLink: { ...typography.caption, color: colors.primary, textDecorationLine: 'underline' },
});
