import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, RefreshControl, ScrollView, View } from 'react-native';

import Animated, { FadeInUp } from 'react-native-reanimated';

import { BinderButton, BinderCard, BinderIcon, BinderScreenHeader, BinderText, ChangingNumber, MotionPressable, ScreenState } from '../components/ui';
import { fetchMatches, type MatchSummary } from '../lib/conversation';
import { previewTimeLabel, splitConversationPreviews } from '../lib/conversationPresentation';
import { formatCount } from '../lib/format';
import { resolveStaggerDelay } from '../lib/motionPolicy';
import { enablePushNotifications, getNotificationPermissionStatus, openSystemNotificationSettings, refreshPushRegistration } from '../lib/notifications';
import { bannerOffersEnable, bannerStateAfterRegistration, initialBannerState, type PushBannerState } from '../lib/pushBanner';
import { classifyError, isAbortError, withRetry, type ReliabilityError } from '../lib/reliability';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

export default function MatchesScreen({ refreshKey, onOpenMatch, onOpenDiscovery, onSessionExpired }: { refreshKey: number; onOpenMatch: (match: MatchSummary) => void; onOpenDiscovery: () => void; onSessionExpired: () => void }) {
  const { theme, settings, updateNotifications, reduceMotion, locale, t } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ReliabilityError | null>(null);
  const [pushError, setPushError] = useState<ReliabilityError | null>(null);
  const [pushState, setPushState] = useState<PushBannerState>('idle');
  const mountedRef = useRef(true);
  const loadControllerRef = useRef<AbortController | null>(null);
  const actionControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadControllerRef.current?.abort();
      actionControllerRef.current?.abort();
    };
  }, []);

  const load = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    setError(null);
    try {
      const next = await withRetry((signal) => fetchMatches({ signal }), { attempts: 3, signal: controller.signal });
      if (mountedRef.current && !controller.signal.aborted) setMatches(next);
    } catch (nextError) {
      if (mountedRef.current && !isAbortError(nextError)) {
        const failure = classifyError(nextError);
        if (failure.kind === 'permission-denied') onSessionExpired();
        else setError(failure);
      }
    } finally {
      if (mountedRef.current && !controller.signal.aborted) setLoading(false);
    }
  }, [onSessionExpired]);

  useEffect(() => { void load(); }, [load, refreshKey]);
  const { newMatches, conversations } = splitConversationPreviews(matches);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (state: PushBannerState) => {
      if (mountedRef.current && !controller.signal.aborted) setPushState((current) => current === 'busy' ? current : state);
    };
    getNotificationPermissionStatus(controller.signal)
      .then(async (permission) => {
        const state = initialBannerState(settings.notifications.enabled, permission);
        settle(state);
        // A granted permission is not proof that anything can be delivered: the
        // registration behind it may never have reached the server, and this
        // banner would happily say "enabled" over a dead installation. Asking
        // again is idempotent and repairs that case on its own.
        if (state !== 'enabled') return;
        const result = await refreshPushRegistration(t, controller.signal);
        settle(bannerStateAfterRegistration(result.status));
      })
      .catch((nextError: unknown) => {
        // Leaving the banner on "enabled" after a thrown registration error is
        // the exact silence this is meant to end. A cancelled check is not a
        // failure — everything else has to show, and it has to show as
        // something with a retry on it: 'unavailable' is for the permanent
        // cases and offers no way back, while whatever threw here may well
        // work on the next tap.
        if (!isAbortError(nextError)) settle('failed');
      });
    return () => controller.abort();
  }, [settings.notifications.enabled]);

  async function enablePush() {
    if (pushState === 'busy') return;
    actionControllerRef.current?.abort();
    const controller = new AbortController();
    actionControllerRef.current = controller;
    setPushState('busy');
    setPushError(null);
    try {
      const result = await enablePushNotifications(t, controller.signal);
      if (!mountedRef.current || controller.signal.aborted) return;
      const next = bannerStateAfterRegistration(result.status);
      setPushState(next);
      if (next === 'enabled') await updateNotifications({ enabled: true });
      if (!mountedRef.current || controller.signal.aborted) return;
      await haptic(next === 'enabled' ? 'selection' : 'warning');
    } catch (nextError) {
      if (mountedRef.current && !isAbortError(nextError)) {
        // 'idle' would put "Enable" back on the button as if nothing had been
        // tried. The banner says what happened, the classified error says why,
        // and the button offers another go.
        setPushError(classifyError(nextError));
        setPushState('failed');
      }
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas, paddingHorizontal: theme.spacing.screen }}>
      <BinderScreenHeader title={t('matches.header.title')} eyebrow={t('matches.header.eyebrow')} style={{ marginHorizontal: -theme.spacing.screen, marginBottom: theme.spacing.x4 }} trailing={<BinderButton label={t('matches.actions.refresh')} icon="retry" variant="ghost" fullWidth={false} loading={loading} onPress={() => void load()} />} />

      <BinderCard style={{ marginBottom: theme.spacing.x3, padding: theme.spacing.x4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}>
          <View style={{ width: 40, height: 40, borderRadius: theme.radii.control, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}>
            <BinderIcon name="notifications" size={21} color={pushState === 'enabled' ? theme.accent.onSurface : theme.colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <BinderText variant="label">{pushState === 'enabled' ? t('matches.notifications.enabledTitle') : pushState === 'busy' ? t('matches.notifications.enablingTitle') : pushState === 'denied' ? t('matches.notifications.blockedTitle') : t('matches.notifications.title')}</BinderText>
            <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1 }}>
              {pushState === 'unavailable' ? t('matches.notifications.unavailableCopy')
                : pushState === 'failed' ? t('matches.notifications.failedCopy')
                : pushState === 'offline' ? t('matches.notifications.offlineCopy')
                : pushState === 'denied' ? t('matches.notifications.blockedCopy')
                : pushState === 'enabled' ? t('matches.notifications.enabledCopy')
                : t('matches.notifications.copy')}
            </BinderText>
            {pushError ? <BinderText accessibilityLiveRegion="assertive" variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x2 }}>{t(pushError.messageKey)}</BinderText> : null}
          </View>
          {bannerOffersEnable(pushState) ? <BinderButton label={pushState === 'offline' || pushState === 'failed' ? t('matches.actions.retry') : t('matches.actions.enable')} variant="secondary" fullWidth={false} loading={pushState === 'busy'} onPress={() => void enablePush()} /> : null}
          {pushState === 'denied' ? <BinderButton label={t('matches.actions.openSettings')} variant="secondary" fullWidth={false} onPress={() => void openSystemNotificationSettings().catch(() => undefined)} /> : null}
        </View>
      </BinderCard>

      {loading && matches.length === 0 ? <ScreenState kind="loading" loadingShape="matches" message={t('matches.states.loading')} /> : error && matches.length === 0 ? <ScreenState kind={error.kind === 'offline' ? 'offline' : 'error'} icon="retry" title={error.kind === 'offline' ? t('matches.states.offlineTitle') : t('matches.states.errorTitle')} message={error.kind === 'offline' ? t('matches.states.offlineMessage') : t(error.messageKey)} actionLabel={t('matches.actions.tryAgain')} onAction={() => void load()} /> : matches.length === 0 ? <ScreenState kind="empty" icon="matches" title={t('matches.empty.title')} message={t('matches.empty.message')} actionLabel={t('matches.actions.goToDiscovery')} onAction={onOpenDiscovery} /> : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.matchId}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} tintColor={theme.accent.onSurface} colors={[theme.accent.onSurface]} progressBackgroundColor={theme.colors.surfaceElevated} />}
          ListHeaderComponent={newMatches.length > 0 ? <View style={{ marginBottom: theme.spacing.x5 }}><BinderText variant="micro" tone="muted" style={{ marginBottom: theme.spacing.x3 }}>{t('matches.newMatches.heading')}</BinderText><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: theme.spacing.x3 }}>{newMatches.map((item, index) => <Animated.View key={item.matchId} entering={reduceMotion ? undefined : FadeInUp.delay(resolveStaggerDelay(index, false)).duration(theme.motion.deliberate)}><MotionPressable accessibilityRole="button" accessibilityLabel={t('matches.accessibility.startConversation', { name: item.firstName })} onPress={() => { void haptic('selection'); onOpenMatch(item); }} style={({ pressed }) => ({ width: theme.spacing.x16 + theme.spacing.x4, minHeight: theme.spacing.x16 + theme.spacing.x10, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.x2, borderRadius: theme.radii.card, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface })}>{item.photoUrl ? <Image source={{ uri: item.photoUrl }} resizeMethod="resize" style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }} /> : <View style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderText variant="title" tone="accent">{item.firstName.slice(0, 1).toUpperCase()}</BinderText></View>}<BinderText variant="label" numberOfLines={1} style={{ marginTop: theme.spacing.x2 }}>{item.firstName}</BinderText><BinderText variant="caption" tone="accent">{t('matches.newMatches.sayHello')}</BinderText></MotionPressable></Animated.View>)}</ScrollView></View> : null}
          ListEmptyComponent={<BinderText variant="body" tone="muted" style={{ paddingVertical: theme.spacing.x5 }}>{t('matches.empty.conversations')}</BinderText>}
          contentContainerStyle={{ paddingBottom: theme.spacing.x8, gap: theme.spacing.x2 }}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <Animated.View entering={reduceMotion ? undefined : FadeInUp.delay(resolveStaggerDelay(index, false)).duration(theme.motion.deliberate)}>
            <MotionPressable pressedSurface={false} accessibilityRole="button" accessibilityLabel={t('matches.accessibility.openConversation', { name: item.firstName })} onPress={() => { void haptic('selection'); onOpenMatch(item); }}>
              {({ pressed }) => (
                <BinderCard style={{ minHeight: theme.spacing.x16 + theme.spacing.x5, padding: theme.spacing.x3, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}>
                  {item.photoUrl ? <Image source={{ uri: item.photoUrl }} resizeMethod="resize" style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated }} /> : <View style={{ width: theme.spacing.x16, height: theme.spacing.x16, borderRadius: theme.radii.pill, backgroundColor: theme.colors.surfaceElevated, alignItems: 'center', justifyContent: 'center' }}><BinderText variant="title" tone="accent">{item.firstName.slice(0,1).toUpperCase()}</BinderText></View>}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
                      <BinderText variant="label" tone={item.unreadCount > 0 ? 'primary' : 'secondary'} numberOfLines={1} style={{ flex: 1 }}>{item.firstName}, {formatCount(item.age, locale)}</BinderText>
                      {item.lastMessageAt ? <BinderText variant="caption" tone={item.unreadCount > 0 ? 'secondary' : 'muted'}>{(() => { const label = previewTimeLabel(item.lastMessageAt, locale); return label === 'today' ? t('chat.day.today') : label === 'yesterday' ? t('chat.day.yesterday') : label; })()}</BinderText> : null}
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2, marginTop: theme.spacing.x2 }}>{item.unreadCount > 0 ? <View accessibilityLabel={t(item.unreadCount === 1 ? 'matches.accessibility.unreadOne' : 'matches.accessibility.unreadOther', { count: formatCount(item.unreadCount, locale) })} style={{ minWidth: theme.spacing.x5, height: theme.spacing.x5, paddingHorizontal: theme.spacing.x1, borderRadius: theme.radii.pill, backgroundColor: theme.accent.accent, alignItems: 'center', justifyContent: 'center' }}><ChangingNumber value={item.unreadCount} variant="caption" /></View> : null}<BinderText variant={item.unreadCount > 0 ? 'label' : 'caption'} tone={item.unreadCount > 0 ? 'primary' : 'muted'} numberOfLines={1} style={{ flex: 1 }}>{item.lastMessageBody}</BinderText></View>
                  </View>
                </BinderCard>
              )}
            </MotionPressable>
            </Animated.View>
          )}
        />
      )}
      {error && matches.length > 0 ? <View accessibilityLiveRegion="assertive" style={{ minHeight: theme.spacing.x12, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2, paddingBottom: theme.spacing.x3 }}><BinderText variant="caption" tone="destructive" style={{ flex: 1 }}>{t(error.messageKey)}</BinderText><BinderButton label={error.recovery === 'refresh' ? t('matches.actions.refresh') : t('matches.actions.retry')} variant="ghost" fullWidth={false} onPress={() => void load()} /></View> : null}
    </View>
  );
}
