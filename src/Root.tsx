import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import BinderErrorBoundary from './components/BinderErrorBoundary';
import { BinderIcon, BinderText, ScreenState } from './components/ui';
import { initializeBetaDiagnostics, recordBetaEvent } from './lib/beta';
import type { MatchSummary } from './lib/conversation';
import { getLegalGate, type LegalGate } from './lib/safety';
import { supabase } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import BetaScreen from './screens/BetaScreen';
import ChatScreen from './screens/ChatScreen';
import DiscoveryScreen from './screens/DiscoveryScreen';
import LegalGateScreen from './screens/LegalGateScreen';
import MatchesScreen from './screens/MatchesScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ProfileScreen from './screens/ProfileScreen';
import { BinderThemeProvider, useBinderTheme } from './theme/ThemeProvider';
import type { BinderIconName } from './components/ui';

type Tab = 'discover' | 'matches' | 'profile';

export default function Root() {
  return (
    <BinderThemeProvider>
      <BinderErrorBoundary>
        <BinderApp />
      </BinderErrorBoundary>
    </BinderThemeProvider>
  );
}

function BinderApp() {
  const { theme } = useBinderTheme();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [legalGate, setLegalGate] = useState<LegalGate | null | undefined>(undefined);
  const [legalRefreshKey, setLegalRefreshKey] = useState(0);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('discover');
  const [activeMatch, setActiveMatch] = useState<MatchSummary | null>(null);
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);
  const [betaOpen, setBetaOpen] = useState(false);
  const appSessionRecorded = useRef(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError(error.message);
      setSession(data.session);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLegalGate(undefined);
      setOnboardingComplete(undefined);
      setLoadError('');
      setActiveMatch(null);
      setBetaOpen(false);
      setTab('discover');
      appSessionRecorded.current = false;
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
      setLegalGate(undefined);
      return;
    }
    let active = true;
    const startedAt = Date.now();
    setLegalGate(undefined);
    setLoadError('');
    void initializeBetaDiagnostics();
    getLegalGate()
      .then((gate) => {
        if (!active) return;
        setLegalGate(gate);
        void recordBetaEvent('legal_gate_load', 'legal', { durationMs: Date.now() - startedAt, outcome: 'ok' });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : 'Could not verify Binder policy state.');
        setLegalGate(null);
        void recordBetaEvent('legal_gate_load', 'legal', { durationMs: Date.now() - startedAt, outcome: 'error' });
      });
    return () => { active = false; };
  }, [session?.user.id, legalRefreshKey]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true) {
      setOnboardingComplete(undefined);
      return;
    }
    let active = true;
    setOnboardingComplete(undefined);
    supabase.from('profiles').select('onboarding_complete').eq('user_id', session.user.id).maybeSingle().then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError(error.message);
      setOnboardingComplete(data?.onboarding_complete === true);
    });
    return () => { active = false; };
  }, [session?.user.id, legalGate?.accepted]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true || onboardingComplete !== true || appSessionRecorded.current) return;
    appSessionRecorded.current = true;
    void recordBetaEvent('app_session', 'app', { outcome: 'ok', value: 1 });
  }, [session?.user.id, legalGate?.accepted, onboardingComplete]);

  if (session === undefined) return <ScreenState kind="loading" message={loadError || 'Loading Binder…'} />;
  if (!session) return <AuthScreen />;
  if (legalGate === undefined) return <ScreenState kind="loading" message="Checking Binder safety rules…" />;
  if (legalGate === null) return <ScreenState kind="error" icon="retry" title="Safety check failed" message={loadError || 'Could not verify Binder safety rules.'} actionLabel="Try again" onAction={() => setLegalRefreshKey((value) => value + 1)} />;
  if (!legalGate.accepted) return <LegalGateScreen gate={legalGate} onAccepted={() => { setLegalGate((current) => current ? { ...current, accepted: true } : current); setLoadError(''); }} />;
  if (onboardingComplete === undefined) return <ScreenState kind="loading" message={loadError || 'Loading your Binder profile…'} />;
  if (!onboardingComplete) return <OnboardingScreen userId={session.user.id} onComplete={() => { setOnboardingComplete(true); setTab('discover'); }} />;
  if (betaOpen) return <BetaScreen onClose={() => setBetaOpen(false)} />;

  if (activeMatch) {
    return <ChatScreen match={activeMatch} currentUserId={session.user.id} onClose={() => { setActiveMatch(null); setMatchesRefreshKey((value) => value + 1); }} onConversationEnded={() => { setActiveMatch(null); setTab('matches'); setMatchesRefreshKey((value) => value + 1); }} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <View style={{ flex: 1 }}>
        {tab === 'discover' ? <DiscoveryScreen /> : null}
        {tab === 'matches' ? <MatchesScreen refreshKey={matchesRefreshKey} onOpenMatch={setActiveMatch} /> : null}
        {tab === 'profile' ? <ProfileScreen userId={session.user.id} onOpenBeta={() => setBetaOpen(true)} /> : null}
      </View>
      <View style={{
        minHeight: 76,
        flexDirection: 'row',
        paddingHorizontal: theme.spacing.x3,
        paddingTop: theme.spacing.x2,
        paddingBottom: theme.spacing.x4,
        backgroundColor: theme.colors.surface,
        borderTopColor: theme.colors.borderSubtle,
        borderTopWidth: 1,
      }}>
        <NavItem icon="discover" label="Discover" active={tab === 'discover'} onPress={() => setTab('discover')} />
        <NavItem icon="matches" label="Matches" active={tab === 'matches'} onPress={() => { setTab('matches'); setMatchesRefreshKey((value) => value + 1); }} />
        <NavItem icon="profile" label="Profile" active={tab === 'profile'} onPress={() => setTab('profile')} />
      </View>
    </View>
  );
}

function NavItem({ icon, label, active, onPress }: { icon: BinderIconName; label: string; active: boolean; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={({ pressed }) => ({ flex: 1, minHeight: 52, borderRadius: theme.radii.control, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: pressed ? theme.colors.surfacePressed : 'transparent' })}>
      <BinderIcon name={icon} size={22} color={active ? theme.accent.accent : theme.colors.textMuted} />
      <BinderText variant="caption" style={{ color: active ? theme.accent.accent : theme.colors.textMuted }}>{label}</BinderText>
    </Pressable>
  );
}
