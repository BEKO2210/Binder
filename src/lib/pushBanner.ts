// Pure state logic for the Matches "Message alerts" banner. Kept free of any
// React Native import so it can run under node:test.

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';
export type PushRegistrationStatus = 'registered' | 'denied' | 'missing-project-id' | 'unsupported' | 'offline';
// 'failed' is deliberately separate from 'offline' and 'unavailable': the first
// tells people to check a connection they may not have a problem with, and the
// second is a dead end with no retry. Something that merely threw deserves
// neither a wrong diagnosis nor a closed door.
export type PushBannerState = 'idle' | 'busy' | 'enabled' | 'denied' | 'unavailable' | 'offline' | 'failed';

// What the banner should show when the screen mounts, before any tap: an
// already-registered installation must be recognized instead of asking again.
export function initialBannerState(notificationsEnabled: boolean, permission: PushPermissionStatus): PushBannerState {
  if (notificationsEnabled && permission === 'granted') return 'enabled';
  if (permission === 'denied') return 'denied';
  return 'idle';
}

// What the banner should show after an enable attempt returned.
export function bannerStateAfterRegistration(status: PushRegistrationStatus): PushBannerState {
  switch (status) {
    case 'registered': return 'enabled';
    case 'denied': return 'denied';
    case 'offline': return 'offline';
    default: return 'unavailable';
  }
}

// Whether the account-wide "notifications are on" is contradicted by what this
// particular phone allows.
//
// The two are not the same thing and must not be conflated: the preference is
// stored per account and applies to every device, the permission belongs to one
// installation. App settings showed only the preference, so someone who had
// switched Binder off in the Android settings still read "on" there, with
// nothing able to deliver a notification. Answering this by writing the
// preference would be worse than the bug — a fresh install on a second device
// would switch push off on the first one.
export function pushBlockedOnThisDevice(notificationsEnabled: boolean, permission: PushPermissionStatus): boolean {
  return notificationsEnabled && permission !== 'granted';
}

export type PushWarningKey =
  | 'appSettings.messages.pushDenied'
  | 'appSettings.messages.pushNotAllowedYet'
  | 'appSettings.messages.pushOffline'
  | 'appSettings.messages.missingProject'
  | 'appSettings.messages.pushUnavailable';

// Which warning App settings owes the person, if any.
//
// The permission is only half the question. A granted permission whose
// registration never reached the server looks exactly like a healthy one from
// the outside, and that is the state nobody would ever notice — push is dead,
// the switch says on, and no screen disagrees. So the registration result gets
// a say too, and `null` for either input means "not known yet", which is a
// reason to stay quiet rather than to accuse.
export function pushSettingsWarning(
  notificationsEnabled: boolean,
  permission: PushPermissionStatus | null,
  registration: PushRegistrationStatus | null,
): PushWarningKey | null {
  if (!notificationsEnabled) return null;
  if (permission === 'denied') return 'appSettings.messages.pushDenied';
  if (permission === 'undetermined') return 'appSettings.messages.pushNotAllowedYet';
  if (permission === null) return null;
  switch (registration) {
    case null:
    case 'registered': return null;
    case 'offline': return 'appSettings.messages.pushOffline';
    case 'missing-project-id': return 'appSettings.messages.missingProject';
    case 'denied': return 'appSettings.messages.pushDenied';
    default: return 'appSettings.messages.pushUnavailable';
  }
}

// Whether the state still offers the Enable action.
export function bannerOffersEnable(state: PushBannerState): boolean {
  return state === 'idle' || state === 'busy' || state === 'offline' || state === 'failed';
}
