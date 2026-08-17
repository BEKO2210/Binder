import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Clipboard, FlatList, Platform, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeInUp, FadeOutDown, useAnimatedStyle } from 'react-native-reanimated';

import { buildChatTimeline, timeLabel, type TimelineItem } from '../lib/chatTimeline';
import { composerBody } from '../lib/conversationPresentation';
import { resolveStaggerDelay } from '../lib/motionPolicy';
import { classifyError, isAbortError, withRetry, type ReliabilityError } from '../lib/reliability';

import { BinderButton, BinderCard, BinderChip, BinderIcon, BinderIconButton, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import { MotionPressable as Pressable } from '../components/ui';
import {
  blockUser,
  createClientMessageId,
  fetchMessagesPage,
  markMatchRead,
  reportUser,
  sendMessage,
  subscribeToMessages,
  unmatch,
  type MatchSummary,
  type Message,
  type ReportReason,
} from '../lib/conversation';
import PartnerProfileScreen from './PartnerProfileScreen';
import { useBinderHaptics } from '../theme/haptics';
import { useBinderTheme } from '../theme/ThemeProvider';

const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'harassment', label: 'Harassment' },
  { value: 'spam', label: 'Spam' },
  { value: 'fake', label: 'Fake profile' },
  { value: 'underage', label: 'Under 18' },
  { value: 'sexual_content', label: 'Sexual content' },
  { value: 'violence', label: 'Violence' },
  { value: 'other', label: 'Other' },
];

type LocalAttempt = { clientId: string; body: string; status: 'sending' | 'failed'; error?: ReliabilityError };
type SafetyMode = 'menu' | 'report';

export default function ChatScreen({ match, currentUserId, onClose, onConversationEnded }: {
  match: MatchSummary;
  currentUserId: string;
  onClose: () => void;
  onConversationEnded: () => void;
}) {
  const { theme, reduceMotion } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState<ReliabilityError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [composer, setComposer] = useState('');
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardShift = useAnimatedStyle(() => ({ transform: [{ translateY: keyboard.height.value }] }));
  const [sending, setSending] = useState(false);
  // Every unsent message keeps its own entry. A single slot meant that writing
  // a new message after a failure silently discarded the failed one — the text
  // the user had typed, and the only way to retry it, both disappeared.
  const [attempts, setAttempts] = useState<LocalAttempt[]>([]);
  const [safetyBusy, setSafetyBusy] = useState<null | 'unmatch' | 'block'>(null);
  const [showNewMessage, setShowNewMessage] = useState(false);
  const listRef = useRef<FlatList<TimelineItem<Message>>>(null);
  const nearNewestRef = useRef(true);
  const [showSafety, setShowSafety] = useState(false);
  const [safetyMode, setSafetyMode] = useState<SafetyMode>('menu');
  const [reportReason, setReportReason] = useState<ReportReason>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [safetyError, setSafetyError] = useState<ReliabilityError | null>(null);
  const [showPartnerProfile, setShowPartnerProfile] = useState(false);
  const mountedRef = useRef(true);
  const lifecycleControllerRef = useRef(new AbortController());

  useEffect(() => {
    mountedRef.current = true;
    if (lifecycleControllerRef.current.signal.aborted) lifecycleControllerRef.current = new AbortController();
    return () => {
      mountedRef.current = false;
      lifecycleControllerRef.current.abort();
    };
  }, []);

  function mergeMessages(next: Message[]) {
    setMessages((current) => {
      const byId = new Map(current.map((message) => [message.id, message]));
      for (const message of next) byId.set(message.id, message);
      return [...byId.values()].sort((a, b) => {
        const time = a.created_at.localeCompare(b.created_at);
        return time === 0 ? a.id.localeCompare(b.id) : time;
      });
    });
  }

  function mergeMessage(next: Message) { mergeMessages([next]); }

  useEffect(() => {
    let active = true;
    const requestController = new AbortController();
    let unsubscribe: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let appIsActive = AppState.currentState === 'active';

    async function load(initial: boolean) {
      if (initial) setLoading(true);
      setLoadError(null);
      try {
        const page = await withRetry((signal) => fetchMessagesPage(match.matchId, undefined, 50, { signal }), { attempts: 3, signal: requestController.signal });
        if (!active) return;
        mergeMessages(page.messages);
        setHasMore(page.hasMore);
        setLoadError(null);
        void markMatchRead(match.matchId, { signal: requestController.signal }).catch(() => undefined);
      } catch (nextError) {
        if (active && !isAbortError(nextError)) setLoadError(classifyError(nextError));
      } finally {
        if (active && initial) setLoading(false);
      }
    }

    function connect() {
      if (!active || !appIsActive) return;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      unsubscribe?.();
      unsubscribe = subscribeToMessages(
        match.matchId,
        (message) => {
          if (!active) return;
          retryAttempt = 0;
          setLoadError(null);
          mergeMessage(message);
          if (nearNewestRef.current) listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
          else if (message.sender_id !== currentUserId) setShowNewMessage(true);
          if (message.sender_id !== currentUserId) void markMatchRead(match.matchId, { signal: requestController.signal }).catch(() => undefined);
        },
        (message) => {
          if (!active) return;
          setLoadError(classifyError(message));
          unsubscribe?.();
          if (retryAttempt >= 5) return;
          const delay = Math.min(15_000,1_000 * 2 ** retryAttempt);
          retryAttempt += 1;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            // Subscribe first, backfill second. The other order leaves a gap:
            // a message inserted after the backfill query and before the new
            // channel is live belongs to neither and stays missing.
            connect();
            void load(false);
          },delay);
        },
      );
    }

    connect();
    void load(true);
    const appState = AppState.addEventListener('change',(state) => {
      if (!active) return;
      appIsActive = state === 'active';
      if (state === 'active') {
        retryAttempt = 0;
        if (retryTimer) clearTimeout(retryTimer);
        connect();
        void load(false);
      } else {
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        unsubscribe?.();
        unsubscribe = null;
      }
    });
    return () => {
      active = false;
      requestController.abort();
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe?.();
      appState.remove();
    };
  }, [currentUserId, match.matchId, reduceMotion, reloadKey]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    setLoadError(null);
    try {
      const page = await withRetry((signal) => fetchMessagesPage(match.matchId, oldest, 50, { signal }), { attempts: 3, signal: lifecycleControllerRef.current.signal });
      if (!mountedRef.current) return;
      mergeMessages(page.messages);
      setHasMore(page.hasMore);
      setLoadError(null);
    } catch (error) {
      if (mountedRef.current && !isAbortError(error)) setLoadError(classifyError(error));
    } finally {
      if (mountedRef.current) setLoadingOlder(false);
    }
  }

  const validComposer = composerBody(composer);
  const canSend = validComposer !== null && !sending;
  const reportingMessage = useMemo(() => messages.find((message) => message.id === reportMessageId) ?? null, [messages, reportMessageId]);
  // The list renders inverted so the newest message is always pinned to the
  // bottom edge, directly above the composer — also while the keyboard is up.
  // The timeline adds bubble grouping, timestamps and day separators.
  const timeline = useMemo(() => [...buildChatTimeline(messages)].reverse(), [messages]);

  useEffect(() => {
    if (!showPartnerProfile && !showSafety) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showPartnerProfile) setShowPartnerProfile(false);
      else closeSafety();
      return true;
    });
    return () => subscription.remove();
  }, [showPartnerProfile, showSafety]);

  function discardAttempt(clientId: string) {
    setAttempts((current) => current.filter((attempt) => attempt.clientId !== clientId));
  }

  async function submitMessage(retryClientId?: string) {
    const retried = retryClientId ? attempts.find((attempt) => attempt.clientId === retryClientId) : null;
    const body = retried ? retried.body : validComposer;
    if (!body || sending) return;
    const clientId = retried ? retried.clientId : createClientMessageId();
    setSending(true);
    setAttempts((current) => {
      const without = current.filter((attempt) => attempt.clientId !== clientId);
      return [...without, { clientId, body, status: 'sending' as const }];
    });
    if (!retried) setComposer('');
    try {
      const confirmed = await sendMessage(match.matchId, clientId, body, { signal: lifecycleControllerRef.current.signal });
      if (!mountedRef.current) return;
      mergeMessage(confirmed);
      discardAttempt(clientId);
      listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
      await haptic('selection');
    } catch (nextError) {
      if (mountedRef.current && !isAbortError(nextError)) {
        const failure = classifyError(nextError);
        setAttempts((current) => current.map((attempt) => attempt.clientId === clientId ? { ...attempt, status: 'failed' as const, error: failure } : attempt));
      }
    } finally { if (mountedRef.current) setSending(false); }
  }

  function openMessageActions(message: Message) {
    const actions = [
      { text: 'Copy', onPress: () => Clipboard.setString(message.body) },
      ...(message.sender_id === currentUserId ? [] : [{ text: 'Report', style: 'destructive' as const, onPress: () => openReport(message.id) }]),
      { text: 'Cancel', style: 'cancel' as const },
    ];
    Alert.alert('Message actions', undefined, actions);
  }

  function trackScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nearNewest = event.nativeEvent.contentOffset.y <= theme.spacing.x8;
    nearNewestRef.current = nearNewest;
    if (nearNewest) setShowNewMessage(false);
  }

  function confirmUnmatch() {
    if (safetyBusy) return;
    Alert.alert(`Unmatch ${match.firstName}?`, 'The conversation closes for both of you immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unmatch', style: 'destructive', onPress: () => { if (safetyBusy) return; setSafetyError(null); setSafetyBusy('unmatch'); void unmatch(match.matchId, { signal: lifecycleControllerRef.current.signal }).then(async () => { if (!mountedRef.current) return; await haptic('destructive'); onConversationEnded(); }).catch((error: unknown) => { if (mountedRef.current && !isAbortError(error)) setSafetyError(classifyError(error)); }).finally(() => { if (mountedRef.current) setSafetyBusy(null); }); } },
    ]);
  }

  function confirmBlock() {
    if (safetyBusy) return;
    Alert.alert(`Block ${match.firstName}?`, 'You will disappear from each other and the conversation closes immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => { if (safetyBusy) return; setSafetyError(null); setSafetyBusy('block'); void blockUser(match.otherUserId, { signal: lifecycleControllerRef.current.signal }).then(async () => { if (!mountedRef.current) return; await haptic('destructive'); onConversationEnded(); }).catch((error: unknown) => { if (mountedRef.current && !isAbortError(error)) setSafetyError(classifyError(error)); }).finally(() => { if (mountedRef.current) setSafetyBusy(null); }); } },
    ]);
  }

  async function submitReport() {
    if (reporting) return;
    setReporting(true);
    setSafetyError(null);
    try {
      await reportUser({ reportedUserId: match.otherUserId, reason: reportReason, details: reportDetails, matchId: match.matchId, messageId: reportMessageId ?? undefined, block: true, signal: lifecycleControllerRef.current.signal });
      if (!mountedRef.current) return;
      await haptic('destructive');
      onConversationEnded();
    } catch (nextError) {
      if (mountedRef.current && !isAbortError(nextError)) setSafetyError(classifyError(nextError));
    } finally { if (mountedRef.current) setReporting(false); }
  }

  function openReport(messageId?: string) {
    setReportMessageId(messageId ?? null);
    setReportReason('harassment');
    setReportDetails('');
    setSafetyMode('report');
    setShowSafety(true);
    setSafetyError(null);
  }

  function closeSafety() {
    setShowSafety(false);
    setSafetyMode('menu');
    setReportMessageId(null);
    setReportDetails('');
    setSafetyError(null);
  }

  if (showPartnerProfile) {
    return <Animated.View entering={reduceMotion ? undefined : FadeInUp.duration(theme.motion.entrance)} exiting={reduceMotion ? undefined : FadeOutDown.duration(theme.motion.deliberate)} style={{ flex: 1 }}><PartnerProfileScreen userId={match.otherUserId} fallbackName={match.firstName} onClose={() => setShowPartnerProfile(false)} /></Animated.View>;
  }

  return (
    // Edge-to-edge Android stopped resizing the window for the keyboard, so a
    // padding-based avoider had nothing to push against and the composer stayed
    // underneath it. The screen is driven directly by the keyboard's own
    // animation instead, on the UI thread, which also keeps the movement in sync
    // with the system's easing rather than approximating it.
    <Animated.View style={[{ flex: 1, backgroundColor: theme.colors.canvas }, keyboardShift]}>
      <BinderScreenHeader title={`${match.firstName}, ${match.age}`} eyebrow="VIEW PROFILE" centered leading={{ icon: 'back', accessibilityLabel: 'Back to matches', onPress: onClose }} onTitlePress={() => setShowPartnerProfile(true)} titleAccessibilityLabel={`Open ${match.firstName}'s profile`} trailing={<BinderIconButton name="more" accessibilityLabel="Conversation safety controls" selected={showSafety} onPress={() => { if (showSafety) closeSafety(); else { setSafetyMode('menu'); setShowSafety(true); } }} />} />

      {showSafety ? (
        <BinderCard style={{ margin: theme.spacing.x3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name="safety" color={theme.semantic.destructive} /><BinderText variant="title" style={{ flex: 1 }}>{safetyMode === 'report' ? reportMessageId ? 'Report this message' : `Report ${match.firstName}` : 'Safety controls'}</BinderText><BinderIconButton name="close" size={19} accessibilityLabel="Close safety controls" onPress={closeSafety} /></View>
          {safetyMode === 'report' ? (
            <View style={{ marginTop: theme.spacing.x4 }}>
              {reportingMessage ? <BinderCard style={{ backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.x3 }}><BinderText variant="caption" tone="secondary" numberOfLines={4}>{reportingMessage.body}</BinderText></BinderCard> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x3 }}>{REPORT_REASONS.map((reason) => <BinderChip key={reason.value} label={reason.label} selected={reportReason === reason.value} onPress={() => setReportReason(reason.value)} />)}</View>
              <TextInput accessibilityLabel="Report details" value={reportDetails} onChangeText={setReportDetails} maxLength={1000} multiline placeholder="Optional details for the safety team" placeholderTextColor={theme.colors.textMuted} selectionColor={theme.accent.accent} style={{ minHeight: theme.spacing.x16 + theme.spacing.x6, maxHeight: theme.spacing.x16 * 2 + theme.spacing.x6, marginTop: theme.spacing.x3, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.control, padding: theme.spacing.x3, textAlignVertical: 'top' }} />
              <BinderButton label="Report & block" icon="report" variant="destructive" loading={reporting} onPress={() => void submitReport()} style={{ marginTop: theme.spacing.x3 }} />
              <BinderButton label="Back to safety controls" variant="ghost" disabled={reporting} onPress={() => { setSafetyMode('menu'); setReportMessageId(null); setReportDetails(''); }} style={{ marginTop: theme.spacing.x2 }} />
            </View>
          ) : (
            <View style={{ gap: theme.spacing.x2, marginTop: theme.spacing.x4 }}>
              <BinderButton label="Unmatch" icon="close" variant="secondary" onPress={confirmUnmatch} />
              <BinderButton label="Block" icon="block" variant="destructive" onPress={confirmBlock} />
              <BinderButton label="Report & block" icon="report" variant="destructive" onPress={() => openReport()} />
            </View>
          )}
          {safetyError ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x3 }}>{safetyError.message}</BinderText> : null}
        </BinderCard>
      ) : null}

      {loading ? <ScreenState kind="loading" loadingShape="conversation" message="Opening conversation…" /> : loadError && messages.length === 0 ? <ScreenState kind={loadError.kind === 'offline' ? 'offline' : loadError.kind === 'permission-denied' ? 'permission' : 'error'} icon="retry" title={loadError.kind === 'offline' ? 'You are offline' : 'Conversation did not load'} message={loadError.message} actionLabel={loadError.recovery === 'refresh' ? 'Refresh' : 'Try again'} onAction={() => setReloadKey((value) => value + 1)} /> : messages.length === 0 ? <ScreenState kind="empty" icon="matches" title="You matched." message="Normal chat opens only after mutual interest. Say something real." /> : (
        <FlatList
          ref={listRef}
          data={timeline}
          inverted
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.x4 }}
          showsVerticalScrollIndicator={false}
          onScroll={trackScroll}
          scrollEventThrottle={theme.motion.feedback}
          ListFooterComponent={hasMore ? <BinderButton label="Load earlier messages" variant="ghost" loading={loadingOlder} onPress={() => void loadOlder()} style={{ marginBottom: theme.spacing.x3 }} /> : null}
          renderItem={({ item, index }) => {
            if (item.type === 'day') {
              return (
                <View style={{ alignItems: 'center', marginTop: theme.spacing.x5, marginBottom: theme.spacing.x2 }}>
                  <View style={{ backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x1 }}>
                    <BinderText variant="caption" tone="muted">{item.label}</BinderText>
                  </View>
                </View>
              );
            }
            const message = item.message;
            const mine = message.sender_id === currentUserId;
            const bubbleRadius = theme.radii.control;
            return (
              <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(resolveStaggerDelay(index, false)).duration(theme.motion.feedback)} style={{ marginTop: item.groupedWithPrevious ? theme.spacing.x1 : theme.spacing.x3 }}>
                <Pressable
                  onLongPress={() => openMessageActions(message)}
                  accessibilityHint={mine ? 'Hold to copy this message' : 'Hold to copy or report this message'}
                  // The wrapper has no radius, so the shared pressed surface painted a
                  // square block behind the rounded bubble. The bubble carries its own
                  // feedback instead.
                  pressedSurface={false}
                  style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: theme.layout.chatBubbleMaxWidth }}
                >
                  <View style={{
                    paddingHorizontal: theme.spacing.x4,
                    paddingVertical: theme.spacing.x3,
                    borderRadius: bubbleRadius,
                    borderBottomRightRadius: mine && item.endsGroup ? theme.radii.small : bubbleRadius,
                    borderBottomLeftRadius: !mine && item.endsGroup ? theme.radii.small : bubbleRadius,
                    backgroundColor: mine ? theme.accent.accent : theme.colors.surfaceElevated,
                    borderWidth: mine ? 0 : 1,
                    borderColor: theme.colors.borderSubtle,
                  }}>
                    <BinderText variant="body" style={{ color: mine ? theme.accent.foreground : theme.colors.textPrimary }}>{message.body}</BinderText>
                  </View>
                  {item.showsTimestamp ? (
                    <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1, alignSelf: mine ? 'flex-end' : 'flex-start', marginHorizontal: theme.spacing.x2 }}>
                      {timeLabel(message.created_at)}{mine ? ' · Sent' : ''}
                    </BinderText>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}

      {showNewMessage ? <Pressable accessibilityRole="button" accessibilityLabel="Scroll to new message" onPress={() => { listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion }); setShowNewMessage(false); }} style={({ pressed }) => ({ minHeight: theme.spacing.x12, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.x4, borderRadius: theme.radii.pill, backgroundColor: pressed ? theme.accent.pressed : theme.accent.accent })}><BinderText variant="label" style={{ color: theme.accent.foreground }}>New message</BinderText></Pressable> : null}

      {attempts.map((attempt) => (
        <View key={attempt.clientId} style={{ alignItems: 'flex-end', paddingHorizontal: theme.spacing.x4, paddingTop: theme.spacing.x2 }}>
          <View style={{ maxWidth: '82%', paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x3, borderRadius: theme.radii.control, borderBottomRightRadius: theme.radii.small, backgroundColor: attempt.status === 'failed' ? theme.colors.surfaceElevated : theme.accent.accent, borderWidth: attempt.status === 'failed' ? 1 : 0, borderColor: theme.semantic.destructive }}>
            <BinderText variant="body" style={{ color: attempt.status === 'failed' ? theme.colors.textPrimary : theme.accent.foreground }}>{attempt.body}</BinderText>
          </View>
          <View style={{ minHeight: theme.spacing.x12, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
            {attempt.status === 'sending' ? <BinderText variant="caption" tone="muted">Sending…</BinderText> : (
              <>
                <BinderText variant="caption" tone="destructive" style={{ flexShrink: 1 }}>{attempt.error?.message ?? 'Message not sent.'}</BinderText>
                <Pressable accessibilityRole="button" accessibilityLabel={`Retry sending "${attempt.body.slice(0, 24)}"`} disabled={sending} onPress={() => void submitMessage(attempt.clientId)} style={({ pressed }) => ({ minHeight: theme.spacing.x12, justifyContent: 'center', paddingHorizontal: theme.spacing.x3, borderRadius: theme.radii.pill, opacity: sending ? theme.feedback.disabledOpacity : 1, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated })}><BinderText variant="label" tone="accent">Retry</BinderText></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={`Discard unsent message "${attempt.body.slice(0, 24)}"`} onPress={() => discardAttempt(attempt.clientId)} style={({ pressed }) => ({ minHeight: theme.spacing.x12, justifyContent: 'center', paddingHorizontal: theme.spacing.x3, borderRadius: theme.radii.pill, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.transparent })}><BinderText variant="label" tone="muted">Discard</BinderText></Pressable>
              </>
            )}
          </View>
        </View>
      ))}

      {loadError && messages.length > 0 ? <View style={{ minHeight: theme.spacing.x12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.x4 }}><BinderText variant="caption" tone="destructive" style={{ flex: 1 }}>{loadError.message}</BinderText><BinderButton label="Retry" variant="ghost" fullWidth={false} onPress={() => setReloadKey((value) => value + 1)} /></View> : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.x2, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x3, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}>
        <TextInput accessibilityLabel={`Message ${match.firstName}`} value={composer} onChangeText={setComposer} maxLength={2000} multiline scrollEnabled placeholder={`Message ${match.firstName}`} placeholderTextColor={theme.colors.textMuted} selectionColor={theme.accent.accent} style={{ flex: 1, minHeight: theme.spacing.x12, maxHeight: theme.spacing.x16 * 2, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.control, paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x3, textAlignVertical: 'center' }} />
        <BinderIconButton name={sending ? 'more' : 'send'} accessibilityLabel={sending ? 'Sending message' : `Send message to ${match.firstName}`} selected={canSend || sending} disabled={!canSend} onPress={() => void submitMessage()} />
      </View>
    </Animated.View>
  );
}
