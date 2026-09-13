import { describe, expect, it } from 'vitest';
import { calculateYearlySavings, getSubscriptionErrorMessage, getSubscriptionPlan, isPremiumFeatureAvailable } from '../utils/subscriptionPlan';

describe('subscription plan mapping', () => {
  it('keeps users on Free without active entitlements', () => expect(getSubscriptionPlan({ isPlusActive: false, isFamilyActive: false })).toBe('free'));
  it('maps Plus and Family independently', () => {
    expect(getSubscriptionPlan({ isPlusActive: true, isFamilyActive: false })).toBe('plus');
    expect(getSubscriptionPlan({ isPlusActive: true, isFamilyActive: true })).toBe('family');
  });
  it('allows Family to use Plus features but not vice versa', () => {
    expect(isPremiumFeatureAvailable('family', 'plus')).toBe(true);
    expect(isPremiumFeatureAvailable('plus', 'family')).toBe(false);
    expect(isPremiumFeatureAvailable('free', 'plus')).toBe(false);
  });
});

describe('yearly savings', () => {
  it('calculates savings only when both valid prices exist', () => {
    expect(calculateYearlySavings(10, 100)).toBe(17);
    expect(calculateYearlySavings(null, 100)).toBeNull();
    expect(calculateYearlySavings(10, null)).toBeNull();
    expect(calculateYearlySavings(10, 120)).toBe(0);
  });
});

describe('subscription errors', () => {
  it('handles cancelled purchases and unavailable offerings safely', () => {
    expect(getSubscriptionErrorMessage(new Error('User cancelled'), 'purchase')).toContain('cancelled');
    expect(getSubscriptionErrorMessage(new Error('No current offering'), 'load')).toContain('Plans are temporarily unavailable');
    expect(getSubscriptionErrorMessage(new Error('network unavailable'), 'restore')).toContain('RevenueCat could not connect');
  });
});
