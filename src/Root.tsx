import type { Session } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, useWindowDimensions, Linking, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInUp, FadeOutDown, SlideInRight, SlideOutRight, ZoomIn, ZoomOut } from 'react-native-reanimated';

import BinderErrorBoundary from './components/BinderErrorBoundary';
import { BinderIcon, BinderText, MotionPressable, ScreenState, type BinderIconName } from './components/ui';
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
} from './lib/notifications';
import { getLegalGate, type LegalGate } from './lib/safety';
import { safeLog } from './lib/safeLog';
import { isLikelyOffline } from './lib/reliability';
import { supabase } from './lib/supabase';
import AboutScreen from './screens/AboutScreen';
import AppSettingsScreen from './screens/AppSettingsScreen';
import AuthScreen from './screens/AuthScreen';
import BetaScreen from './screens/BetaScreen';
import ChatScreen from './screens/ChatScreen';
import DiscoveryScreen from './screens/DiscoveryScreen';
import LegalGateScreen from './screens/LegalGateScreen';
import MatchesScreen from './screens/MatchesScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ProfileScreen from './screens/ProfileScreen';
import ProfileSettingsScreen from './screens/ProfileSettingsScreen';
import { useBinderHaptics } from './theme/haptics';
import { BinderThemeProvider, useBinderTheme } from './theme/ThemeProvider';

type Tab = 'discover' | 'matches' | 'profile';
type ProfileRoute = 'home' | 'edit' | 'settings' | 'beta' | 'about';

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
  const { theme, settings, hydrated, updateSettings, t } = useBinderTheme();
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
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  // The very first screen a user without network sees was "Safety check failed
  // — could not verify Binder policy state". Nothing is wrong with the policy;
  // the phone is offline, and that is what it has to say.
  const [loadOffline, setLoadOffline] = useState(false);
  const [tab, setTab] = useState<Tab>('discover');
  const [profileRoute, setProfileRoute] = useState<ProfileRoute>('home');
  const [activeMatch, setActiveMatch] = useState<MatchSummary | null>(null);
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState<NotificationRoute | null>(null);
  const [notificationPreferencesReadyFor, setNotificationPreferencesReadyFor] = useState<string | null>(null);
  const appSessionRecorded = useRef(false);
  const hadSessionRef = useRef(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => { if (!active) return; if (error) setLoadError(error.message); hadSessionRef.current = Boolean(data.session); setSession(data.session); });
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      // A reset link signs the person in with a recovery session. Until they
      // have actually chosen a new password, that session may only do that.
      if (event === 'PASSWORD_RECOVERY') setRecovering(true);
      // Supabase also emits SIGNED_OUT when a token refresh fails, which happens
      // every time the phone is offline long enough. Treating that as an expired
      // session threw a signed-in user back to the sign-in screen for having
      // been in a tunnel. Only a refusal by the server ends a session; the app
      // asks for one before it believes it.
      if (event === 'SIGNED_OUT' && hadSessionRef.current) {
        void supabase.auth.getSession().then(({ data, error }) => {
          if (!active) return;
          if (data.session) return;
          if (error && isLikelyOffline(error)) return;
          setSessionExpired(true);
        });
      }
      hadSessionRef.current = Boolean(nextSession);
      setSession(nextSession); setLegalGate(undefined); setOnboardingComplete(undefined); setNotificationPreferencesReadyFor(null); setLoadError(''); setActiveMatch(null); setProfileRoute('home'); setTab('discover'); appSessionRecorded.current = false;
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  const handleSessionExpired = useCallback(() => setSessionExpired(true), []);
  const returnToSignIn = useCallback(() => {
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
    getLegalGate().then((gate) => { if (!active) return; setLegalGate(gate); void recordBetaEvent('legal_gate_load', 'legal', { durationMs: Date.now() - startedAt, outcome: 'ok' }); }).catch((error: unknown) => { if (!active) return; const offline = isLikelyOffline(error); setLoadOffline(offline); setLoadError(offline ? t('root.offline.message') : error instanceof Error ? error.message : t('root.legalGate.failedMessage')); setLegalGate(null); void recordBetaEvent('legal_gate_load', 'legal', { durationMs: Date.now() - startedAt, outcome: 'error' }); });
    return () => { active = false; };
  }, [session?.user.id, legalRefreshKey]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true) { setOnboardingComplete(undefined); return; }
    let active = true; setOnboardingComplete(undefined);
    supabase.from('profiles').select('onboarding_complete').eq('user_id', session.user.id).maybeSingle().then(({ data, error }) => { if (!active) return; if (error) setLoadError(error.message); setOnboardingComplete(data?.onboarding_complete === true); });
    return () => { active = false; };
  }, [session?.user.id, legalGate?.accepted]);

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
      void syncNotificationPreferences(settings).catch(() => undefined);
    }, 250);
    return () => clearTimeout(timer);
  }, [session?.user.id, notificationPreferencesReadyFor, settings]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true || onboardingComplete !== true || !settings.notifications.enabled) return;
    void refreshPushRegistration().catch(() => undefined);
    return observePushTokenRotation();
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
      if (tab !== 'discover') {
        setTab('discover');
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [activeMatch, profileRoute, tab]);

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
  if (session === undefined) return <ScreenState kind="loading" message={loadError || 'Loading Binder…'} />;
  if (!session) return <AuthScreen />;
  if (recovering) return <AuthScreen recovery onRecoveryHandled={() => setRecovering(false)} />;
  if (legalGate === undefined) return <ScreenState kind="loading" message="Checking Binder safety rules…" />;
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
  if (onboardingComplete === undefined) return <ScreenState kind="loading" message={loadError || 'Loading your Binder profile…'} />;
  if (!onboardingComplete) return <OnboardingScreen userId={session.user.id} onComplete={() => { setOnboardingComplete(true); setTab('discover'); }} />;
  // Full-screen routes live outside the tab shell, so they need the same centred
  // column — a conversation stretched across a tablet reads as a wall of text.
  if (activeMatch) return <CenteredColumn wide={wideScreen}><RouteFrame route="expand"><ChatScreen match={activeMatch} currentUserId={session.user.id} onClose={() => { setActiveMatch(null); setMatchesRefreshKey((value) => value + 1); }} onConversationEnded={() => { setActiveMatch(null); setTab('matches'); setMatchesRefreshKey((value) => value + 1); }} onSessionExpired={handleSessionExpired} /></RouteFrame></CenteredColumn>;
  if (profileRoute === 'edit') return <RouteFrame route="lift"><ProfileSettingsScreen userId={session.user.id} onClose={() => setProfileRoute('home')} onSessionExpired={handleSessionExpired} /></RouteFrame>;
  if (profileRoute === 'settings') return <RouteFrame route="trailing"><AppSettingsScreen onClose={() => setProfileRoute('home')} /></RouteFrame>;
  if (profileRoute === 'beta') return <RouteFrame route="trailing"><BetaScreen onClose={() => setProfileRoute('home')} /></RouteFrame>;
  if (profileRoute === 'about') return <RouteFrame route="trailing"><AboutScreen onClose={() => setProfileRoute('home')} /></RouteFrame>;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      {/* On a tablet the same layout used to stretch a phone-shaped interface
          across 1240 dp: rows a metre wide, a header hugging the left edge. The
          content column is capped and centred instead, on every surface. */}
      <View style={{ flex: 1, width: '100%', maxWidth: theme.layout.tabletContentMaxWidth, alignSelf: 'center', borderLeftWidth: wideScreen ? 1 : 0, borderRightWidth: wideScreen ? 1 : 0, borderColor: theme.colors.borderSubtle }}>
        {tab === 'discover' ? <DiscoveryScreen onOpenMatch={(target) => { setActiveMatch(target); setMatchesRefreshKey((value) => value + 1); }} onSessionExpired={handleSessionExpired} /> : null}
        {tab === 'matches' ? <MatchesScreen refreshKey={matchesRefreshKey} onOpenMatch={setActiveMatch} onOpenDiscovery={() => setTab('discover')} onSessionExpired={handleSessionExpired} /> : null}
        {tab === 'profile' ? <ProfileScreen userId={session.user.id} onEditProfile={() => setProfileRoute('edit')} onOpenSettings={() => setProfileRoute('settings')} onOpenBeta={() => setProfileRoute('beta')} onOpenAbout={() => setProfileRoute('about')} onSessionExpired={handleSessionExpired} /> : null}
      </View>
      {/* Chrome spans the full width, its content stays in the centred column:
          a tab bar that stops at 720 dp leaves a floating bar with visible ends
          on a tablet. */}
      <View style={{ width: '100%', backgroundColor: theme.colors.surface, borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1 }}>
      <View style={{ minHeight: theme.layout.screenHeaderHeight + theme.spacing.x1, width: '100%', maxWidth: theme.layout.tabletContentMaxWidth, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: theme.spacing.x3, paddingTop: theme.spacing.x2, paddingBottom: theme.spacing.x2 }}>
        <NavItem icon="discover" label="Discover" active={tab === 'discover'} onPress={() => setTab('discover')} />
        <NavItem icon="matches" label="Matches" active={tab === 'matches'} onPress={() => { setTab('matches'); setMatchesRefreshKey((value) => value + 1); }} />
        <NavItem icon="profile" label="Profile" active={tab === 'profile'} onPress={() => { setTab('profile'); setProfileRoute('home'); }} />
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
  return <MotionPressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: theme.radii.control, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' })}><BinderIcon name={icon} size={22} color={active ? theme.accent.onSurface : theme.colors.textMuted} /><BinderText variant="caption" numberOfLines={1} maxFontSizeMultiplier={theme.layout.chromeFontScaleCap} style={{ color: active ? theme.accent.onSurface : theme.colors.textMuted }}>{label}</BinderText></MotionPressable>;
}

function RouteFrame({ route, children }: { route: 'expand' | 'lift' | 'trailing'; children: React.ReactNode }) {
  const { theme, reduceMotion } = useBinderTheme();
  if (reduceMotion) return <View style={{ flex: 1 }}>{children}</View>;
  const entering = route === 'trailing' ? SlideInRight.duration(theme.motion.deliberate) : route === 'expand' ? ZoomIn.duration(theme.motion.entrance) : FadeInUp.duration(theme.motion.entrance);
  const exiting = route === 'trailing' ? SlideOutRight.duration(theme.motion.deliberate) : route === 'expand' ? ZoomOut.duration(theme.motion.deliberate) : FadeOutDown.duration(theme.motion.deliberate);
  return <Animated.View entering={entering} exiting={exiting} style={{ flex: 1 }}>{children}</Animated.View>;
}
