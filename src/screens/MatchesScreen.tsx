import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, RefreshControl, ScrollView, View } from 'react-native';

import { BinderButton, BinderCard, BinderIcon, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import { fetchMatches, type MatchSummary } from '../lib/conversation';
import { previewTimeLabel, splitConversationPreviews } from '../lib/conversationPresentation';
import { enablePushNotifications, getNotificationPermissionStatus, openSystemNotificationSettings } from '../lib/notifications';
import { bannerOffersEnable, bannerStateAfterRegistration, initialBannerState, type PushBannerState } from '../lib/pushBanner';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

export default function MatchesScreen({ refreshKey, onOpenMatch, onOpenDiscovery }: { refreshKey: number; onOpenMatch: (match: MatchSummary) => void; onOpenDiscovery: () => void }) {
  const { theme, settings, updateNotifications } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pushState, setPushState] = useState<PushBannerState>('idle');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setMatches(await fetchMatches()); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Could not load matches.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);
  const { newMatches, conversations } = splitConversationPreviews(matches);

  useEffect(() => {
    let active = true;
    getNotificationPermissionStatus()
      .then((permission) => { if (active) setPushState((current) => current === 'busy' ? current : initialBannerState(settings.notifications.enabled, permission)); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [settings.notifications.enabled]);

  async function enablePush() {
    if (pushState === 'busy') return;
    setPushState('busy');
    setError('');
    try {
      const result = await enablePushNotifications();
      const next = bannerStateAfterRegistration(result.status);
      setPushState(next);
      if (next === 'enabled') await updateNotifications({ enabled: true });
      await haptic(next === 'enabled' ? 'selection' : 'warning');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not enable notifications.');
      setPushState('idle');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingHorizontal: theme.spacing.screen }}>
      <BinderScreenHeader title="Your Binds" eyebrow="CONVERSATIONS" style={{ marginHorizontal: -theme.spacing.screen, marginBottom: theme.spacing.x4 }} trailing={<BinderButton label="Refresh" icon="retry" variant="ghost" fullWidth={false} onPress={() => void load()} />} />

      <BinderCard style={{ marginBottom: theme.spacing.x3, padding: theme.spacing.x4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
          <View style={{ width: 40, height: 40, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
            <BinderIcon name="notifications" size={21} color={pushState === 'enabled' ? theme.accent.accent : theme.colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <BinderText variant="label">{pushState === 'enabled' ? 'Message alerts enabled' : pushState === 'busy' ? 'Enabling alerts…' : pushState === 'denied' ? 'Alerts are blocked' : 'Message alerts'}</BinderText>
            <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>
              {pushState === 'unavailable' ? 'Push notifications are not supported on this device. Chat still works normally.'
                : pushState === 'offline' ? 'Could not reach the push service. Check your connection and try again.'
                : pushState === 'denied' ? 'Android is blocking Binder notifications. Allow them in system settings.'
                : pushState === 'enabled' ? 'Notification categories can be adjusted in App Settings.'
                : 'Opt in to alerts for new matches and messages.'}
            </BinderText>
          </View>
          {bannerOffersEnable(pushState) ? <BinderButton label={pushState === 'offline' ? 'Retry' : 'Enable'} variant="secondary" fullWidth={false} loading={pushState === 'busy'} onPress={() => void enablePush()} /> : null}
          {pushState === 'denied' ? <BinderButton label="Open settings" variant="secondary" fullWidth={false} onPress={() => void openSystemNotificationSettings().catch(() => undefined)} /> : null}
        </View>
      </BinderCard>

      {loading && matches.length === 0 ? <ScreenState kind="loading" message="Loading your matches…" /> : error && matches.length === 0 ? <ScreenState kind="error" icon="retry" title="Matches did not load" message={error} actionLabel="Try again" onAction={() => void load()} /> : matches.length === 0 ? <ScreenState kind="empty" icon="matches" title="A Bind starts together" message="When you and someone in Discovery both choose Bind, they appear here and either of you can start the conversation." actionLabel="Go to Discovery" onAction={onOpenDiscovery} /> : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.matchId}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.accent.accent} colors={[theme.accent.accent]} progressBackgroundColor={theme.colors.surfaceElevated} />}
          ListHeaderComponent={newMatches.length > 0 ? <View style={{ marginBottom: theme.spacing.x5 }}><BinderText variant="micro" tone="muted" style={{ marginBottom: theme.spacing.x3 }}>NEW BINDS · START SOMETHING</BinderText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.x3 }}>{newMatches.map((item) => <Pressable key={item.matchId} accessibilityRole="button" accessibilityLabel={`Start a conversation with ${item.firstName}`} onPress={() => { void haptic('selection'); onOpenMatch(item); }} style={({ pressed }) => ({ width: theme.spacing.x16 + theme.spacing.x4, minHeight: theme.spacing.x16 + theme.spacing.x10, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.x2, borderRadius: theme.radii.card, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface })}>{item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }} /> : <View style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderText variant="title" tone="accent">{item.firstName.slice(0, 1).toUpperCase()}</BinderText></View>}<BinderText variant="label" numberOfLines={1} style={{ marginTop: theme.spacing.x2 }}>{item.firstName}</BinderText><BinderText variant="caption" tone="accent">Say hello</BinderText></Pressable>)}</ScrollView></View> : null}
          ListEmptyComponent={<BinderText variant="body" tone="muted" style={{ paddingVertical: theme.spacing.x5 }}>Your conversations will appear here after the first message.</BinderText>}
          contentContainerStyle={{ paddingBottom: theme.spacing.x8, gap: theme.spacing.x2 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open conversation with ${item.firstName}`} onPress={() => { void haptic('selection'); onOpenMatch(item); }}>
              {({ pressed }) => (
                <BinderCard style={{ minHeight: theme.spacing.x16 + theme.spacing.x5, padding: theme.spacing.x3, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}>
                  {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }} /> : <View style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderText variant="title" tone="accent">{item.firstName.slice(0,1).toUpperCase()}</BinderText></View>}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
                      <BinderText variant="label" tone={item.unreadCount > 0 ? 'primary' : 'secondary'} numberOfLines={1} style={{ flex: 1 }}>{item.firstName}, {item.age}</BinderText>
                      {item.lastMessageAt ? <BinderText variant="caption" tone={item.unreadCount > 0 ? 'secondary' : 'muted'}>{previewTimeLabel(item.lastMessageAt)}</BinderText> : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2, marginTop: theme.spacing.x2 }}>{item.unreadCount > 0 ? <View accessibilityLabel={`${item.unreadCount} unread messages`} style={{ width: theme.spacing.x2, height: theme.spacing.x2, borderRadius: theme.radii.pill, backgroundColor: theme.accent.accent }} /> : null}<BinderText variant={item.unreadCount > 0 ? 'label' : 'caption'} tone={item.unreadCount > 0 ? 'primary' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>{item.lastMessageBody}</BinderText></View>
                  </View>
                </BinderCard>
              )}
            </Pressable>
          )}
        />
      )}
      {error && matches.length > 0 ? <BinderText variant="caption" tone="destructive" style={{ paddingBottom: theme.spacing.x3 }}>{error}</BinderText> : null}
    </View>
  );
}
