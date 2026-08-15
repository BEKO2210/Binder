import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  ImageBackground,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type Profile = {
  id: string;
  name: string;
  age: number;
  distanceKm: number;
  bio: string;
  tags: string[];
  photo: string;
  likedYou: boolean;
};

const PROFILES: Profile[] = [
  {
    id: 'mia',
    name: 'Mia',
    age: 27,
    distanceKm: 4,
    bio: 'Coffee, late-night drives and finding the best pasta in town.',
    tags: ['Travel', 'Coffee', 'Dogs'],
    photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=1200&q=88&auto=format&fit=crop',
    likedYou: true,
  },
  {
    id: 'leon',
    name: 'Leon',
    age: 30,
    distanceKm: 7,
    bio: 'Gym before work, cooking after work, mountains whenever possible.',
    tags: ['Fitness', 'Cooking', 'Hiking'],
    photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=1200&q=88&auto=format&fit=crop',
    likedYou: false,
  },
  {
    id: 'sara',
    name: 'Sara',
    age: 25,
    distanceKm: 11,
    bio: 'Design nerd. Live music. I will absolutely steal your fries.',
    tags: ['Design', 'Music', 'Food'],
    photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1200&q=88&auto=format&fit=crop',
    likedYou: true,
  },
  {
    id: 'noah',
    name: 'Noah',
    age: 29,
    distanceKm: 15,
    bio: 'Weekend photographer, weekday developer, permanently looking for good ramen.',
    tags: ['Photography', 'Tech', 'Ramen'],
    photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=1200&q=88&auto=format&fit=crop',
    likedYou: false,
  },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.24;
const SWIPE_OUT = SCREEN_WIDTH * 1.35;

export default function App() {
  const [index, setIndex] = useState(0);
  const [match, setMatch] = useState<Profile | null>(null);
  const [likes, setLikes] = useState(0);
  const position = useRef(new Animated.ValueXY()).current;

  const profile = PROFILES[index];
  const nextProfile = PROFILES[index + 1];

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_WIDTH, 0, SCREEN_WIDTH],
    outputRange: ['-13deg', '0deg', '13deg'],
    extrapolate: 'clamp',
  });

  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const passOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  function finishSwipe(direction: 'left' | 'right', swipedProfile: Profile) {
    if (direction === 'right') {
      setLikes((value) => value + 1);
      if (swipedProfile.likedYou) setMatch(swipedProfile);
    }

    position.setValue({ x: 0, y: 0 });
    setIndex((value) => value + 1);
  }

  function swipe(direction: 'left' | 'right') {
    if (!profile) return;

    Animated.timing(position, {
      toValue: { x: direction === 'right' ? SWIPE_OUT : -SWIPE_OUT, y: 0 },
      duration: 220,
      useNativeDriver: false,
    }).start(() => finishSwipe(direction, profile));
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 6 || Math.abs(gesture.dy) > 6,
        onPanResponderMove: (_, gesture) => {
          position.setValue({ x: gesture.dx, y: gesture.dy * 0.18 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (!profile) return;
          if (gesture.dx > SWIPE_THRESHOLD) swipe('right');
          else if (gesture.dx < -SWIPE_THRESHOLD) swipe('left');
          else {
            Animated.spring(position, {
              toValue: { x: 0, y: 0 },
              friction: 5,
              tension: 45,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [profile],
  );

  function restartDeck() {
    position.setValue({ x: 0, y: 0 });
    setIndex(0);
    setLikes(0);
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>BINDER</Text>
          <Text style={styles.subtitle}>Find someone worth staying for.</Text>
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterNumber}>{likes}</Text>
          <Text style={styles.counterLabel}>LIKES</Text>
        </View>
      </View>

      <View style={styles.deck}>
        {!profile ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEyebrow}>THAT'S THE DECK</Text>
            <Text style={styles.emptyTitle}>You reached the end.</Text>
            <Text style={styles.emptyCopy}>
              In production, Binder will fetch the next ranked batch without exposing exact user locations.
            </Text>
            <Pressable style={styles.restartButton} onPress={restartDeck}>
              <Text style={styles.restartText}>Replay demo profiles</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {nextProfile ? <ProfileCard profile={nextProfile} style={styles.backCard} /> : null}

            <Animated.View
              {...panResponder.panHandlers}
              style={[
                styles.animatedCard,
                {
                  transform: [
                    { translateX: position.x },
                    { translateY: position.y },
                    { rotate },
                  ],
                },
              ]}
            >
              <ProfileCard profile={profile} />
              <Animated.View style={[styles.vote, styles.likeVote, { opacity: likeOpacity }]}>
                <Text style={styles.likeVoteText}>BIND</Text>
              </Animated.View>
              <Animated.View style={[styles.vote, styles.passVote, { opacity: passOpacity }]}>
                <Text style={styles.passVoteText}>PASS</Text>
              </Animated.View>
            </Animated.View>
          </>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pass profile"
          disabled={!profile}
          onPress={() => swipe('left')}
          style={({ pressed }) => [styles.actionButton, styles.passButton, pressed && styles.pressed]}
        >
          <Text style={styles.passAction}>×</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Like profile"
          disabled={!profile}
          onPress={() => swipe('right')}
          style={({ pressed }) => [styles.actionButton, styles.bindButton, pressed && styles.pressed]}
        >
          <Text style={styles.bindAction}>♥</Text>
        </Pressable>
      </View>

      <Text style={styles.hint}>Drag a card or use the buttons</Text>

      {match ? (
        <View style={styles.matchOverlay}>
          <View style={styles.matchPanel}>
            <Text style={styles.matchEyebrow}>IT'S A BIND</Text>
            <Text style={styles.matchTitle}>You and {match.name} like each other.</Text>
            <Text style={styles.matchCopy}>
              Mutual interest creates the conversation. No random DMs.
            </Text>
            <Pressable style={styles.matchPrimary} onPress={() => setMatch(null)}>
              <Text style={styles.matchPrimaryText}>Keep discovering</Text>
            </Pressable>
            <Pressable style={styles.matchSecondary} onPress={() => setMatch(null)}>
              <Text style={styles.matchSecondaryText}>Open chat later</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ProfileCard({ profile, style }: { profile: Profile; style?: object }) {
  return (
    <View style={[styles.card, style]}>
      <ImageBackground source={{ uri: profile.photo }} style={styles.photo} imageStyle={styles.photoImage}>
        <View style={styles.photoShade} />
        <View style={styles.cardContent}>
          <View style={styles.distancePill}>
            <Text style={styles.distanceText}>{profile.distanceKm} km away</Text>
          </View>
          <Text style={styles.name}>
            {profile.name} <Text style={styles.age}>{profile.age}</Text>
          </Text>
          <Text style={styles.bio}>{profile.bio}</Text>
          <View style={styles.tags}>
            {profile.tags.map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0B0B0F',
    paddingTop: 52,
  },
  header: {
    height: 78,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brand: {
    color: '#F7F7F2',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
  },
  subtitle: {
    color: '#8D8D96',
    fontSize: 12,
    marginTop: 4,
  },
  counter: {
    minWidth: 54,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#27272F',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  counterNumber: {
    color: '#C7FF4A',
    fontWeight: '900',
    fontSize: 16,
  },
  counterLabel: {
    color: '#73737D',
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  deck: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    justifyContent: 'center',
  },
  animatedCard: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#18181E',
    borderWidth: 1,
    borderColor: '#2A2A32',
  },
  backCard: {
    transform: [{ scale: 0.965 }, { translateY: 10 }],
    opacity: 0.62,
  },
  photo: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  photoImage: {
    borderRadius: 28,
  },
  photoShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  cardContent: {
    padding: 22,
    paddingTop: 150,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  distancePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(12,12,15,0.78)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    marginBottom: 9,
  },
  distanceText: {
    color: '#E7E7E2',
    fontSize: 11,
    fontWeight: '700',
  },
  name: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  age: {
    fontWeight: '500',
  },
  bio: {
    color: '#E2E2DE',
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
    maxWidth: '92%',
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 13,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  tagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  vote: {
    position: 'absolute',
    top: 28,
    borderWidth: 3,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  likeVote: {
    left: 24,
    borderColor: '#C7FF4A',
    transform: [{ rotate: '-8deg' }],
  },
  passVote: {
    right: 24,
    borderColor: '#FF5A76',
    transform: [{ rotate: '8deg' }],
  },
  likeVoteText: {
    color: '#C7FF4A',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  passVoteText: {
    color: '#FF5A76',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
  },
  actions: {
    height: 76,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  actionButton: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  passButton: {
    backgroundColor: '#15151B',
    borderColor: '#34343E',
  },
  bindButton: {
    backgroundColor: '#C7FF4A',
    borderColor: '#C7FF4A',
  },
  passAction: {
    color: '#FF6A83',
    fontSize: 37,
    fontWeight: '300',
    lineHeight: 41,
  },
  bindAction: {
    color: '#111216',
    fontSize: 28,
    fontWeight: '900',
  },
  pressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  hint: {
    textAlign: 'center',
    color: '#666670',
    fontSize: 11,
    paddingBottom: 20,
  },
  matchOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,5,8,0.84)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  matchPanel: {
    width: '100%',
    maxWidth: 410,
    backgroundColor: '#15151B',
    borderColor: '#303039',
    borderWidth: 1,
    borderRadius: 28,
    padding: 26,
  },
  matchEyebrow: {
    color: '#C7FF4A',
    fontWeight: '900',
    letterSpacing: 3,
    fontSize: 12,
  },
  matchTitle: {
    color: '#FFFFFF',
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 10,
  },
  matchCopy: {
    color: '#A3A3AD',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    marginBottom: 22,
  },
  matchPrimary: {
    backgroundColor: '#C7FF4A',
    borderRadius: 16,
    paddingVertical: 15,
    alignItems: 'center',
  },
  matchPrimaryText: {
    color: '#101115',
    fontWeight: '900',
    fontSize: 14,
  },
  matchSecondary: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  matchSecondaryText: {
    color: '#B8B8C0',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyCard: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: '#15151B',
    borderWidth: 1,
    borderColor: '#292932',
    padding: 28,
    justifyContent: 'center',
  },
  emptyEyebrow: {
    color: '#C7FF4A',
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 2.4,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -1,
    marginTop: 10,
  },
  emptyCopy: {
    color: '#9A9AA4',
    fontSize: 14,
    lineHeight: 21,
    marginTop: 12,
    marginBottom: 22,
  },
  restartButton: {
    alignSelf: 'flex-start',
    backgroundColor: '#F2F2ED',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  restartText: {
    color: '#111216',
    fontSize: 13,
    fontWeight: '900',
  },
});
