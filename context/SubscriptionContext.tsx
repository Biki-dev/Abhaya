import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { CustomerInfo, PurchasesOffering, PurchasesPackage } from 'react-native-purchases';
import { getStoredUserPhone, saveSubscriptionSnapshot } from '../services/api';
import {
  configureRevenueCat,
  getCurrentOffering,
  getCurrentSubscriptionInfo,
  getRevenueCatConfigurationWarning,
  getSubscriptionState,
  getSubscriptionSnapshot,
  normalizeAppUserId,
  purchaseSubscription,
  restoreSubscriptions,
  type SubscriptionPlan,
  openManageSubscriptions,
} from '../services/revenueCat';
import { getSubscriptionErrorMessage } from '../utils/subscriptionPlan';

type SubscriptionContextValue = {
  customerInfo: CustomerInfo | null;
  offering: PurchasesOffering | null;
  plan: SubscriptionPlan;
  isPlusActive: boolean;
  isFamilyActive: boolean;
  isPremiumActive: boolean;
  isLoading: boolean;
  warning: string;
  refresh: () => Promise<void>;
  purchase: (packageToPurchase: PurchasesPackage) => Promise<void>;
  restore: () => Promise<void>;
  manageSubscriptions: () => Promise<void>;
};

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [warning, setWarning] = useState('');

  const persistSnapshot = useCallback(async (info: CustomerInfo, phone: string) => {
    try {
      await saveSubscriptionSnapshot(getSubscriptionSnapshot(info, phone));
    } catch {
      // Purchase history sync is best-effort and must never block safety or access.
    }
  }, []);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setWarning('');
    try {
      const phone = await getStoredUserPhone();
      if (!phone) {
        setCustomerInfo(null);
        setOffering(null);
        return;
      }
      const enabled = await configureRevenueCat(normalizeAppUserId(phone));
      setWarning(getRevenueCatConfigurationWarning());
      if (!enabled) return;
      const [info, currentOffering] = await Promise.all([
        getCurrentSubscriptionInfo(),
        getCurrentOffering(),
      ]);
      setCustomerInfo(info);
      setOffering(currentOffering);
      if (info) void persistSnapshot(info, phone);
      if (!currentOffering) setWarning('No active Test Store offering is configured yet. The account remains on the Free plan.');
    } catch (error) {
      setWarning(getSubscriptionErrorMessage(error, 'load'));
    } finally {
      setIsLoading(false);
    }
  }, [persistSnapshot]);

  useEffect(() => { refresh(); }, [refresh]);

  const purchase = useCallback(async (packageToPurchase: PurchasesPackage) => {
    const info = await purchaseSubscription(packageToPurchase);
    setCustomerInfo(info);
    const phone = await getStoredUserPhone();
    if (phone) void persistSnapshot(info, phone);
  }, [persistSnapshot]);

  const restore = useCallback(async () => {
    const info = await restoreSubscriptions();
    setCustomerInfo(info);
    const phone = await getStoredUserPhone();
    if (phone) void persistSnapshot(info, phone);
  }, [persistSnapshot]);

  const manageSubscriptions = useCallback(async () => {
    await openManageSubscriptions();
  }, []);

  const state = getSubscriptionState(customerInfo);
  const value = useMemo(() => ({
    ...state,
    offering,
    isLoading,
    warning,
    refresh,
    purchase,
    restore,
    manageSubscriptions,
  }), [state, offering, isLoading, warning, refresh, purchase, restore, manageSubscriptions]);

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>;
}

export function useSubscription() {
  const context = useContext(SubscriptionContext);
  if (!context) throw new Error('useSubscription must be used within SubscriptionProvider');
  return context;
}
