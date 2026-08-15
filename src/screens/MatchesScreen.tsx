import { useCallback, useEffect, useState } from 'react';
import { FlatList, Image, Pressable, View } from 'react-native';

import { BinderButton, BinderCard, BinderIcon, BinderText, ScreenState, SectionHeader } from '../components/ui';
import { fetchMatches, type MatchSummary } from '../lib/conversation';
import { enablePushNotifications } from '../lib/notifications';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

export default function MatchesScreen({ refreshKey, onOpenMatch }: { refreshKey: number; onOpenMatch: (match: MatchSummary) => void }) {
  const { theme } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pushState, setPushState] = useState<'idle' | 'busy' | 'enabled' | 'unavailable'>('idle');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try { setMatches(await fetchMatches()); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Could not load matches.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load, refreshKey]);

  async function enablePush() {
    if (pushState === 'busy') return;
    setPushState('busy');
    setError('');
    try {
      const result = await enablePushNotifications();
      setPushState(result.status === 'registered' ? 'enabled' : 'unavailable');
      await haptic(result.status === 'registered' ? 'selection' : 'warning');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not enable notifications.');
      setPushState('idle');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingHorizontal: theme.spacing.screen }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x4 }}>
        <SectionHeader eyebrow="CONVERSATIONS" title="Your Binds" />
        <BinderButton label="Refresh" icon="retry" variant="ghost" fullWidth={false} onPress={() => void load()} />
      </View>

      <BinderCard style={{ marginBottom: theme.spacing.x3, padding: theme.spacing.x4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
          <View style={{ width: 40, height: 40, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
            <BinderIcon name="notifications" size={21} color={pushState === 'enabled' ? theme.accent.accent : theme.colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <BinderText variant="label">{pushState === 'enabled' ? 'Message alerts enabled' : pushState === 'busy' ? 'Enabling alerts…' : 'Message alerts'}</BinderText>
            <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>
              {pushState === 'unavailable' ? 'Remote push is not configured on this build yet. Chat still works normally.' : pushState === 'enabled' ? 'Notification categories can be adjusted in App Settings.' : 'Opt in to alerts for new matches and messages.'}
            </BinderText>
          </View>
          {pushState !== 'enabled' && pushState !== 'unavailable' ? <BinderButton label="Enable" variant="secondary" fullWidth={false} loading={pushState === 'busy'} onPress={() => void enablePush()} /> : null}
        </View>
      </BinderCard>

      {loading ? <ScreenState kind="loading" message="Loading your matches…" /> : error && matches.length === 0 ? <ScreenState kind="error" icon="retry" title="Matches did not load" message={error} actionLabel="Try again" onAction={() => void load()} /> : matches.length === 0 ? <ScreenState kind="empty" icon="matches" title="No Binds yet." message="Mutual Binds appear here. No one can message you before both people choose each other." /> : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.matchId}
          contentContainerStyle={{ paddingBottom: theme.spacing.x8, gap: theme.spacing.x2 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityLabel={`Open conversation with ${item.firstName}`} onPress={() => { void haptic('selection'); onOpenMatch(item); }}>
              {({ pressed }) => (
                <BinderCard style={{ minHeight: 84, padding: theme.spacing.x3, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}>
                  {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={{ width: 62, height: 62, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated }} /> : <View style={{ width: 62, height: 62, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderText variant="title" tone="accent">{item.firstName.slice(0,1).toUpperCase()}</BinderText></View>}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
                      <BinderText variant="label" numberOfLines={1} style={{ flex: 1 }}>{item.firstName}, {item.age}</BinderText>
                      {item.unreadCount > 0 ? <View style={{ minWidth: 24, height: 24, paddingHorizontal: theme.spacing.x2, borderRadius: theme.radii.pill, backgroundColor: theme.accent.accent, alignItems: 'center', justifyContent: 'center' }}><BinderText variant="caption" style={{ color: theme.accent.foreground }}>{Math.min(item.unreadCount,99)}</BinderText></View> : null}
                    </View>
                    <BinderText variant="caption" tone={item.unreadCount > 0 ? 'secondary' : 'muted'} numberOfLines={1} style={{ marginTop: theme.spacing.x2 }}>{item.lastMessageBody ?? "It's a Bind — say hi."}</BinderText>
                  </View>
                  <BinderIcon name="chevronRight" size={22} color={theme.colors.textMuted} />
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
