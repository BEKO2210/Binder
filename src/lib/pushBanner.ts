// Pure state logic for the Matches "Message alerts" banner. Kept free of any
// React Native import so it can run under node:test.

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';
export type PushRegistrationStatus = 'registered' | 'denied' | 'missing-project-id' | 'unsupported' | 'offline';
export type PushBannerState = 'idle' | 'busy' | 'enabled' | 'denied' | 'unavailable' | 'offline';

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

// Whether the state still offers the Enable action.
export function bannerOffersEnable(state: PushBannerState): boolean {
  return state === 'idle' || state === 'busy' || state === 'offline';
}
