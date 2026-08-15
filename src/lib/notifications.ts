import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushRegistrationResult =
  | { status: 'registered'; token: string }
  | { status: 'denied' | 'missing-project-id' | 'unsupported' };

function getProjectId(): string | null {
  const value = process.env.EXPO_PUBLIC_EAS_PROJECT_ID?.trim();
  return value ? value : null;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Matches and messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
  });
}

export async function enablePushNotifications(): Promise<PushRegistrationResult> {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return { status: 'unsupported' };
  }

  const projectId = getProjectId();
  if (!projectId) return { status: 'missing-project-id' };

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') return { status: 'denied' };

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  const { error } = await supabase.rpc('register_push_token', {
    p_token: token,
    p_platform: Platform.OS,
  });
  if (error) throw error;

  return { status: 'registered', token };
}

export async function disablePushNotifications(): Promise<void> {
  const projectId = getProjectId();
  if (!projectId || (Platform.OS !== 'android' && Platform.OS !== 'ios')) return;

  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.status !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase.rpc('unregister_push_token', { p_token: token });
  if (error) throw error;
}
