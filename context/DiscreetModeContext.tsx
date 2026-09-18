import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type DiscreetTriggerMode = 'hold' | 'tripleTap';

export type DiscreetModeSettings = {
  enabled: boolean;
  triggerMode: DiscreetTriggerMode;
};

type DiscreetModeContextType = DiscreetModeSettings & {
  isLoaded: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  setTriggerMode: (mode: DiscreetTriggerMode) => Promise<void>;
};

const STORAGE_KEY = 'AbhayaDiscreetModeSettings';
const DEFAULT_SETTINGS: DiscreetModeSettings = { enabled: false, triggerMode: 'hold' };

const DiscreetModeContext = createContext<DiscreetModeContextType | null>(null);

export function DiscreetModeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<DiscreetModeSettings>(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as Partial<DiscreetModeSettings>;
          setSettings({
            enabled: parsed.enabled === true,
            triggerMode: parsed.triggerMode === 'tripleTap' ? 'tripleTap' : 'hold',
          });
        } catch {
          // Ignore corrupt local preference and keep safe defaults.
        }
      })
      .finally(() => setIsLoaded(true));
  }, []);

  const persist = useCallback(async (next: DiscreetModeSettings) => {
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const setEnabled = useCallback((enabled: boolean) => persist({ ...settings, enabled }), [persist, settings]);
  const setTriggerMode = useCallback((triggerMode: DiscreetTriggerMode) => persist({ ...settings, triggerMode }), [persist, settings]);

  const value = useMemo(() => ({ ...settings, isLoaded, setEnabled, setTriggerMode }), [settings, isLoaded, setEnabled, setTriggerMode]);
  return <DiscreetModeContext.Provider value={value}>{children}</DiscreetModeContext.Provider>;
}

export function useDiscreetMode(): DiscreetModeContextType {
  const context = useContext(DiscreetModeContext);
  if (!context) throw new Error('useDiscreetMode must be used inside <DiscreetModeProvider>');
  return context;
}

export const discreetModeDefaults = DEFAULT_SETTINGS;
