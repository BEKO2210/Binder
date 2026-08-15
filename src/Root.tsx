import type { Session } from '@supabase/supabase-js';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import BinderErrorBoundary from './components/BinderErrorBoundary';
import { initializeBetaDiagnostics, recordBetaEvent } from './lib/beta';
import { supabase } from './lib/supabase';
import type { MatchSummary } from './lib/conversation';
import { getLegalGate, type LegalGate } from './lib/safety';
import AuthScreen from './screens/AuthScreen';
import BetaScreen from './screens/BetaScreen';
import ChatScreen from './screens/ChatScreen';
import DiscoveryScreen from './screens/DiscoveryScreen';
import LegalGateScreen from './screens/LegalGateScreen';
import MatchesScreen from './screens/MatchesScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ProfileScreen from './screens/ProfileScreen';

type Tab = 'discover' | 'matches' | 'profile';

export default function Root() {
  return (
    <BinderErrorBoundary>
      <BinderApp />
    </BinderErrorBoundary>
  );
}

function BinderApp() {
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

    return () => {
      active = false;
    };
  }, [session?.user.id, legalRefreshKey]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true) {
      setOnboardingComplete(undefined);
      return;
    }

    let active = true;
    setOnboardingComplete(undefined);

    supabase
      .from('profiles')
      .select('onboarding_complete')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) setLoadError(error.message);
        setOnboardingComplete(data?.onboarding_complete === true);
      });

    return () => {
      active = false;
    };
  }, [session?.user.id, legalGate?.accepted]);

  useEffect(() => {
    if (!session || legalGate?.accepted !== true || onboardingComplete !== true || appSessionRecorded.current) return;
    appSessionRecorded.current = true;
    void recordBetaEvent('app_session', 'app', { outcome: 'ok', value: 1 });
  }, [session?.user.id, legalGate?.accepted, onboardingComplete]);

  if (session === undefined) return <LoadingScreen message={loadError || 'Loading Binder…'} />;
  if (!session) return <AuthScreen />;

  if (legalGate === undefined) return <LoadingScreen message="Checking Binder safety rules…" />;
  if (legalGate === null) {
    return (
      <LoadingScreen
        message={loadError || 'Could not verify Binder safety rules.'}
        retryLabel="Try again"
        onRetry={() => setLegalRefreshKey((value) => value + 1)}
      />
    );
  }

  if (!legalGate.accepted) {
    return (
      <LegalGateScreen
        gate={legalGate}
        onAccepted={() => {
          setLegalGate((current) => current ? { ...current, accepted: true } : current);
          setLoadError('');
        }}
      />
    );
  }

  if (onboardingComplete === undefined) return <LoadingScreen message={loadError || 'Loading your Binder profile…'} />;

  if (!onboardingComplete) {
    return (
      <OnboardingScreen
        userId={session.user.id}
        onComplete={() => {
          setOnboardingComplete(true);
          setTab('discover');
        }}
      />
    );
  }

  if (betaOpen) return <BetaScreen onClose={() => setBetaOpen(false)} />;

  if (activeMatch) {
    return (
      <ChatScreen
        match={activeMatch}
        currentUserId={session.user.id}
        onClose={() => {
          setActiveMatch(null);
          setMatchesRefreshKey((value) => value + 1);
        }}
        onConversationEnded={() => {
          setActiveMatch(null);
          setTab('matches');
          setMatchesRefreshKey((value) => value + 1);
        }}
      />
    );
  }

  return (
    <View style={styles.shell}>
      <View style={styles.nav}>
        <NavItem label="Discover" active={tab === 'discover'} onPress={() => setTab('discover')} />
        <NavItem
          label="Matches"
          active={tab === 'matches'}
          onPress={() => {
            setTab('matches');
            setMatchesRefreshKey((value) => value + 1);
          }}
        />
        <NavItem label="Profile" active={tab === 'profile'} onPress={() => setTab('profile')} />
      </View>
      <View style={styles.content}>
        {tab === 'discover' ? <DiscoveryScreen /> : null}
        {tab === 'matches' ? (
          <MatchesScreen
            refreshKey={matchesRefreshKey}
            onOpenMatch={(match) => setActiveMatch(match)}
          />
        ) : null}
        {tab === 'profile' ? <ProfileScreen userId={session.user.id} onOpenBeta={() => setBetaOpen(true)} /> : null}
      </View>
    </View>
  );
}

function NavItem({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.navItem, active && styles.navItemActive]} accessibilityRole="button">
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </Pressable>
  );
}

function LoadingScreen({ message, retryLabel, onRetry }: { message: string; retryLabel?: string; onRetry?: () => void }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#C7FF4A" size="large" />
      <Text style={styles.loadingText}>{message}</Text>
      {onRetry && retryLabel ? (
        <Pressable style={styles.retry} onPress={onRetry}><Text style={styles.retryText}>{retryLabel}</Text></Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#0B0B0F' },
  nav: { paddingTop: 48, paddingHorizontal: 18, paddingBottom: 8, flexDirection: 'row', gap: 8, backgroundColor: '#0B0B0F' },
  navItem: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#17171D' },
  navItemActive: { backgroundColor: '#C7FF4A' },
  navText: { color: '#9999A3', fontWeight: '800', fontSize: 12 },
  navTextActive: { color: '#101115' },
  content: { flex: 1 },
  loading: { flex: 1, backgroundColor: '#090A0F', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: '#AAAAAF', marginTop: 14, textAlign: 'center', lineHeight: 20 },
  retry: { marginTop: 18, minHeight: 46, paddingHorizontal: 20, borderRadius: 14, borderWidth: 1, borderColor: '#353A45', alignItems: 'center', justifyContent: 'center' },
  retryText: { color: '#F7F8F3', fontWeight: '800' },
});
