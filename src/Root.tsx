import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import BinderErrorBoundary from './components/BinderErrorBoundary';
import { BinderIcon, BinderText, ScreenState, type BinderIconName } from './components/ui';
import { initializeBetaDiagnostics, recordBetaEvent } from './lib/beta';
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
  return <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.colors.canvas }}>{children}</View>;
}

function BinderApp() {
  const { theme, settings, hydrated, updateSettings } = useBinderTheme();
  const tabBarInsetBottom = Math.max(useSafeAreaInsets().bottom, 8);
  const haptic = useBinderHaptics();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [legalGate, setLegalGate] = useState<LegalGate | null | undefined>(undefined);
  const [legalRefreshKey, setLegalRefreshKey] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('discover');
  const [profileRoute, setProfileRoute] = useState<ProfileRoute>('home');
  const [activeMatch, setActiveMatch] = useState<MatchSummary | null>(null);
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState<NotificationRoute | null>(null);
  const [notificationPreferencesReadyFor, setNotificationPreferencesReadyFor] = useState<string | null>(null);
  const appSessionRecorded = useRef(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => { if (!active) return; if (error) setLoadError(error.message); setSession(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession); setLegalGate(undefined); setOnboardingComplete(undefined); setNotificationPreferencesReadyFor(null); setLoadError(''); setActiveMatch(null); setProfileRoute('home'); setTab('discover'); appSessionRecorded.current = false;
    });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!session) { setLegalGate(undefined); return; }
    let active = true; const startedAt = Date.now(); setLegalGate(undefined); setLoadError(''); void initializeBetaDiagnostics();
    getLegalGate().then((gate) => { if (!active) return; setLegalGate(gate); void recordBetaEvent('legal_gate_load', 'legal', { durationMs: Date.now() - startedAt, outcome: 'ok' }); }).catch((error: unknown) => { if (!active) return; setLoadError(error instanceof Error ? error.message : 'Could not verify Binder policy state.'); setLegalGate(null); void recordBetaEvent('legal_gate_load', 'legal', { durationMs: Date.now() - startedAt, outcome: 'error' }); });
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
    setPendingNotificationRoute(null);
    if (route.screen === 'matches') {
      setActiveMatch(null);
      setTab('matches');
      setMatchesRefreshKey((value) => value + 1);
      return;
    }
    if (route.screen === 'profile') {
      setActiveMatch(null);
      setProfileRoute('home');
      setTab('profile');
      return;
    }
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
      if (active) setTab('matches');
    });
    return () => { active = false; };
  }, [pendingNotificationRoute, session?.user.id, legalGate?.accepted, onboardingComplete]);

  if (session === undefined) return <ScreenState kind="loading" message={loadError || 'Loading Binder…'} />;
  if (!session) return <AuthScreen />;
  if (legalGate === undefined) return <ScreenState kind="loading" message="Checking Binder safety rules…" />;
  if (legalGate === null) return <ScreenState kind="error" icon="retry" title="Safety check failed" message={loadError || 'Could not verify Binder safety rules.'} actionLabel="Try again" onAction={() => setLegalRefreshKey((value) => value + 1)} />;
  if (!legalGate.accepted) return <LegalGateScreen gate={legalGate} onAccepted={() => { setLegalGate((current) => current ? { ...current, accepted: true } : current); setLoadError(''); }} />;
  if (onboardingComplete === undefined) return <ScreenState kind="loading" message={loadError || 'Loading your Binder profile…'} />;
  if (!onboardingComplete) return <OnboardingScreen userId={session.user.id} onComplete={() => { setOnboardingComplete(true); setTab('discover'); }} />;
  if (activeMatch) return <ChatScreen match={activeMatch} currentUserId={session.user.id} onClose={() => { setActiveMatch(null); setMatchesRefreshKey((value) => value + 1); }} onConversationEnded={() => { setActiveMatch(null); setTab('matches'); setMatchesRefreshKey((value) => value + 1); }} />;
  if (profileRoute === 'edit') return <ProfileSettingsScreen userId={session.user.id} onClose={() => setProfileRoute('home')} />;
  if (profileRoute === 'settings') return <AppSettingsScreen onClose={() => setProfileRoute('home')} />;
  if (profileRoute === 'beta') return <BetaScreen onClose={() => setProfileRoute('home')} />;
  if (profileRoute === 'about') return <AboutScreen onClose={() => setProfileRoute('home')} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <View style={{ flex: 1 }}>
        {tab === 'discover' ? <DiscoveryScreen onOpenMatch={(target) => { setActiveMatch(target); setMatchesRefreshKey((value) => value + 1); }} /> : null}
        {tab === 'matches' ? <MatchesScreen refreshKey={matchesRefreshKey} onOpenMatch={setActiveMatch} /> : null}
        {tab === 'profile' ? <ProfileScreen userId={session.user.id} onEditProfile={() => setProfileRoute('edit')} onOpenSettings={() => setProfileRoute('settings')} onOpenBeta={() => setProfileRoute('beta')} onOpenAbout={() => setProfileRoute('about')} /> : null}
      </View>
      <View style={{ minHeight: 76, flexDirection: 'row', paddingHorizontal: theme.spacing.x3, paddingTop: theme.spacing.x2, paddingBottom: theme.spacing.x2 + tabBarInsetBottom, backgroundColor: theme.colors.surface, borderTopColor: theme.colors.borderSubtle, borderTopWidth: 1 }}>
        <NavItem icon="discover" label="Discover" active={tab === 'discover'} onPress={() => setTab('discover')} />
        <NavItem icon="matches" label="Matches" active={tab === 'matches'} onPress={() => { setTab('matches'); setMatchesRefreshKey((value) => value + 1); }} />
        <NavItem icon="profile" label="Profile" active={tab === 'profile'} onPress={() => { setTab('profile'); setProfileRoute('home'); }} />
      </View>
    </View>
  );
}

function NavItem({ icon, label, active, onPress }: { icon: BinderIconName; label: string; active: boolean; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: theme.radii.control, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' })}><BinderIcon name={icon} size={22} color={active ? theme.accent.accent : theme.colors.textMuted} /><BinderText variant="caption" style={{ color: active ? theme.accent.accent : theme.colors.textMuted }}>{label}</BinderText></Pressable>;
}
