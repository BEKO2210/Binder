import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  ImageBackground,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  fetchDiscoveryBatch,
  recordDecision,
  refreshDiscoveryLocation,
  type DiscoveryProfile,
} from '../lib/discovery';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.24;
const SWIPE_OUT = SCREEN_WIDTH * 1.35;

export default function DiscoveryScreen() {
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionPending, setDecisionPending] = useState(false);
  const [error, setError] = useState('');
  const [match, setMatch] = useState<DiscoveryProfile | null>(null);
  const position = useRef(new Animated.ValueXY()).current;
  const profile = profiles[0];
  const nextProfile = profiles[1];

  async function loadDiscovery(refreshLocation = true) {
    setLoading(true);
    setError('');
    try {
      if (refreshLocation) await refreshDiscoveryLocation();
      setProfiles(await fetchDiscoveryBatch(20));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load discovery.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDiscovery(true);
  }, []);

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-13deg', '0deg', '13deg'],
    extrapolate: 'clamp',
  });

  const bindOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const passOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  function springBack() {
    Animated.spring(position, {
      toValue: { x: 0, y: 0 },
      friction: 5,
      tension: 45,
      useNativeDriver: false,
    }).start();
  }

  async function submitDecision(direction: 'left' | 'right') {
    if (!profile || decisionPending) return;
    const current = profile;
    setDecisionPending(true);
    setError('');

    try {
      const result = await recordDecision(current.id, direction === 'right' ? 'bind' : 'pass');
      Animated.timing(position, {
        toValue: { x: direction === 'right' ? SWIPE_OUT : -SWIPE_OUT, y: 0 },
        duration: 180,
        useNativeDriver: false,
      }).start(() => {
        position.setValue({ x: 0, y: 0 });
        setProfiles((value) => value.slice(1));
        if (result.matched) setMatch(current);
        setDecisionPending(false);
      });
    } catch (cause) {
      setDecisionPending(false);
      setError(cause instanceof Error ? cause.message : 'Could not save your decision.');
      springBack();
    }
  }

  useEffect(() => {
    if (!loading && !decisionPending && profiles.length === 0 && !error) {
      void loadDiscovery(false);
    }
  }, [profiles.length, loading, decisionPending, error]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          !decisionPending && (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6),
        onPanResponderMove: (_, gesture) => {
          if (!decisionPending) position.setValue({ x: gesture.dx, y: gesture.dy * 0.18 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (decisionPending || !profile) return;
          if (gesture.dx > SWIPE_THRESHOLD) void submitDecision('right');
          else if (gesture.dx < -SWIPE_THRESHOLD) void submitDecision('left');
          else springBack();
        },
      }),
    [decisionPending, profile?.id],
  );

  if (loading && profiles.length === 0) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <ActivityIndicator color="#C7FF4A" size="large" />
        <Text style={styles.secondary}>Finding people near you…</Text>
      </View>
    );
  }

  if (error && profiles.length === 0) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <Text style={styles.eyebrow}>DISCOVERY PAUSED</Text>
        <Text style={styles.emptyTitle}>{error}</Text>
        <Text style={styles.secondary}>Binder only uses your location to calculate nearby candidates. Exact coordinates are never sent to other users.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadDiscovery(true)}>
          <Text style={styles.primaryButtonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>BINDER</Text>
          <Text style={styles.subtitle}>People who fit both sides.</Text>
        </View>
        {decisionPending ? <ActivityIndicator color="#C7FF4A" /> : null}
      </View>

      <View style={styles.deck}>
        {!profile ? (
          <View style={styles.emptyCard}>
            <Text style={styles.eyebrow}>YOU'RE CAUGHT UP</Text>
            <Text style={styles.emptyTitle}>No more people right now.</Text>
            <Text style={styles.secondary}>We only show profiles that pass mutual age, preference, distance and safety filters.</Text>
            <Pressable style={styles.primaryButton} onPress={() => void loadDiscovery(true)}>
              <Text style={styles.primaryButtonText}>Refresh nearby</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {nextProfile ? <ProfileCard profile={nextProfile} back /> : null}
            <Animated.View
              {...panResponder.panHandlers}
              style={[styles.animatedCard, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}
            >
              <ProfileCard profile={profile} />
              <Animated.View style={[styles.vote, styles.bindVote, { opacity: bindOpacity }]}><Text style={styles.bindVoteText}>BIND</Text></Animated.View>
              <Animated.View style={[styles.vote, styles.passVote, { opacity: passOpacity }]}><Text style={styles.passVoteText}>PASS</Text></Animated.View>
            </Animated.View>
          </>
        )}
      </View>

      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
      <View style={styles.actions}>
        <ActionButton label="×" kind="pass" disabled={!profile || decisionPending} onPress={() => void submitDecision('left')} />
        <ActionButton label="♥" kind="bind" disabled={!profile || decisionPending} onPress={() => void submitDecision('right')} />
      </View>

      {match ? (
        <View style={styles.matchOverlay}>
          <View style={styles.matchPanel}>
            <Text style={styles.eyebrow}>IT'S A BIND</Text>
            <Text style={styles.matchTitle}>You and {match.name} chose each other.</Text>
            <Text style={styles.secondary}>The server created one atomic match. Messaging comes in Phase 3.</Text>
            <Pressable style={styles.primaryButton} onPress={() => setMatch(null)}>
              <Text style={styles.primaryButtonText}>Keep discovering</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({ label, kind, disabled, onPress }: { label: string; kind: 'pass' | 'bind'; disabled: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={kind === 'bind' ? 'Bind profile' : 'Pass profile'} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.actionButton, kind === 'bind' ? styles.bindButton : styles.passButton, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={kind === 'bind' ? styles.bindAction : styles.passAction}>{label}</Text>
    </Pressable>
  );
}

function ProfileCard({ profile, back = false }: { profile: DiscoveryProfile; back?: boolean }) {
  return (
    <View style={[styles.card, back && styles.backCard]}>
      <ImageBackground source={{ uri: profile.photoUrl }} style={styles.photo} imageStyle={styles.photoImage}>
        <View style={styles.photoShade} />
        <View style={styles.cardContent}>
          <View style={styles.distancePill}><Text style={styles.distanceText}>{profile.distanceKm} km away</Text></View>
          <Text style={styles.name}>{profile.name} <Text style={styles.age}>{profile.age}</Text></Text>
          <Text style={styles.bio}>{profile.bio}</Text>
          <View style={styles.tags}>{profile.tags.map((tag) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}</View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center', padding: 28 },
  header: { height: 74, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { color: '#F7F7F2', fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  subtitle: { color: '#8D8D96', fontSize: 12, marginTop: 4 },
  deck: { flex: 1, marginHorizontal: 16, marginTop: 4, marginBottom: 12, justifyContent: 'center' },
  animatedCard: { ...StyleSheet.absoluteFill },
  card: { ...StyleSheet.absoluteFill, borderRadius: 28, overflow: 'hidden', backgroundColor: '#18181E', borderWidth: 1, borderColor: '#2A2A32' },
  backCard: { transform: [{ scale: 0.965 }, { translateY: 10 }], opacity: 0.62 },
  photo: { flex: 1, justifyContent: 'flex-end' },
  photoImage: { borderRadius: 28 },
  photoShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.18)' },
  cardContent: { padding: 22, paddingTop: 150, backgroundColor: 'rgba(0,0,0,0.46)' },
  distancePill: { alignSelf: 'flex-start', backgroundColor: 'rgba(12,12,15,0.78)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginBottom: 9 },
  distanceText: { color: '#E7E7E2', fontSize: 11, fontWeight: '700' },
  name: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -1 },
  age: { fontWeight: '500' },
  bio: { color: '#E2E2DE', fontSize: 14, lineHeight: 20, marginTop: 7, maxWidth: '92%' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 },
  tag: { backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  tagText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  vote: { position: 'absolute', top: 28, borderWidth: 3, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
  bindVote: { left: 24, borderColor: '#C7FF4A', transform: [{ rotate: '-8deg' }] },
  passVote: { right: 24, borderColor: '#FF5A76', transform: [{ rotate: '8deg' }] },
  bindVoteText: { color: '#C7FF4A', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  passVoteText: { color: '#FF5A76', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  actions: { height: 82, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, paddingBottom: 10 },
  actionButton: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  passButton: { backgroundColor: '#15151B', borderColor: '#34343E' },
  bindButton: { backgroundColor: '#C7FF4A', borderColor: '#C7FF4A' },
  passAction: { color: '#FF6A83', fontSize: 37, fontWeight: '300', lineHeight: 41 },
  bindAction: { color: '#111216', fontSize: 28, fontWeight: '900' },
  pressed: { transform: [{ scale: 0.94 }], opacity: 0.85 },
  disabled: { opacity: 0.42 },
  inlineError: { color: '#FF8BA0', textAlign: 'center', paddingHorizontal: 20, paddingBottom: 4, fontSize: 12 },
  emptyCard: { borderWidth: 1, borderColor: '#292932', borderRadius: 28, padding: 26, backgroundColor: '#141419' },
  eyebrow: { color: '#C7FF4A', fontWeight: '900', letterSpacing: 2, fontSize: 11 },
  emptyTitle: { color: '#F5F5F0', fontSize: 25, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  secondary: { color: '#9999A3', lineHeight: 20, marginTop: 12, textAlign: 'center' },
  primaryButton: { marginTop: 20, backgroundColor: '#C7FF4A', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' },
  primaryButtonText: { color: '#101115', fontWeight: '900' },
  matchOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,5,8,0.86)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  matchPanel: { width: '100%', maxWidth: 410, backgroundColor: '#15151B', borderColor: '#303039', borderWidth: 1, borderRadius: 28, padding: 26 },
  matchTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 8, lineHeight: 35 },
});
