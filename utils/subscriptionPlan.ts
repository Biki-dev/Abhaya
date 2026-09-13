export type SubscriptionPlan = 'free' | 'plus' | 'family';

export function getSubscriptionPlan(state: { isPlusActive: boolean; isFamilyActive: boolean }): SubscriptionPlan {
  if (state.isFamilyActive) return 'family';
  if (state.isPlusActive) return 'plus';
  return 'free';
}

export function calculateYearlySavings(monthlyPrice: number | null, yearlyPrice: number | null) {
  if (monthlyPrice == null || yearlyPrice == null || monthlyPrice <= 0 || yearlyPrice < 0) return null;
  const annualMonthlyCost = monthlyPrice * 12;
  if (yearlyPrice >= annualMonthlyCost) return 0;
  return Math.round(((annualMonthlyCost - yearlyPrice) / annualMonthlyCost) * 100);
}

export function isPremiumFeatureAvailable(plan: SubscriptionPlan, required: 'plus' | 'family') {
  return required === 'plus' ? plan === 'plus' || plan === 'family' : plan === 'family';
}

export function getSubscriptionErrorMessage(error: unknown, action: 'purchase' | 'restore' | 'load' = 'purchase') {
  const message = error instanceof Error ? error.message : '';
  const lower = message.toLowerCase();
  if (action === 'purchase' && (lower.includes('cancel') || lower.includes('user cancelled'))) return 'Purchase cancelled. Your current plan is unchanged.';
  if (lower.includes('already') && lower.includes('purchase')) return 'This subscription is already active for this account.';
  if (lower.includes('network') || lower.includes('offline') || lower.includes('internet')) return 'RevenueCat could not connect. Check your connection and try again.';
  if (action === 'restore') return message || 'Could not restore purchases right now. Your current plan is unchanged.';
  if (action === 'load') return 'Plans are temporarily unavailable. SOS and core safety features remain available on Free.';
  return message || 'The purchase could not be completed. Your current plan is unchanged.';
}
