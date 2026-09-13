import { Platform } from 'react-native';
import Purchases, {
  LOG_LEVEL,
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from 'react-native-purchases';
import { calculateYearlySavings, getSubscriptionPlan, type SubscriptionPlan } from '../utils/subscriptionPlan';

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
let configurationPromise: Promise<boolean> | null = null;

export type SubscriptionState = {
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOffering | null;
  plan: SubscriptionPlan;
  isPlusActive: boolean;
  isFamilyActive: boolean;
  isPremiumActive: boolean;
};

export function normalizeAppUserId(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits ? `abhaya:${digits}` : '';
}

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
  if (!appUserId) {
    configurationWarning = 'A valid authenticated user identity is required for subscriptions. The account remains on the Free plan.';
    return false;
  }
  if (configured) {
    try {
      await Purchases.logIn(appUserId);
      configurationWarning = '';
      return true;
    } catch (error) {
      configurationWarning = error instanceof Error ? error.message : 'RevenueCat is unavailable in this build.';
      return false;
    }
  }
  if (configurationPromise) return configurationPromise;

  configurationPromise = (async () => {
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
      Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.ERROR);
      if (!(await Purchases.isConfigured())) {
        Purchases.configure({ apiKey });
      }
      configured = true;
      await Purchases.logIn(appUserId);
      configurationWarning = '';
      return true;
    } catch (error) {
      configurationWarning = error instanceof Error ? error.message : 'RevenueCat is unavailable in this build.';
      return false;
    } finally {
      configurationPromise = null;
    }
  })();

  return configurationPromise;
}

export function getSubscriptionState(customerInfo: CustomerInfo | null): SubscriptionState {
  const active = customerInfo?.entitlements.active ?? {};
  const isFamilyActive = Boolean(active[ENTITLEMENTS.family]);
  const isPlusActive = Boolean(active[ENTITLEMENTS.plus]);
  return {
    customerInfo,
    offerings: null,
    plan: getSubscriptionPlan({ isPlusActive, isFamilyActive }),
    isPlusActive,
    isFamilyActive,
    isPremiumActive: isFamilyActive || isPlusActive,
  };
}

export function getSubscriptionSnapshot(customerInfo: CustomerInfo, phone: string) {
  const raw = customerInfo as unknown as {
    originalAppUserId?: string;
    requestDate?: string;
    originalPurchaseDate?: string | null;
    allPurchasedProductIdentifiers?: string[];
  };
  const state = getSubscriptionState(customerInfo);
  return {
    phone,
    revenueCatAppUserId: raw.originalAppUserId || normalizeAppUserId(phone),
    store: 'test_store' as const,
    plan: state.plan,
    activeEntitlements: Object.keys(customerInfo.entitlements.active ?? {}),
    purchasedProductIds: raw.allPurchasedProductIdentifiers ?? [],
    requestDate: raw.requestDate ?? null,
    originalPurchaseDate: raw.originalPurchaseDate ?? null,
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
  return (await Purchases.purchasePackage(packageToPurchase)).customerInfo;
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
    // Account logout must not be blocked by an offline RevenueCat call.
  }
}

export function isPurchaseCancelled(error: unknown) {
  const candidate = error as { userCancelled?: boolean; code?: string | number } | null;
  return Boolean(candidate?.userCancelled) || candidate?.code === '1' || candidate?.code === 1;
}

export { calculateYearlySavings };
export type { SubscriptionPlan } from '../utils/subscriptionPlan';
