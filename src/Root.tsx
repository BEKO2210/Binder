import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from './lib/supabase';
import type { MatchSummary } from './lib/conversation';
import AuthScreen from './screens/AuthScreen';
import ChatScreen from './screens/ChatScreen';
import DiscoveryScreen from './screens/DiscoveryScreen';
import MatchesScreen from './screens/MatchesScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ProfileScreen from './screens/ProfileScreen';

type Tab = 'discover' | 'matches' | 'profile';

export default function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('discover');
  const [activeMatch, setActiveMatch] = useState<MatchSummary | null>(null);
  const [matchesRefreshKey, setMatchesRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setLoadError(error.message);
      setSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoadError('');
      setActiveMatch(null);
      setTab('discover');
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session) {
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
  }, [session?.user.id]);

  if (session === undefined || (session && onboardingComplete === undefined)) {
    return <LoadingScreen message={loadError || 'Loading Binder…'} />;
  }

  if (!session) return <AuthScreen />;

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
        {tab === 'profile' ? <ProfileScreen userId={session.user.id} /> : null}
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

function LoadingScreen({ message }: { message: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#C7FF4A" size="large" />
      <Text style={styles.loadingText}>{message}</Text>
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
  loading: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { color: '#AAAAAF', marginTop: 14, textAlign: 'center' },
});
