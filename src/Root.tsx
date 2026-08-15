import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { supabase } from './lib/supabase';
import AuthScreen from './screens/AuthScreen';
import DiscoveryScreen from './screens/DiscoveryScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import ProfileScreen from './screens/ProfileScreen';

export default function Root() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [onboardingComplete, setOnboardingComplete] = useState<boolean | undefined>(undefined);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<'discover' | 'profile'>('discover');

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

  return (
    <View style={styles.shell}>
      <View style={styles.nav}>
        <Pressable onPress={() => setTab('discover')} style={[styles.navItem, tab === 'discover' && styles.navItemActive]}>
          <Text style={[styles.navText, tab === 'discover' && styles.navTextActive]}>Discover</Text>
        </Pressable>
        <Pressable onPress={() => setTab('profile')} style={[styles.navItem, tab === 'profile' && styles.navItemActive]}>
          <Text style={[styles.navText, tab === 'profile' && styles.navTextActive]}>Profile</Text>
        </Pressable>
      </View>
      <View style={styles.content}>
        {tab === 'discover' ? <DiscoveryScreen /> : <ProfileScreen userId={session.user.id} />}
      </View>
    </View>
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
