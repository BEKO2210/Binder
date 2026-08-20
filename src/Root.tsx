import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, useWindowDimensions, Linking, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutDown, SlideInRight, SlideOutRight, ZoomIn, ZoomOut } from 'react-native-reanimated';

import BinderErrorBoundary from './components/BinderErrorBoundary';
import { LiquidHeart } from './components/LiquidHeart';
import { BinderIcon, BinderText, MotionPressable, ScreenState, type BinderIconName } from './components/ui';
import { sessionIdentityChanged } from './lib/authTransition';
import { consumeIntentionalSignOut, markIntentionalSignOut, sessionEndDecision } from './lib/sessionEnd';
import { startupPhase } from './lib/startupState';
import { initializeBetaDiagnostics, recordBetaEvent } from './lib/beta';
import { parseAuthCallback } from './lib/deepLinks';
import { fetchMatches, type MatchSummary } from './lib/conversation';
import {
  observeForegroundNotifications,
  observeNotificationResponses,
  observePushTokenRotation,
  loadNotificationPreferences,
  refreshPushRegistration,
  setNotificationForegroundContext,
  syncNotificationPreferences,
  type NotificationRoute,
  type PushRegistrationResult,
} from './lib/notifications';
import { getLegalGate, type LegalGate } from './lib/safety';
import { safeLog } from './lib/safeLog';
import { classifyError, isDeadlineError, isLikelyOffline, withDeadline } from './lib/reliability';
import { supabase } from './lib/supabase';
import AboutScreen from './screens/AboutScreen';
import AppSettingsScreen from './screens/AppSettingsScreen';
import AuthScreen from './screens/AuthScreen';
import BetaScreen from './screens/BetaScreen';
import ChatScreen from './screens/ChatScreen';
import DiscoveryScreen from './screens/DiscoveryScreen';
import LegalGateScreen from './screens/LegalGateScreen';
import MatchesScreen from './screens/MatchesScreen';
import MenuScreen from './screens/MenuScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import PartnerProfileScreen from './screens/PartnerProfileScreen';
import ProfileScreen from './screens/ProfileScreen';
import ProfileSettingsScreen from './screens/ProfileSettingsScreen';
import { useBinderHaptics } from './theme/haptics';
import { BinderThemeProvider, useBinderTheme } from './theme/ThemeProvider';

// The same ceiling the legal gate uses, for the same reason: past this point
// waiting is not going to end on its own, and the screen it blocks is a
// full-screen loading state.
const STARTUP_DEADLINE_MS = 15_000;

type Tab = 'discover' | 'matches' | 'profile' | 'menu';
type ProfileRoute = 'home' | 'edit' | 'preview';
// Settings, beta and about used to be profile routes, which is why the screen
// that shows a person their own photo also held the language picker and the
// delete-account button. They belong to the menu tab now.
type MenuRoute = 'home' | 'settings' | 'beta' | 'about';

export default function Root() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <BinderThemeProvider>
            <TopInset>
              <BinderErrorBoundary><BinderApp /></BinderErrorBoundary>
            </TopInset>
          </BinderThemeProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Edge-to-edge is mandatory under SDK 57: without this single choke point every
// screen would draw beneath the status bar and collide with clock and icons.
function TopInset({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { theme } = useBinderTheme();
  return <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: theme.colors.canvas }}><StatusBar style={theme.mode === 'dark' ? 'light' : 'dark'} />{children}</View>;
}

function BinderApp() {
  const { theme, settings, hydrated, updateSettings, locale, t } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  // On a tablet the centred column needs an edge, otherwise the interface looks
  // like a phone screenshot pasted onto a large canvas.
  const { width: windowWidth } = useWindowDimensions();
  const wideScreen = windowWidth > 720;
  const [legalGate, setLegalGate] = useState<LegalGate | null | undefined>(undefined);
  const [legalRefreshKey, setLegalRefreshKey] = useState(0);
  // Two start-up reads used to have no ceiling at all, so a request that never
  // answered left a full-screen loading state with no message and no way out —
  // the same shape as the legal gate before it got a deadline. They share one
  // failure state because they share the only sensible answer: try again.
  const [startFailed, setStartFailed] = useState(false);
  const [startKey, setStartKey] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  // The very first screen a user without network sees was "Safety check failed
  // — could not verify Binder policy state". Nothing is wrong with the policy;
  // the phone is offline, and that is what it has to say.
  const [loadOffline, setLoadOffline] = useState(false);
  const [tab, setTab] = useState<Tab>('discover');
  const [profileRoute, setProfileRoute] = useState<ProfileRoute>('home');
  const [menuRoute, setMenuRoute] = useState<MenuRoute>('home');
  const [activeMatch, setActiveMatch] = useState<MatchSummary | null>(null);
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState<NotificationRoute | null>(null);
  const [notificationPreferencesReadyFor, setNotificationPreferencesReadyFor] = useState<string | null>(null);
  const appSessionRecorded = useRef(false);
  const hadSessionRef = useRef(false);
  const signedInUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    // Both paths below hand the session here, and nothing else may move
    // signedInUserRef. A path that advanced the reference without discarding
    // the screen would leave one account's open chat, tab and profile route
    // standing under the next account's identity — the stored session and an
    // auth event can arrive in either order, so "the first one wins" is not a
    // property this code gets to assume.
    const applySession = (nextSession: Session | null) => {
      // The new token always has to reach the client. What must not follow it
      // is the reset: Supabase emits TOKEN_REFRESHED, USER_UPDATED and SIGNED_IN
      // for a session nobody left, and discarding the screen state on those
      // threw the person back to Discover about once an hour — and out of a
      // running photo upload whenever the refresh landed during one.
      const nextUserId = nextSession?.user.id ?? null;
      const identityChanged = sessionIdentityChanged(signedInUserRef.current, nextUserId);
      hadSessionRef.current = Boolean(nextSession);
      signedInUserRef.current = nextUserId;
      // An answer clears the failure, whenever it turns up.
      setStartFailed(false);
      setSession(nextSession);
      if (!identityChanged) return;
      // Recovery belongs to the identity that started it. Leaving it set sent
      // the next person to sign in on this phone straight into a password reset
      // they never asked for.
      setRecovering(false);
      setLegalGate(undefined); setOnboardingComplete(undefined); setNotificationPreferencesReadyFor(null); setLoadError(''); setActiveMatch(null); setProfileRoute('home'); setMenuRoute('home'); setTab('discover'); appSessionRecorded.current = false;
    };

    // The stored session is read once at start-up and can answer late. A live
    // auth event that arrived in the meantime is newer by definition, so the
    // stale read must not win: it would put the previous account's session back
    // into React while Supabase is already authenticating the new one, and
    // every screen would render one account's data against the other's token.
    let sawAuthEvent = false;
    // The deadline and the answer are watched separately on purpose. A deadline
    // that has already rejected can never resolve again, so wrapping the read
    // and then waiting on the wrapper would throw away an answer that arrives a
    // second late — the person would sit on the error screen with a session in
    // hand. The wrapper decides only when to stop waiting; the request itself
    // still gets to finish the job whenever it manages to.
    const storedSession = supabase.auth.getSession();
    void storedSession
      .then(({ data, error }) => { if (!active || sawAuthEvent) return; if (error) setLoadError(error.message); applySession(data.session); })
      .catch(() => undefined);
    void withDeadline(storedSession, STARTUP_DEADLINE_MS).catch((error: unknown) => {
      // A live auth event answers the same question, so a slow stored read is
      // only a failure when nothing else has answered either.
      if (!active || sawAuthEvent) return;
      safeLog('warn', `startup_session_failed_${classifyError(error).kind}`);
      setStartFailed(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      sawAuthEvent = true;
      // A reset link signs the person in with a recovery session. Until they
      // have actually chosen a new password, that session may only do that.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      // Supabase emits SIGNED_OUT for two different things: somebody tapped
      // sign out, and a token refresh failed because the phone was in a tunnel.
      // The session used to be dropped immediately either way, while the check
      // that was supposed to prevent exactly that ran alongside and arrived too
      // late — so a dead spot logged people out of a valid account, and a
      // deliberate sign-out was greeted with "your session expired".
      if (event === 'SIGNED_OUT' && hadSessionRef.current) {
        if (consumeIntentionalSignOut()) { applySession(null); return; }
        // Ask the server before believing it, and hold the session until the
        // answer arrives. The check gets a deadline of its own, because an
        // unanswered question must not leave this hanging either.
        void withDeadline(supabase.auth.getSession(), STARTUP_DEADLINE_MS)
          .then(({ data, error }) => {
            if (!active) return;
            const decision = sessionEndDecision({
              intentional: false,
              hasServerSession: Boolean(data.session),
              unreachable: Boolean(error) && isLikelyOffline(error),
            });
            if (decision === 'keep') { if (data.session) applySession(data.session); return; }
            setSessionExpired(true);
            applySession(null);
          })
          .catch(() => undefined); // No answer is not evidence: stay signed in.
        return;
      }
      applySession(nextSession);
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, [startKey]);

  const handleSessionExpired = useCallback(() => setSessionExpired(true), []);
  const returnToSignIn = useCallback(() => {
    markIntentionalSignOut();
    void supabase.auth.signOut().finally(() => setSessionExpired(false));
  }, []);

  useEffect(() => {
    let active = true;

    async function handleUrl(rawUrl: string | null) {
      if (!active || !rawUrl) return;
      const callback = parseAuthCallback(rawUrl);
      if (!callback) {
        safeLog('warn', 'auth_callback_rejected');
        return;
      }
      const confirming = callback.kind === 'confirm-email';
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(callback.code);
        if (!active) return;
        if (error) {
          safeLog('warn', 'auth_callback_failed', { errorCode: error.code });
          setLoadError(t(confirming ? 'root.authCallback.confirmInvalid' : 'root.authCallback.resetInvalid'));
          return;
        }
        // A confirmation link exchanges into a real session: the person tapped
        // the mail on their phone and is now signed in, which is the whole
        // point of sending them back into the app rather than to a web page.
        if (!confirming) setRecovering(true);
      } catch {
        if (!active) return;
        safeLog('warn', 'auth_callback_failed');
        setLoadError(t(confirming ? 'root.authCallback.confirmFailed' : 'root.authCallback.resetFailed'));
      }
    }

    void Linking.getInitialURL().then(handleUrl).catch(() => safeLog('warn', 'auth_callback_initial_url_failed'));
    const subscription = Linking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!session) { setLegalGate(undefined); return; }
    let active = true; const startedAt = Date.now(); setLegalGate(undefined); setLoadError(''); setLoadOffline(false); void initializeBetaDiagnostics();
    getLegalGate().then((gate) => { if (!active) return; setLegalGate(gate); void recordBetaEvent('legal_gate_load', 'legal', { durationMs: Date.now() - startedAt, outcome: 'ok' }); }).catch((error: unknown) => { if (!active) return; const timedOut = isDeadlineError(error); const offline = !timedOut && isLikelyOffline(error); setLoadOffline(offline); setLoadError(offline ? t('root.offline.message') : timedOut || !(error instanceof Error) ? t('root.legalGate.failedMessage') : error.message); setLegalGate(null); void recordBetaEvent('legal_gate_load', 'legal', { durationMs: Date.now() - startedAt, outcome: 'error' }); });
    return () => { active = false; };
  }, [session?.user.id, legalRefreshKey]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true) { setOnboardingComplete(undefined); return; }
    let active = true; setOnboardingComplete(undefined);
    // Promise.resolve first: a Supabase query builder is lazy and runs the
    // query on every `then`, so handing it to two watchers directly would send
    // the request twice.
    const profileRead = Promise.resolve(supabase.from('profiles').select('onboarding_complete').eq('user_id', session.user.id).maybeSingle());
    void profileRead
      .then(({ data, error }) => { if (!active) return; if (error) setLoadError(error.message); setStartFailed(false); setOnboardingComplete(data?.onboarding_complete === true); })
      .catch(() => undefined);
    void withDeadline(profileRead, STARTUP_DEADLINE_MS).catch((error: unknown) => {
      if (!active) return;
      safeLog('warn', `startup_profile_failed_${classifyError(error).kind}`);
      setStartFailed(true);
    });
    return () => { active = false; };
  }, [session?.user.id, legalGate?.accepted, startKey]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true || onboardingComplete !== true || appSessionRecorded.current) return;
    appSessionRecorded.current = true; void recordBetaEvent('app_session', 'app', { outcome: 'ok', value: 1 });
  }, [session?.user.id, legalGate?.accepted, onboardingComplete]);

  useEffect(() => observeNotificationResponses(setPendingNotificationRoute), []);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true || onboardingComplete !== true || !hydrated) {
      setNotificationPreferencesReadyFor(null);
      return;
    }
    let active = true;
    void loadNotificationPreferences()
      .then(async (remote) => {
        if (!active) return;
        if (remote) await updateSettings(remote);
        if (active) setNotificationPreferencesReadyFor(session.user.id);
      })
      .catch(() => {
        if (active) setNotificationPreferencesReadyFor(null);
      });
    return () => { active = false; };
  }, [session?.user.id, legalGate?.accepted, onboardingComplete, hydrated]);

  useEffect(() => {
    setNotificationForegroundContext({
      activeMatchId: activeMatch?.matchId ?? null,
      sound: settings.notifications.sound,
      vibration: settings.notifications.vibration,
    });
  }, [activeMatch?.matchId, settings.notifications.sound, settings.notifications.vibration]);

  useEffect(() => observeForegroundNotifications((category, route) => {
    if (category === 'new_match' || category === 'new_message') setMatchesRefreshKey((value) => value + 1);
    if (category === 'new_message' && route?.screen === 'chat' && route.matchId === activeMatch?.matchId) return;
    if (!settings.notifications.vibration) return;
    if (category === 'new_match') void haptic('match');
    else if (category === 'safety_alert') void haptic('warning');
    else if (category === 'new_message') void haptic('selection');
  }), [activeMatch?.matchId, haptic, settings.notifications.vibration]);

  useEffect(() => {
    if (!session || notificationPreferencesReadyFor !== session.user.id) return;
    const quietTimePattern = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!quietTimePattern.test(settings.quietHours.start) || !quietTimePattern.test(settings.quietHours.end)) return;
    const timer = setTimeout(() => {
      void syncNotificationPreferences(settings, locale).catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [session?.user.id, notificationPreferencesReadyFor, settings, locale]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true || onboardingComplete !== true || !settings.notifications.enabled) return;
    // Both silent attempts — this one and every token rotation — used to throw
    // their failures away, which is how push can be dead while the app still
    // says it is on. What they must NOT do is switch the setting off by
    // themselves: `notifications.enabled` is an account-wide preference, the
    // permission behind it is per device, and a fresh install on the tablet
    // that has not been granted it yet would otherwise turn push off on the
    // phone too. The screens read the device permission and say so instead.
    const reportSilentFailure = (error: unknown) => {
      // The kind goes in the event name on purpose: safeLog redacts every
      // string it is handed as context. It is also compiled out of a release
      // build, so this helps while developing and the honest switch below is
      // what a real user gets. Recording it as a diagnostics row would survive
      // a release build, but the event name is constrained in the database and
      // that needs a migration.
      safeLog('warn', `push_refresh_failed_${classifyError(error).kind}`);
    };
    // Most ways this goes wrong are not thrown at all — a refused permission
    // and a dead network both come back as an ordinary return value, so
    // catching exceptions alone would have kept the quietest cases quiet.
    const reportSilentOutcome = (result: PushRegistrationResult) => {
      if (result.status === 'registered') return;
      safeLog('warn', `push_refresh_${result.status}`);
    };

    void refreshPushRegistration(t).then(reportSilentOutcome).catch(reportSilentFailure);
    return observePushTokenRotation(t, reportSilentOutcome);
  }, [session?.user.id, legalGate?.accepted, onboardingComplete, settings.notifications.enabled]);

  useEffect(() => {
    // Android hardware/gesture back walks one level up instead of leaving the app:
    // open chat -> matches list, profile sub-screen -> profile, other tab -> discover.
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeMatch) {
        setActiveMatch(null);
        setMatchesRefreshKey((value) => value + 1);
        setTab('matches');
        return true;
      }
      if (profileRoute !== 'home') {
        setProfileRoute('home');
        return true;
      }
      // Without this, back from inside App settings closed Binder instead of
      // returning to the menu it was opened from.
      if (menuRoute !== 'home') {
        setMenuRoute('home');
        return true;
      }
      if (tab !== 'discover') {
        setTab('discover');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeMatch, profileRoute, menuRoute, tab]);

  useEffect(() => {
    if (!pendingNotificationRoute || !session || legalGate?.accepted !== true || onboardingComplete !== true) return;
    const route = pendingNotificationRoute;
    if (route.screen === 'matches') {
      setPendingNotificationRoute(null);
      setActiveMatch(null);
      setTab('matches');
      setMatchesRefreshKey((value) => value + 1);
      return;
    }
    if (route.screen === 'profile') {
      setPendingNotificationRoute(null);
      setActiveMatch(null);
      setProfileRoute('home');
      setTab('profile');
      return;
    }
    // Keep the pending route set while the chat target resolves — clearing it
    // first re-ran this effect and its cleanup cancelled the fetch, so a
    // notification tap never opened the chat. The route clears in finally,
    // whose re-run exits at the guard above.
    let active = true;
    void fetchMatches().then((matches) => {
      if (!active) return;
      const target = matches.find((match) => match.matchId === route.matchId);
      if (target) setActiveMatch(target);
      else {
        setActiveMatch(null);
        setTab('matches');
        setMatchesRefreshKey((value) => value + 1);
      }
    }).catch(() => {
      if (!active) return;
      setTab('matches');
    }).finally(() => {
      if (active) setPendingNotificationRoute(null);
    });
    return () => { active = false; };
  }, [pendingNotificationRoute, session?.user.id, legalGate?.accepted, onboardingComplete]);

  if (sessionExpired) return <ScreenState kind="permission" icon="profile" title={t('sessionExpired.title')} message={t('sessionExpired.message')} actionLabel={t('sessionExpired.action')} onAction={returnToSignIn} />;
  // A failed start-up read speaks only where its own loading state would have,
  // so it can never cover a recovery, a legal gate or a session that answered
  // late. `startupPhase` is what decides that, and it is tested.
  const retryStartup = () => { setStartFailed(false); setSession(undefined); setOnboardingComplete(undefined); setStartKey((value) => value + 1); };
  const startupFailure = (
    <ScreenState
      kind="error"
      icon="retry"
      title={t('root.startFailed.title')}
      message={t('root.startFailed.message')}
      actionLabel={t('common.retry')}
      onAction={retryStartup}
    />
  );
  const sessionPhase = startupPhase(session !== undefined, startFailed);
  if (sessionPhase === 'failed') return startupFailure;
  if (sessionPhase === 'loading') return <ScreenState kind="loading" message={loadError || t('root.loading.session')} />;
  if (!session) return <AuthScreen />;
  if (recovering) return <AuthScreen recovery onRecoveryHandled={() => setRecovering(false)} />;
  if (legalGate === undefined) return <ScreenState kind="loading" message={t('root.loading.safetyRules')} />;
  if (legalGate === null) return (
    <ScreenState
      kind={loadOffline ? 'offline' : 'error'}
      icon="retry"
      title={loadOffline ? t('root.offline.title') : t('root.legalGate.failedTitle')}
      message={loadError || t('root.legalGate.failedMessage')}
      actionLabel={t('common.retry')}
      onAction={() => setLegalRefreshKey((value) => value + 1)}
    />
  );
  if (!legalGate.accepted) return <LegalGateScreen gate={legalGate} onAccepted={() => { setLegalGate((current) => current ? { ...current, accepted: true } : current); setLoadError(''); }} />;
  const profilePhase = startupPhase(onboardingComplete !== undefined, startFailed);
  if (profilePhase === 'failed') return startupFailure;
  if (profilePhase === 'loading') return <ScreenState kind="loading" message={loadError || t('root.loading.profile')} />;
  if (!onboardingComplete) return <OnboardingScreen userId={session.user.id} onComplete={() => { setOnboardingComplete(true); setTab('discover'); }} />;
  // Full-screen routes live outside the tab shell, so they need the same centred
  // column — a conversation stretched across a tablet reads as a wall of text.
  if (activeMatch) return <CenteredColumn wide={wideScreen}><RouteFrame route="expand"><ChatScreen match={activeMatch} currentUserId={session.user.id} onClose={() => { setActiveMatch(null); setMatchesRefreshKey((value) => value + 1); }} onConversationEnded={() => { setActiveMatch(null); setTab('matches'); setMatchesRefreshKey((value) => value + 1); }} onSessionExpired={handleSessionExpired} /></RouteFrame></CenteredColumn>;
  // The same screen a match sees, pointed at the signed-in person. Anything
  // else would be a second rendering of a profile that could drift from the
  // real one, which is the opposite of what a preview is for.
  if (profileRoute === 'preview') return <RouteFrame route="lift"><PartnerProfileScreen userId={session.user.id} fallbackName="" viewingSelf onClose={() => setProfileRoute('home')} /></RouteFrame>;
  if (profileRoute === 'edit') return <RouteFrame route="lift"><ProfileSettingsScreen userId={session.user.id} onClose={() => setProfileRoute('home')} onSessionExpired={handleSessionExpired} /></RouteFrame>;
  if (menuRoute === 'settings') return <RouteFrame route="trailing"><AppSettingsScreen onClose={() => setMenuRoute('home')} /></RouteFrame>;
  if (menuRoute === 'beta') return <RouteFrame route="trailing"><BetaScreen onClose={() => setMenuRoute('home')} /></RouteFrame>;
  if (menuRoute === 'about') return <RouteFrame route="trailing"><AboutScreen onClose={() => setMenuRoute('home')} /></RouteFrame>;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/* On a tablet the same layout used to stretch a phone-shaped interface
          across 1240 dp: rows a metre wide, a header hugging the left edge. The
          content column is capped and centred instead, on every surface. */}
      <View style={{ flex: 1, width: '100%', maxWidth: theme.layout.tabletContentMaxWidth, alignSelf: 'center', borderLeftWidth: wideScreen ? 1 : 0, borderRightWidth: wideScreen ? 1 : 0, borderColor: theme.colors.borderSubtle }}>
        {tab === 'discover' ? <DiscoveryScreen onOpenMatch={(target) => { setActiveMatch(target); setMatchesRefreshKey((value) => value + 1); }} onSessionExpired={handleSessionExpired} /> : null}
        {tab === 'matches' ? <MatchesScreen refreshKey={matchesRefreshKey} onOpenMatch={setActiveMatch} onOpenDiscovery={() => setTab('discover')} onSessionExpired={handleSessionExpired} /> : null}
        {tab === 'profile' ? <ProfileScreen userId={session.user.id} onEditProfile={() => setProfileRoute('edit')} onPreviewProfile={() => setProfileRoute('preview')} onSessionExpired={handleSessionExpired} /> : null}
        {tab === 'menu' ? <MenuScreen onOpenSettings={() => setMenuRoute('settings')} onOpenBeta={() => setMenuRoute('beta')} onOpenAbout={() => setMenuRoute('about')} /> : null}
      </View>
      {/* Chrome spans the full width, its content stays in the centred column:
          a tab bar that stops at 720 dp leaves a floating bar with visible ends
          on a tablet. */}
      <View style={{ width: '100%', backgroundColor: theme.colors.surface, borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1 }}>
      <View style={{ minHeight: theme.layout.screenHeaderHeight + theme.spacing.x1, width: '100%', maxWidth: theme.layout.tabletContentMaxWidth, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: theme.spacing.x3, paddingTop: theme.spacing.x2, paddingBottom: theme.spacing.x2 }}>
        <NavItem icon="discover" label={t('root.tabs.discover')} active={tab === 'discover'} onPress={() => setTab('discover')} />
        <NavItem icon="matches" label={t('root.tabs.matches')} active={tab === 'matches'} onPress={() => { setTab('matches'); setMatchesRefreshKey((value) => value + 1); }} />
        <NavItem icon="profile" label={t('root.tabs.profile')} active={tab === 'profile'} onPress={() => { setTab('profile'); setProfileRoute('home'); }} />
        <NavItem icon="settings" label={t('root.tabs.menu')} active={tab === 'menu'} onPress={() => { setTab('menu'); setMenuRoute('home'); }} />
      </View>
      </View>
    </View>
  );
}

function CenteredColumn({ wide, children }: { wide: boolean; children: React.ReactNode }) {
  const { theme } = useBinderTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <View style={{ flex: 1, width: '100%', maxWidth: theme.layout.tabletContentMaxWidth, alignSelf: 'center', borderLeftWidth: wide ? 1 : 0, borderRightWidth: wide ? 1 : 0, borderColor: theme.colors.borderSubtle }}>
        {children}
      </View>
    </View>
  );
}

function NavItem({ icon, label, active, onPress }: { icon: BinderIconName; label: string; active: boolean; onPress: () => void }) {
  const { theme } = useBinderTheme();
  // The Binds heart fills with its own red while its tab is open and keeps its
  // outline, so the shape stays a heart rather than a red blob. No waves down
  // here: at twenty-two pixels a wave is two pixels of movement and reads as a
  // rendering fault, which is exactly how it looked when it had them.
  const heartTab = icon === 'matches';
  const iconColor = active ? theme.accent.onSurface : theme.colors.textMuted;
  return <MotionPressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: theme.radii.control, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' })}>{heartTab ? <LiquidHeart size={22} color={active ? theme.semantic.bind : theme.colors.transparent} outlineColor={active ? theme.semantic.bind : theme.colors.textMuted} active={active} still /> : <BinderIcon name={icon} size={22} color={iconColor} />}<BinderText variant="caption" numberOfLines={1} maxFontSizeMultiplier={theme.layout.chromeFontScaleCap} style={{ color: active ? theme.accent.onSurface : theme.colors.textMuted }}>{label}</BinderText></MotionPressable>;
}

function RouteFrame({ route, children }: { route: 'expand' | 'lift' | 'trailing'; children: React.ReactNode }) {
  const { theme, reduceMotion } = useBinderTheme();
  if (reduceMotion) return <View style={{ flex: 1 }}>{children}</View>;
  const entering = route === 'trailing' ? SlideInRight.duration(theme.motion.deliberate) : route === 'expand' ? ZoomIn.duration(theme.motion.entrance) : FadeInUp.duration(theme.motion.entrance);
  const exiting = route === 'trailing' ? SlideOutRight.duration(theme.motion.deliberate) : route === 'expand' ? ZoomOut.duration(theme.motion.deliberate) : FadeOutDown.duration(theme.motion.deliberate);
  return <Animated.View entering={entering} exiting={exiting} style={{ flex: 1 }}>{children}</Animated.View>;
}
