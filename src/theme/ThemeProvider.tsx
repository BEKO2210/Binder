import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import {
  accentThemes,
  darkPalette,
  feedback,
  elevation,
  layout,
  lightPalette,
  motion,
  radii,
  spacing,
  typography,
  resolveAccentTheme,
  semanticPalettes,
  type AccentThemeId,
  type AppearanceMode,
  type BinderTheme,
  type MotionPreference,
} from './tokens';

const SETTINGS_KEY = 'binder:app-settings:v1';

export type NotificationPreferences = {
  enabled: boolean;
  newMatches: boolean;
  messages: boolean;
  moderation: boolean;
  safety: boolean;
  product: boolean;
  sound: boolean;
  vibration: boolean;
};

export type QuietHours = {
  enabled: boolean;
  start: string;
  end: string;
};

export type AppSettings = {
  appearance: AppearanceMode;
  accentTheme: AccentThemeId;
  hapticsEnabled: boolean;
  motion: MotionPreference;
  notifications: NotificationPreferences;
  quietHours: QuietHours;
};

const defaultSettings: AppSettings = {
  appearance: 'system',
  accentTheme: 'lime',
  hapticsEnabled: true,
  motion: 'system',
  notifications: {
    enabled: true,
    newMatches: true,
    messages: true,
    moderation: true,
    safety: true,
    product: false,
    sound: true,
    vibration: true,
  },
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '08:00',
  },
};

type ThemeContextValue = {
  theme: BinderTheme;
  settings: AppSettings;
  hydrated: boolean;
  reduceMotion: boolean;
  updateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  updateNotifications: (patch: Partial<NotificationPreferences>) => Promise<void>;
  updateQuietHours: (patch: Partial<QuietHours>) => Promise<void>;
  resetSettings: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function sanitizeSettings(candidate: unknown): AppSettings {
  if (!candidate || typeof candidate !== 'object') return defaultSettings;
  const raw = candidate as Partial<AppSettings>;
  const accentTheme = raw.accentTheme && raw.accentTheme in accentThemes ? raw.accentTheme : defaultSettings.accentTheme;
  const appearance = raw.appearance === 'dark' || raw.appearance === 'system' ? raw.appearance : defaultSettings.appearance;
  const motionPreference = raw.motion === 'reduce' || raw.motion === 'full' || raw.motion === 'system' ? raw.motion : defaultSettings.motion;
  return {
    ...defaultSettings,
    ...raw,
    accentTheme,
    appearance,
    motion: motionPreference,
    notifications: { ...defaultSettings.notifications, ...(raw.notifications ?? {}) },
    quietHours: { ...defaultSettings.quietHours, ...(raw.quietHours ?? {}) },
  };
}

export function BinderThemeProvider({ children }: PropsWithChildren) {
  const systemScheme = useColorScheme();
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [hydrated, setHydrated] = useState(false);
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([
      AsyncStorage.getItem(SETTINGS_KEY),
      AccessibilityInfo.isReduceMotionEnabled(),
    ])
      .then(([saved, reduceMotionEnabled]) => {
        if (!active) return;
        if (saved) {
          try {
            setSettings(sanitizeSettings(JSON.parse(saved)));
          } catch {
            setSettings(defaultSettings);
          }
        }
        setSystemReduceMotion(reduceMotionEnabled);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });

    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystemReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const persist = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    await persist(sanitizeSettings({ ...settings, ...patch }));
  }, [persist, settings]);

  const updateNotifications = useCallback(async (patch: Partial<NotificationPreferences>) => {
    await persist({ ...settings, notifications: { ...settings.notifications, ...patch } });
  }, [persist, settings]);

  const updateQuietHours = useCallback(async (patch: Partial<QuietHours>) => {
    await persist({ ...settings, quietHours: { ...settings.quietHours, ...patch } });
  }, [persist, settings]);

  const resetSettings = useCallback(async () => {
    await persist(defaultSettings);
  }, [persist]);

  const reduceMotion = settings.motion === 'reduce' || (settings.motion === 'system' && systemReduceMotion);
  const resolvedMode = settings.appearance === 'dark' ? 'dark' : systemScheme === 'light' ? 'light' : 'dark';

  const theme = useMemo<BinderTheme>(() => ({
    mode: resolvedMode,
    colors: resolvedMode === 'light' ? lightPalette : darkPalette,
    accent: resolveAccentTheme(settings.accentTheme, resolvedMode),
    semantic: semanticPalettes[resolvedMode],
    spacing,
    radii,
    motion,
    typography,
    layout,
    feedback,
    elevation,
  }), [resolvedMode, settings.accentTheme]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    settings,
    hydrated,
    reduceMotion,
    updateSettings,
    updateNotifications,
    updateQuietHours,
    resetSettings,
  }), [theme, settings, hydrated, reduceMotion, updateSettings, updateNotifications, updateQuietHours, resetSettings]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useBinderTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useBinderTheme must be used inside BinderThemeProvider.');
  return value;
}
