import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';

import type { AppSettings } from '../theme/ThemeProvider';
import { supabase } from './supabase';
import { abortable, throwIfAborted } from './reliability';

const INSTALLATION_KEY = 'binder:push-installation:v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NotificationCategory = 'new_match' | 'new_message' | 'moderation_status' | 'safety_alert' | 'product_notice';
export type NotificationRoute = { screen: 'matches' } | { screen: 'chat'; matchId: string } | { screen: 'profile' };

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'denied' | 'missing-project-id' | 'unsupported' | 'offline' };

let foregroundContext: { activeMatchId: string | null; sound: boolean; vibration: boolean } = {
  activeMatchId: null,
  sound: true,
  vibration: true,
};

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const route = parseNotificationRoute(notification.request.content.data);
    const duplicateActiveChat = route?.screen === 'chat' && route.matchId === foregroundContext.activeMatchId;
    return {
      shouldPlaySound: !duplicateActiveChat && foregroundContext.sound,
      shouldSetBadge: false,
      shouldShowBanner: !duplicateActiveChat,
      shouldShowList: !duplicateActiveChat,
    };
  },
});

const categories: { id: NotificationCategory; name: string; importance: Notifications.AndroidImportance }[] = [
  { id: 'new_match', name: 'New matches', importance: Notifications.AndroidImportance.HIGH },
  { id: 'new_message', name: 'Messages', importance: Notifications.AndroidImportance.HIGH },
  { id: 'moderation_status', name: 'Photo review updates', importance: Notifications.AndroidImportance.DEFAULT },
  { id: 'safety_alert', name: 'Safety and account alerts', importance: Notifications.AndroidImportance.HIGH },
  { id: 'product_notice', name: 'Binder updates', importance: Notifications.AndroidImportance.LOW },
];

function getProjectId(): string | null {
  const configured = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  const fallback = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  const value = typeof configured === 'string' ? configured.trim() : fallback;
  return value || null;
}

async function installationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing && UUID_PATTERN.test(existing)) return existing;
  const created = Crypto.randomUUID();
  await AsyncStorage.setItem(INSTALLATION_KEY, created);
  return created;
}

function behaviorName(sound: boolean, vibration: boolean) {
  return `${sound ? 'sound' : 'silent'}_${vibration ? 'vibrate' : 'steady'}`;
}

export function notificationChannelId(category: NotificationCategory, sound: boolean, vibration: boolean) {
  return `binder_${category}_${behaviorName(sound, vibration)}_v1`;
}

export async function ensureAndroidNotificationChannels(signal?: AbortSignal): Promise<void> {
  if (Platform.OS !== 'android') return;

  for (const category of categories) {
    for (const sound of [true, false]) {
      for (const vibration of [true, false]) {
        const behavior = behaviorName(sound, vibration);
        await abortable(Notifications.setNotificationChannelAsync(notificationChannelId(category.id, sound, vibration), {
          name: `${category.name} — ${behavior.replace('_', ', ')}`,
          description: `${category.name} with ${sound ? 'sound' : 'no sound'} and ${vibration ? 'vibration' : 'no vibration'}.`,
          importance: category.importance,
          sound: sound ? 'default' : null,
          enableVibrate: vibration,
          vibrationPattern: vibration ? [0, 180, 120, 220] : null,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
          showBadge: category.id === 'new_message' || category.id === 'new_match',
          enableLights: category.id === 'safety_alert',
          lightColor: '#C7FF4A',
        }), signal);
      }
    }
  }
}

async function registerCurrentToken(requestPermission: boolean, signal?: AbortSignal): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return { status: 'unsupported' };
  const projectId = getProjectId();
  if (!projectId) return { status: 'missing-project-id' };

  await ensureAndroidNotificationChannels(signal);
  const existing = await abortable(Notifications.getPermissionsAsync(), signal);
  let status = existing.status;
  if (status !== 'granted' && requestPermission) status = (await abortable(Notifications.requestPermissionsAsync(), signal)).status;
  if (status !== 'granted') return { status: 'denied' };

  try {
    const token = (await abortable(Notifications.getExpoPushTokenAsync({ projectId }), signal)).data;
    throwIfAborted(signal);
    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS,
      p_installation_id: await abortable(installationId(), signal),
    }).abortSignal(signal ?? new AbortController().signal);
    if (error) throw error;
    return { status: 'registered', token };
  } catch (error) {
    if (error instanceof TypeError || (error instanceof Error && /network|offline|timeout/i.test(error.message))) {
      return { status: 'offline' };
    }
    throw error;
  }
}

export async function enablePushNotifications(signal?: AbortSignal): Promise<PushRegistrationResult> {
  return registerCurrentToken(true, signal);
}

export async function getNotificationPermissionStatus(signal?: AbortSignal): Promise<'granted' | 'denied' | 'undetermined'> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') return 'undetermined';
  const current = await abortable(Notifications.getPermissionsAsync(), signal);
  if (current.status === 'granted') return 'granted';
  // canAskAgain=false means the user actively revoked or permanently denied it.
  return current.canAskAgain ? 'undetermined' : 'denied';
}

export async function openSystemNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}

export async function refreshPushRegistration(): Promise<PushRegistrationResult> {
  return registerCurrentToken(false);
}

export async function disablePushNotifications(): Promise<void> {
  const { error } = await supabase.rpc('unregister_push_installation', { p_installation_id: await installationId() });
  if (error) throw error;
}

export function observePushTokenRotation(onResult?: (result: PushRegistrationResult) => void) {
  const subscription = Notifications.addPushTokenListener(() => {
    void refreshPushRegistration().then((result) => onResult?.(result)).catch(() => undefined);
  });
  return () => subscription.remove();
}

function systemTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export async function syncNotificationPreferences(settings: AppSettings): Promise<void> {
  const { notifications, quietHours } = settings;
  const { error } = await supabase.rpc('set_my_notification_preferences', {
    p_enabled: notifications.enabled,
    p_new_matches: notifications.newMatches,
    p_messages: notifications.messages,
    p_moderation: notifications.moderation,
    p_safety: notifications.safety,
    p_product: notifications.product,
    p_sound: notifications.sound,
    p_vibration: notifications.vibration,
    p_quiet_hours_enabled: quietHours.enabled,
    p_quiet_start: quietHours.start,
    p_quiet_end: quietHours.end,
    p_timezone: systemTimeZone(),
  });
  if (error) throw error;
}

export async function loadNotificationPreferences(): Promise<Pick<AppSettings, 'notifications' | 'quietHours'> | null> {
  const { data, error } = await supabase.rpc('get_my_notification_preferences');
  if (error) throw error;
  const preference = data?.[0];
  if (!preference) return null;
  return {
    notifications: {
      enabled: preference.enabled,
      newMatches: preference.new_matches,
      messages: preference.messages,
      moderation: preference.moderation,
      safety: preference.safety,
      product: preference.product,
      sound: preference.sound,
      vibration: preference.vibration,
    },
    quietHours: {
      enabled: preference.quiet_hours_enabled,
      start: preference.quiet_start.slice(0, 5),
      end: preference.quiet_end.slice(0, 5),
    },
  };
}

export function setNotificationForegroundContext(context: Partial<typeof foregroundContext>) {
  foregroundContext = { ...foregroundContext, ...context };
}

export function parseNotificationRoute(data: Record<string, unknown> | null | undefined): NotificationRoute | null {
  if (!data || typeof data.route !== 'string') return null;
  if (data.route === 'matches') return { screen: 'matches' };
  if (data.route === 'profile') return { screen: 'profile' };
  if (data.route === 'chat' && typeof data.matchId === 'string' && UUID_PATTERN.test(data.matchId)) {
    return { screen: 'chat', matchId: data.matchId };
  }
  return null;
}

export function observeNotificationResponses(onRoute: (route: NotificationRoute) => void) {
  let active = true;
  let lastResponseId: string | null = null;
  const handle = (response: Notifications.NotificationResponse | null) => {
    if (!active || !response) return;
    const responseId = response.notification.request.identifier;
    if (responseId === lastResponseId) return;
    lastResponseId = responseId;
    const route = parseNotificationRoute(response.notification.request.content.data);
    if (route) onRoute(route);
  };

  void Notifications.getLastNotificationResponseAsync().then(handle).catch(() => undefined);
  const subscription = Notifications.addNotificationResponseReceivedListener(handle);
  return () => {
    active = false;
    subscription.remove();
  };
}

export function observeForegroundNotifications(onNotification: (category: NotificationCategory | null, route: NotificationRoute | null) => void) {
  const subscription = Notifications.addNotificationReceivedListener((notification) => {
    const value = notification.request.content.data?.category;
    const category = typeof value === 'string' && categories.some((item) => item.id === value) ? value as NotificationCategory : null;
    onNotification(category, parseNotificationRoute(notification.request.content.data));
  });
  return () => subscription.remove();
}
