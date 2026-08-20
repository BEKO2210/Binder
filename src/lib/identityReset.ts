// What must be forgotten when the person changes.
//
// One account signs out, another signs in, and everything on screen belonged to
// the first one: which tab was open, which conversation, whether a password
// recovery was in progress. Root cleared that list by hand, and the list is
// exactly the kind of thing that grows a member nobody adds to the reset —
// which is what happened to the recovery flag: it survived the change, and the
// next person to sign in on that phone landed in a password reset they had
// never asked for.
//
// So the list is a value, named once, with a test that fails when a field is
// added to the app's per-person state and not to the reset.
// The route names as Root defines them. Copying them here once bit already —
// two of the four were wrong, and the compiler caught it, which is the point of
// naming them at all.
export type Tab = 'discover' | 'matches' | 'profile' | 'menu';
export type ProfileRoute = 'home' | 'edit' | 'preview';
export type MenuRoute = 'home' | 'settings' | 'beta' | 'about';

export type PerIdentityState = {
  recovering: boolean;
  legalGate: undefined;
  onboardingComplete: undefined;
  notificationPreferencesReadyFor: null;
  loadError: string;
  activeMatch: null;
  profileRoute: ProfileRoute;
  menuRoute: MenuRoute;
  tab: Tab;
};

/** Everything that belongs to a person, as it looks before anybody signs in. */
export function freshIdentityState(): PerIdentityState {
  return {
    recovering: false,
    legalGate: undefined,
    onboardingComplete: undefined,
    notificationPreferencesReadyFor: null,
    loadError: '',
    activeMatch: null,
    profileRoute: 'home',
    menuRoute: 'home',
    tab: 'discover',
  };
}

/** The names this reset covers, so a test can hold the list to account. */
export const PER_IDENTITY_FIELDS = Object.keys(freshIdentityState()) as (keyof PerIdentityState)[];
