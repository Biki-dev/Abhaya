import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';

export const ENTITLEMENTS = {
  plus: 'abhaya_plus',
  family: 'abhaya_family',
} as const;

export const PRODUCT_IDS = {
  plusMonthly: 'abhaya_plus_monthly_test',
  plusYearly: 'abhaya_plus_yearly_test',
  familyMonthly: 'abhaya_family_monthly_test',
  familyYearly: 'abhaya_family_yearly_test',
} as const;

let configured = false;
let configurationWarning = '';

export type SubscriptionPlan = 'free' | 'plus' | 'family';

export type SubscriptionState = {
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  plan: SubscriptionPlan;
  isPlusActive: boolean;
  isFamilyActive: boolean;
  isPremiumActive: boolean;
};

export function getRevenueCatApiKey() {
  return Platform.OS === 'ios'
    ? process.env.EXPO_PUBLIC_REVENUECAT_TEST_APPLE_KEY?.trim()
    : Platform.OS === 'android'
      ? process.env.EXPO_PUBLIC_REVENUECAT_TEST_GOOGLE_KEY?.trim()
      : undefined;
}

export function getRevenueCatConfigurationWarning() {
  return configurationWarning;
}

export async function configureRevenueCat(appUserId: string) {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    configurationWarning = 'RevenueCat subscriptions are available in the iOS/Android development build.';
    return false;
  }
  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    configurationWarning = 'Test Store API key is not configured. The account remains on the Free plan.';
    return false;
  }
  try {
    if (!configured && !(await Purchases.isConfigured())) {
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
      Purchases.configure({ apiKey });
      configured = true;
    }
    await Purchases.logIn(appUserId);
    configurationWarning = '';
    return true;
  } catch (error) {
    configurationWarning = error instanceof Error ? error.message : 'RevenueCat is unavailable in this build.';
    return false;
  }
}

export function getSubscriptionState(customerInfo: CustomerInfo | null): SubscriptionState {
  const active = customerInfo?.entitlements.active ?? {};
  const isFamilyActive = Boolean(active[ENTITLEMENTS.family]);
  const isPlusActive = Boolean(active[ENTITLEMENTS.plus]);
  return {
    customerInfo,
    offerings: null,
    plan: isFamilyActive ? 'family' : isPlusActive ? 'plus' : 'free',
    isPlusActive,
    isFamilyActive,
    isPremiumActive: isFamilyActive || isPlusActive,
  };
}

export async function getCurrentSubscriptionInfo() {
  if (!configured) return null;
  return Purchases.getCustomerInfo();
}

export async function getCurrentOffering() {
  if (!configured) return null;
  const offerings = await Purchases.getOfferings();
  return offerings.current ?? null;
}

export async function purchaseSubscription(packageToPurchase: PurchasesPackage) {
  if (!configured) throw new Error('RevenueCat Test Store is not configured for this development build.');
  const result = await Purchases.purchasePackage(packageToPurchase);
  return result.customerInfo;
}

export async function restoreSubscriptions() {
  if (!configured) throw new Error('RevenueCat Test Store is not configured for this development build.');
  return Purchases.restorePurchases();
}

export async function openManageSubscriptions() {
  if (!configured) throw new Error('Subscription management is available in a store development build.');
  return Purchases.showManageSubscriptions();
}

export async function logoutRevenueCat() {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Logout must not prevent the Abhaya account from logging out.
  }
}

export function isPurchaseCancelled(error: any) {
  return Boolean(error?.userCancelled) || error?.code === '1' || error?.code === 1;
}
