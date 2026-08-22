import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { availableLocales, resolveLocale, translate, translateCount, type LocaleCode } from '../i18n';
import { tracksLetters } from '../i18n/direction';
import { applyTextDirection } from '../lib/textDirection';

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
  untrackedTypography,
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
  /** 'system' follows the device; a code pins Binder to that language. */
  language: 'system' | LocaleCode;
  appearance: AppearanceMode;
  accentTheme: AccentThemeId;
  hapticsEnabled: boolean;
  motion: MotionPreference;
  notifications: NotificationPreferences;
  quietHours: QuietHours;
};

const defaultSettings: AppSettings = {
  language: 'system',
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
  /** The language actually in use after the device and the preference agree. */
  locale: LocaleCode;
  /** Translate one key; missing strings fall back to English. */
  t: (key: string, values?: Record<string, string | number>) => string;
  /**
   * Translate a count. The key is a group — `one`, `few`, `many` and the rest
   * live under it — and the language decides which of them this number takes.
   */
  tCount: (base: string, count: number, values?: Record<string, string | number>) => string;
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
  const appearance = raw.appearance === 'dark' || raw.appearance === 'light' || raw.appearance === 'system' ? raw.appearance : defaultSettings.appearance;
  const motionPreference = raw.motion === 'reduce' || raw.motion === 'full' || raw.motion === 'system' ? raw.motion : defaultSettings.motion;
  // A language that is no longer bundled must not strand the interface: an
  // unknown code falls back to following the device.
  const known = new Set(availableLocales().map((locale) => locale.code));
  const language = raw.language === 'system' || (raw.language && known.has(raw.language)) ? raw.language : defaultSettings.language;
  return {
    ...defaultSettings,
    ...raw,
    language,
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

  // Every write derives from the state at the moment it runs, not from the
  // state captured when the callback was created: flipping two switches in
  // quick succession used to let the second write undo the first.
  const persist = useCallback(async (reduce: (current: AppSettings) => AppSettings) => {
    let next: AppSettings | null = null;
    setSettings((current) => {
      next = sanitizeSettings(reduce(current));
      return next;
    });
    // React has resolved the updater synchronously by the time it returns.
    if (next) await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    await persist((current) => ({ ...current, ...patch }));
  }, [persist]);

  const updateNotifications = useCallback(async (patch: Partial<NotificationPreferences>) => {
    await persist((current) => ({ ...current, notifications: { ...current.notifications, ...patch } }));
  }, [persist]);

  const updateQuietHours = useCallback(async (patch: Partial<QuietHours>) => {
    await persist((current) => ({ ...current, quietHours: { ...current.quietHours, ...patch } }));
  }, [persist]);

  const resetSettings = useCallback(async () => {
    await persist(() => defaultSettings);
  }, [persist]);

  const reduceMotion = settings.motion === 'reduce' || (settings.motion === 'system' && systemReduceMotion);
  // Dark is the designed default, so an unknown system value resolves to dark;
  // an explicit choice always wins over the device.
  const resolvedMode = settings.appearance === 'dark' ? 'dark'
    : settings.appearance === 'light' ? 'light'
    : systemScheme === 'light' ? 'light' : 'dark';

  // The device language is read once from Intl, which Hermes ships with; no
  // extra dependency for something this small.
  const deviceLanguage = useMemo(() => {
    try { return new Intl.DateTimeFormat().resolvedOptions().locale; } catch { return undefined; }
  }, []);
  const locale = resolveLocale(settings.language, deviceLanguage);
  const t = useCallback((key: string, values?: Record<string, string | number>) => translate(locale, key, values), [locale]);
  const tCount = useCallback((base: string, count: number, values?: Record<string, string | number>) => translateCount(locale, base, count, values), [locale]);
  // Arabic letters join. The tracking in the scale pulls them apart, so a
  // language written in a joining script gets the same scale without it.
  const spacedLetters = tracksLetters(locale);

  const theme = useMemo<BinderTheme>(() => ({
    mode: resolvedMode,
    colors: resolvedMode === 'light' ? lightPalette : darkPalette,
    accent: resolveAccentTheme(settings.accentTheme, resolvedMode),
    semantic: semanticPalettes[resolvedMode],
    spacing,
    radii,
    motion,
    typography: spacedLetters ? typography : untrackedTypography,
    layout,
    feedback,
    elevation,
  }), [resolvedMode, settings.accentTheme, spacedLetters]);

  // The language decides which way the layout runs, and React Native decides
  // that once, at start. Changing it has to restart the app — once, and only
  // when the layout and the language actually disagree.
  useEffect(() => {
    if (!hydrated) return;
    void applyTextDirection(locale);
  }, [hydrated, locale]);

  const value = useMemo<ThemeContextValue>(() => ({
    theme,
    settings,
    hydrated,
    locale,
    t,
    tCount,
    reduceMotion,
    updateSettings,
    updateNotifications,
    updateQuietHours,
    resetSettings,
  }), [theme, settings, hydrated, locale, t, tCount, reduceMotion, updateSettings, updateNotifications, updateQuietHours, resetSettings]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useBinderTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useBinderTheme must be used inside BinderThemeProvider.');
  return value;
}
