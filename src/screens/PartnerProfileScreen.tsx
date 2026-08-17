import { useEffect, useState } from 'react';
import { BackHandler, FlatList, Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import { fetchPartnerProfile, type PartnerProfile } from '../lib/partnerProfile';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { userId: string; fallbackName: string; onClose: () => void };

// The partner page shows exactly what the server declares visible: approved
// photos in a swipeable pager, the identity line, bio and interests. Nothing
// else leaves the database, so nothing else is rendered.
export default function PartnerProfileScreen({ userId, fallbackName, onClose }: Props) {
  const { theme, reduceMotion } = useBinderTheme();
  const { width } = useWindowDimensions();
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [error, setError] = useState('');
  const [page, setPage] = useState(0);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!viewerUrl) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setViewerUrl(null);
      return true;
    });
    return () => subscription.remove();
  }, [viewerUrl]);

  useEffect(() => {
    let active = true;
    fetchPartnerProfile(userId)
      .then((next) => { if (active) setProfile(next); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Could not load this profile.'); });
    return () => { active = false; };
  }, [userId]);

  const heroHeight = Math.min(560, width * 1.15);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title={profile?.name ?? fallbackName} centered leading={{ icon: 'back', accessibilityLabel: 'Back to conversation', onPress: onClose }} />

      {error ? (
        <ScreenState kind="error" icon="retry" title="Profile not available" message={error} actionLabel="Back" onAction={onClose} />
      ) : !profile ? (
        <ScreenState kind="loading" message="Opening profile…" />
      ) : (
        <Animated.View entering={reduceMotion ? undefined : FadeIn.duration(theme.motion.entrance)} style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: theme.spacing.x12 }}>
            {profile.photoUrls.length > 0 ? (
              <View>
                <FlatList
                  data={profile.photoUrls}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item, index) => `${index}-${item.slice(-24)}`}
                  onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}
                  renderItem={({ item, index }) => (
                    <Pressable accessibilityRole="imagebutton" accessibilityLabel={`View photo ${index + 1} of ${profile.photoUrls.length} of ${profile.name} in full`} onPress={() => setViewerUrl(item)}>
                      <Image source={{ uri: item }} style={{ width, height: heroHeight, backgroundColor: theme.colors.surfaceElevated }} resizeMode="cover" />
                    </Pressable>
                  )}
                />
                {profile.photoUrls.length > 1 ? (
                  <View style={{ position: 'absolute', bottom: theme.spacing.x3, alignSelf: 'center', flexDirection: 'row', gap: theme.spacing.x1 }}>
                    {profile.photoUrls.map((_, index) => (
                      <View key={index} style={{ width: index === page ? 18 : 6, height: 6, borderRadius: theme.radii.pill, backgroundColor: index === page ? theme.accent.accent : theme.colors.scrim }} />
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              <View style={{ height: heroHeight * 0.5, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.surfaceElevated }}>
                <BinderText variant="heading" tone="accent">{(profile.name || fallbackName).slice(0, 1)}</BinderText>
              </View>
            )}

            <View style={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, flexWrap: 'wrap' }}>
                <BinderText variant="displayL">{profile.name} <BinderText variant="heading">{profile.age}</BinderText></BinderText>
                {profile.distanceKm !== null ? (
                  <View style={{ backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x1 }}>
                    <BinderText variant="caption" tone="secondary">{profile.distanceKm} km away</BinderText>
                  </View>
                ) : null}
              </View>
              {profile.bio ? <BinderText variant="bodyL" tone="secondary" style={{ marginTop: theme.spacing.x4 }}>{profile.bio}</BinderText> : null}
              {profile.interests.length > 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x5 }}>
                  {profile.interests.map((interest) => (
                    <View key={interest} accessibilityRole="text" style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: theme.spacing.x4, borderRadius: theme.radii.pill, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}>
                      <BinderText variant="label" tone="secondary">{interest}</BinderText>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          </ScrollView>
        </Animated.View>
      )}

      {viewerUrl ? (
        <View style={{ position: 'absolute', inset: 0, backgroundColor: theme.colors.canvas }}>
          <BinderScreenHeader title="Photo" leading={{ icon: 'close', accessibilityLabel: 'Close full photo', onPress: () => setViewerUrl(null) }} />
          <Image source={{ uri: viewerUrl }} style={{ flex: 1 }} resizeMode="contain" />
        </View>
      ) : null}
    </View>
  );
}
