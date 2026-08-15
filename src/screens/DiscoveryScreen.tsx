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
import { reportAndBlockDiscoveryProfile, type DiscoveryReportReason } from '../lib/safety';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.24;
const SWIPE_OUT = SCREEN_WIDTH * 1.35;

const REPORT_REASONS: { value: DiscoveryReportReason; label: string; detail: string }[] = [
  { value: 'underage', label: 'May be under 18', detail: 'Highest-priority safety review.' },
  { value: 'harassment', label: 'Harassment or threats', detail: 'Abusive, coercive or threatening behavior.' },
  { value: 'fake', label: 'Fake or impersonation', detail: 'Identity or profile appears deceptive.' },
  { value: 'spam', label: 'Spam or scam', detail: 'Commercial spam, fraud or suspicious solicitation.' },
  { value: 'sexual_content', label: 'Sexual content', detail: 'Explicit or unwanted sexual profile content.' },
  { value: 'violence', label: 'Violence', detail: 'Threats or graphic violent content.' },
  { value: 'other', label: 'Other safety concern', detail: 'A concern not covered above.' },
];

export default function DiscoveryScreen() {
  const [profiles, setProfiles] = useState<DiscoveryProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [decisionPending, setDecisionPending] = useState(false);
  const [error, setError] = useState('');
  const [match, setMatch] = useState<DiscoveryProfile | null>(null);
  const [safetyOpen, setSafetyOpen] = useState(false);
  const [safetyReason, setSafetyReason] = useState<DiscoveryReportReason | null>(null);
  const [safetyBusy, setSafetyBusy] = useState(false);
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

  const rotate = position.x.interpolate({ inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH], outputRange: ['-13deg', '0deg', '13deg'], extrapolate: 'clamp' });
  const bindOpacity = position.x.interpolate({ inputRange: [0, SWIPE_THRESHOLD], outputRange: [0, 1], extrapolate: 'clamp' });
  const passOpacity = position.x.interpolate({ inputRange: [-SWIPE_THRESHOLD, 0], outputRange: [1, 0], extrapolate: 'clamp' });

  function springBack() {
    Animated.spring(position, { toValue: { x: 0, y: 0 }, friction: 5, tension: 45, useNativeDriver: false }).start();
  }

  async function submitDecision(direction: 'left' | 'right') {
    if (!profile || decisionPending || safetyOpen) return;
    const current = profile;
    setDecisionPending(true);
    setError('');

    try {
      const result = await recordDecision(current.id, direction === 'right' ? 'bind' : 'pass');
      Animated.timing(position, { toValue: { x: direction === 'right' ? SWIPE_OUT : -SWIPE_OUT, y: 0 }, duration: 180, useNativeDriver: false }).start(() => {
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

  function openSafety() {
    if (!profile || decisionPending) return;
    springBack();
    setSafetyReason(null);
    setError('');
    setSafetyOpen(true);
  }

  async function submitSafetyReport() {
    if (!profile || !safetyReason || safetyBusy) return;
    const targetId = profile.id;
    setSafetyBusy(true);
    setError('');
    try {
      await reportAndBlockDiscoveryProfile(targetId, safetyReason);
      setSafetyOpen(false);
      setSafetyReason(null);
      position.setValue({ x: 0, y: 0 });
      setProfiles((current) => current.filter((item) => item.id !== targetId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not submit the safety report.');
    } finally {
      setSafetyBusy(false);
    }
  }

  const panResponder = useMemo(
    () => PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => !decisionPending && !safetyOpen && (Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6),
      onPanResponderMove: (_, gesture) => { if (!decisionPending && !safetyOpen) position.setValue({ x: gesture.dx, y: gesture.dy * 0.18 }); },
      onPanResponderRelease: (_, gesture) => {
        if (decisionPending || safetyOpen || !profile) return;
        if (gesture.dx > SWIPE_THRESHOLD) void submitDecision('right');
        else if (gesture.dx < -SWIPE_THRESHOLD) void submitDecision('left');
        else springBack();
      },
    }),
    [decisionPending, safetyOpen, profile?.id],
  );

  if (loading && profiles.length === 0) {
    return <View style={styles.center}><StatusBar style="light" /><ActivityIndicator color="#C7FF4A" size="large" /><Text style={styles.secondary}>Finding people near you…</Text></View>;
  }

  if (error && profiles.length === 0) {
    return (
      <View style={styles.center}>
        <StatusBar style="light" />
        <Text style={styles.eyebrow}>DISCOVERY PAUSED</Text><Text style={styles.emptyTitle}>{error}</Text>
        <Text style={styles.secondary}>Binder only uses your location to calculate nearby candidates. Exact coordinates are never sent to other users.</Text>
        <Pressable style={styles.primaryButton} onPress={() => void loadDiscovery(true)}><Text style={styles.primaryButtonText}>Try again</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View><Text style={styles.brand}>BINDER</Text><Text style={styles.subtitle}>People who fit both sides.</Text></View>
        {decisionPending ? <ActivityIndicator color="#C7FF4A" /> : null}
      </View>

      <View style={styles.deck}>
        {!profile ? (
          <View style={styles.emptyCard}>
            <Text style={styles.eyebrow}>YOU'RE CAUGHT UP</Text><Text style={styles.emptyTitle}>No more people right now.</Text>
            <Text style={styles.secondary}>We only show profiles that pass mutual age, preference, distance and safety filters.</Text>
            <Pressable style={styles.primaryButton} onPress={() => void loadDiscovery(true)}><Text style={styles.primaryButtonText}>Refresh nearby</Text></Pressable>
          </View>
        ) : (
          <>
            {nextProfile ? <ProfileCard profile={nextProfile} back /> : null}
            <Animated.View {...panResponder.panHandlers} style={[styles.animatedCard, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate }] }]}>
              <ProfileCard profile={profile} />
              <Animated.View style={[styles.vote, styles.bindVote, { opacity: bindOpacity }]}><Text style={styles.bindVoteText}>BIND</Text></Animated.View>
              <Animated.View style={[styles.vote, styles.passVote, { opacity: passOpacity }]}><Text style={styles.passVoteText}>PASS</Text></Animated.View>
            </Animated.View>
            <Pressable accessibilityRole="button" accessibilityLabel="Safety options for this profile" onPress={openSafety} style={styles.safetyEntry}>
              <Text style={styles.safetyEntryText}>Safety ···</Text>
            </Pressable>
          </>
        )}
      </View>

      {error ? <Text style={styles.inlineError}>{error}</Text> : null}
      <View style={styles.actions}>
        <ActionButton label="×" kind="pass" disabled={!profile || decisionPending || safetyOpen} onPress={() => void submitDecision('left')} />
        <ActionButton label="♥" kind="bind" disabled={!profile || decisionPending || safetyOpen} onPress={() => void submitDecision('right')} />
      </View>

      {match ? (
        <View style={styles.matchOverlay}>
          <View style={styles.matchPanel}>
            <Text style={styles.eyebrow}>IT'S A BIND</Text><Text style={styles.matchTitle}>You and {match.name} chose each other.</Text>
            <Text style={styles.secondary}>Your match is ready in Matches. Start a conversation when you want to.</Text>
            <Pressable style={styles.primaryButton} onPress={() => setMatch(null)}><Text style={styles.primaryButtonText}>Keep discovering</Text></Pressable>
          </View>
        </View>
      ) : null}

      {safetyOpen && profile ? (
        <View style={styles.safetyOverlay}>
          <View style={styles.safetyPanel}>
            <Text style={styles.safetyEyebrow}>SAFETY · {profile.name.toUpperCase()}</Text>
            <Text style={styles.safetyTitle}>What should Binder review?</Text>
            <Text style={styles.safetyCopy}>Reporting also blocks this profile immediately. They are not told who reported or blocked them.</Text>
            <View style={styles.reasonList}>
              {REPORT_REASONS.map((reason) => (
                <Pressable key={reason.value} onPress={() => setSafetyReason(reason.value)} style={[styles.reason, safetyReason === reason.value && styles.reasonActive]}>
                  <View style={styles.reasonTextWrap}><Text style={[styles.reasonTitle, safetyReason === reason.value && styles.reasonTitleActive]}>{reason.label}</Text><Text style={styles.reasonDetail}>{reason.detail}</Text></View>
                  <View style={[styles.radio, safetyReason === reason.value && styles.radioActive]}>{safetyReason === reason.value ? <View style={styles.radioDot} /> : null}</View>
                </Pressable>
              ))}
            </View>
            <Pressable disabled={!safetyReason || safetyBusy} onPress={() => void submitSafetyReport()} style={[styles.reportButton, (!safetyReason || safetyBusy) && styles.reportDisabled]}>
              {safetyBusy ? <ActivityIndicator color="#240A0F" /> : <Text style={styles.reportText}>Report & block</Text>}
            </Pressable>
            <Pressable disabled={safetyBusy} onPress={() => { setSafetyOpen(false); setSafetyReason(null); }} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel</Text></Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({ label, kind, disabled, onPress }: { label: string; kind: 'pass' | 'bind'; disabled: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={kind === 'bind' ? 'Bind profile' : 'Pass profile'} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionButton, kind === 'bind' ? styles.bindButton : styles.passButton, pressed && styles.pressed, disabled && styles.disabled]}><Text style={kind === 'bind' ? styles.bindAction : styles.passAction}>{label}</Text></Pressable>;
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
  screen: { flex: 1, backgroundColor: '#0B0B0F' }, center: { flex: 1, backgroundColor: '#0B0B0F', alignItems: 'center', justifyContent: 'center', padding: 28 },
  header: { height: 74, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, brand: { color: '#F7F7F2', fontSize: 22, fontWeight: '900', letterSpacing: 4 }, subtitle: { color: '#8D8D96', fontSize: 12, marginTop: 4 },
  deck: { flex: 1, marginHorizontal: 16, marginTop: 4, marginBottom: 12, justifyContent: 'center' }, animatedCard: { ...StyleSheet.absoluteFill },
  card: { ...StyleSheet.absoluteFill, borderRadius: 28, overflow: 'hidden', backgroundColor: '#18181E', borderWidth: 1, borderColor: '#2A2A32' }, backCard: { transform: [{ scale: 0.965 }, { translateY: 10 }], opacity: 0.62 },
  photo: { flex: 1, justifyContent: 'flex-end' }, photoImage: { borderRadius: 28 }, photoShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.18)' }, cardContent: { padding: 22, paddingTop: 150, backgroundColor: 'rgba(0,0,0,0.46)' },
  distancePill: { alignSelf: 'flex-start', backgroundColor: 'rgba(12,12,15,0.78)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7, marginBottom: 9 }, distanceText: { color: '#E7E7E2', fontSize: 11, fontWeight: '700' },
  name: { color: '#FFFFFF', fontSize: 34, fontWeight: '900', letterSpacing: -1 }, age: { fontWeight: '500' }, bio: { color: '#E2E2DE', fontSize: 14, lineHeight: 20, marginTop: 7, maxWidth: '92%' }, tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 13 }, tag: { backgroundColor: 'rgba(255,255,255,0.13)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 }, tagText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  vote: { position: 'absolute', top: 28, borderWidth: 3, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 }, bindVote: { left: 24, borderColor: '#C7FF4A', transform: [{ rotate: '-8deg' }] }, passVote: { right: 24, borderColor: '#FF5A76', transform: [{ rotate: '8deg' }] }, bindVoteText: { color: '#C7FF4A', fontSize: 24, fontWeight: '900', letterSpacing: 2 }, passVoteText: { color: '#FF5A76', fontSize: 24, fontWeight: '900', letterSpacing: 2 },
  safetyEntry: { position: 'absolute', top: 14, right: 14, zIndex: 5, backgroundColor: 'rgba(10,11,15,.78)', borderWidth: 1, borderColor: 'rgba(255,255,255,.16)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 }, safetyEntryText: { color: '#E2E4E8', fontSize: 10, fontWeight: '900', letterSpacing: .5 },
  actions: { height: 82, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 24, paddingBottom: 10 }, actionButton: { width: 62, height: 62, borderRadius: 31, alignItems: 'center', justifyContent: 'center', borderWidth: 1 }, passButton: { backgroundColor: '#15151B', borderColor: '#34343E' }, bindButton: { backgroundColor: '#C7FF4A', borderColor: '#C7FF4A' }, passAction: { color: '#FF6A83', fontSize: 37, fontWeight: '300', lineHeight: 41 }, bindAction: { color: '#111216', fontSize: 28, fontWeight: '900' }, pressed: { transform: [{ scale: 0.94 }], opacity: 0.85 }, disabled: { opacity: 0.42 },
  inlineError: { color: '#FF8BA0', textAlign: 'center', paddingHorizontal: 20, paddingBottom: 4, fontSize: 12 }, emptyCard: { borderWidth: 1, borderColor: '#292932', borderRadius: 28, padding: 26, backgroundColor: '#141419' }, eyebrow: { color: '#C7FF4A', fontWeight: '900', letterSpacing: 2, fontSize: 11 }, emptyTitle: { color: '#F5F5F0', fontSize: 25, fontWeight: '900', marginTop: 8, textAlign: 'center' }, secondary: { color: '#9999A3', lineHeight: 20, marginTop: 12, textAlign: 'center' }, primaryButton: { marginTop: 20, backgroundColor: '#C7FF4A', borderRadius: 16, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center' }, primaryButtonText: { color: '#101115', fontWeight: '900' },
  matchOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(5,5,8,0.86)', alignItems: 'center', justifyContent: 'center', padding: 24 }, matchPanel: { width: '100%', maxWidth: 410, backgroundColor: '#15151B', borderColor: '#303039', borderWidth: 1, borderRadius: 28, padding: 26 }, matchTitle: { color: '#FFFFFF', fontSize: 30, fontWeight: '900', marginTop: 8, lineHeight: 35 },
  safetyOverlay: { ...StyleSheet.absoluteFill, zIndex: 20, backgroundColor: 'rgba(4,5,8,.94)', justifyContent: 'flex-end' }, safetyPanel: { maxHeight: '90%', backgroundColor: '#12141B', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderColor: '#2A2F3A', padding: 20, paddingBottom: 30 }, safetyEyebrow: { color: '#FF8EA2', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 }, safetyTitle: { color: '#F7F8F3', fontSize: 27, lineHeight: 30, fontWeight: '900', marginTop: 8 }, safetyCopy: { color: '#949AA5', fontSize: 12, lineHeight: 18, marginTop: 8 }, reasonList: { marginTop: 15, gap: 7 },
  reason: { minHeight: 54, borderRadius: 15, borderWidth: 1, borderColor: '#2A2F3A', backgroundColor: '#171923', paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }, reasonActive: { borderColor: '#7A3443', backgroundColor: '#211318' }, reasonTextWrap: { flex: 1 }, reasonTitle: { color: '#D8DBE0', fontSize: 12, fontWeight: '900' }, reasonTitleActive: { color: '#FFF0F3' }, reasonDetail: { color: '#747A85', fontSize: 10, marginTop: 2 }, radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1, borderColor: '#555B66', alignItems: 'center', justifyContent: 'center' }, radioActive: { borderColor: '#FF5A76' }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF5A76' },
  reportButton: { height: 52, borderRadius: 15, backgroundColor: '#FF5A76', alignItems: 'center', justifyContent: 'center', marginTop: 16 }, reportDisabled: { opacity: .3 }, reportText: { color: '#240A0F', fontWeight: '900' }, cancelButton: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 5 }, cancelText: { color: '#A4A9B2', fontWeight: '800' },
});
