import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, AppState, BackHandler, Clipboard, FlatList, Platform, RefreshControl, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, { FadeInDown, FadeInUp, FadeOutDown, useAnimatedStyle } from 'react-native-reanimated';

import { buildChatTimeline, type TimelineItem } from '../lib/chatTimeline';
import { forgetChat, recallAttempts, recallDraft, rememberAttempts, rememberDraft } from '../lib/chatDrafts';
import { VoiceMessageBubble } from '../components/VoiceMessageBubble';
import { VoiceRecorderBar } from '../components/VoiceRecorderBar';
import { formatCount, formatTime } from '../lib/format';
import { formatVoiceDuration } from '../lib/voiceMessage';
import { announce } from '../lib/announce';
import { confirmDestructive } from '../lib/confirmDestructive';
import { composerBody, conversationErrorSurface, shouldShowConnectionNotice } from '../lib/conversationPresentation';
import { resolveStaggerDelay } from '../lib/motionPolicy';
import { classifyRequestFailure, isAbortError, isConversationEndedError, withRetry, type ReliabilityError } from '../lib/reliability';

import { BinderButton, BinderCard, BinderChip, BinderIcon, BinderIconButton, BinderScreenHeader, BinderText, ScreenState } from '../components/ui';
import { MotionPressable as Pressable } from '../components/ui';
import {
  sendVoiceMessage,
  uploadVoiceRecording,
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

const REPORT_REASONS: { value: ReportReason; labelKey: string }[] = [
  { value: 'harassment', labelKey: 'chat.safety.reasons.harassment' },
  { value: 'spam', labelKey: 'chat.safety.reasons.spam' },
  { value: 'fake', labelKey: 'chat.safety.reasons.fake' },
  { value: 'underage', labelKey: 'chat.safety.reasons.underage' },
  { value: 'sexual_content', labelKey: 'chat.safety.reasons.sexualContent' },
  { value: 'violence', labelKey: 'chat.safety.reasons.violence' },
  { value: 'other', labelKey: 'chat.safety.reasons.other' },
];

type LocalAttempt = { clientId: string; body: string; localUri?: string; voice?: { audioPath: string; durationMs: number }; status: 'sending' | 'failed'; error?: ReliabilityError };
type SafetyMode = 'menu' | 'report';

type MessageRowProps = {
  type: TimelineItem<Message>['type'];
  label?: string;
  messageId?: string;
  body?: string;
  voice?: { audioPath: string; durationMs: number } | null;
  createdAt?: string;
  mine?: boolean;
  groupedWithPrevious?: boolean;
  endsGroup?: boolean;
  showsTimestamp?: boolean;
  index: number;
  onOpenActions: (messageId: string, body: string, mine: boolean, longPress: boolean, isVoice?: boolean) => void;
};

const ChatMessageRow = memo(function ChatMessageRow({ type, label, messageId, body, voice, createdAt, mine = false, groupedWithPrevious = false, endsGroup = false, showsTimestamp = false, index, onOpenActions }: MessageRowProps) {
  const { theme, reduceMotion, locale, t } = useBinderTheme();
  if (type === 'day') {
    return (
      <View style={{ alignItems: 'center', marginTop: theme.spacing.x5, marginBottom: theme.spacing.x2 }}>
        <View style={{ backgroundColor: theme.colors.surfaceElevated, borderRadius: theme.radii.pill, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x1 }}>
          <BinderText variant="caption" tone="muted">{label === 'today' ? t('chat.day.today') : label === 'yesterday' ? t('chat.day.yesterday') : label}</BinderText>
        </View>
      </View>
    );
  }
  if (!messageId || body === undefined || !createdAt) return null;
  const bubbleRadius = theme.radii.control;
  return (
    <Animated.View entering={reduceMotion ? undefined : FadeInDown.delay(resolveStaggerDelay(index, false)).duration(theme.motion.feedback)} style={{ marginTop: groupedWithPrevious ? theme.spacing.x1 : theme.spacing.x3 }}>
      <Pressable
        // A plain tap does nothing on purpose: the hint promises "hold", and a
        // menu that also appears on tap fires while somebody is scrolling or
        // reaching for the play button inside a voice bubble.
        onLongPress={() => onOpenActions(messageId, body, mine, true, Boolean(voice))}
        accessibilityHint={mine ? t('chat.accessibility.holdToCopy') : t('chat.accessibility.holdToCopyOrReport')}
        pressedSurface={false}
        style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: theme.layout.chatBubbleMaxWidth }}
      >
        <View style={{
          paddingHorizontal: theme.spacing.x4,
          paddingVertical: theme.spacing.x3,
          borderRadius: bubbleRadius,
          borderBottomRightRadius: mine && endsGroup ? theme.radii.small : bubbleRadius,
          borderBottomLeftRadius: !mine && endsGroup ? theme.radii.small : bubbleRadius,
          backgroundColor: mine ? theme.accent.accent : theme.colors.surfaceElevated,
          borderWidth: mine ? 0 : 1,
          borderColor: theme.colors.borderSubtle,
        }}>
          {voice
            ? <VoiceMessageBubble messageId={messageId} audioPath={voice.audioPath} durationMs={voice.durationMs} mine={mine} />
            : <BinderText variant="body" style={{ color: mine ? theme.accent.foreground : theme.colors.textPrimary }}>{body}</BinderText>}
        </View>
        {showsTimestamp ? (
          <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1, alignSelf: mine ? 'flex-end' : 'flex-start', marginHorizontal: theme.spacing.x2 }}>
            {mine ? t('chat.message.sentAt', { time: formatTime(new Date(createdAt), locale) }) : formatTime(new Date(createdAt), locale)}
          </BinderText>
        ) : null}
      </Pressable>
    </Animated.View>
  );
});

const chatTimelineKey = (item: TimelineItem<Message>) => item.id;

export default function ChatScreen({ match, currentUserId, onClose, onConversationEnded, onSessionExpired }: {
  match: MatchSummary;
  currentUserId: string;
  onClose: () => void;
  onConversationEnded: () => void;
  onSessionExpired: () => void;
}) {
  const { theme, reduceMotion, locale, t } = useBinderTheme();
  const haptic = useBinderHaptics();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState<ReliabilityError | null>(null);
  // A channel that dropped is not a conversation that failed to load: the
  // messages are on screen and the chat stays usable while it reconnects.
  const [streamError, setStreamError] = useState<ReliabilityError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [composer, setComposer] = useState(() => recallDraft(match.matchId));
  const keyboard = useReanimatedKeyboardAnimation();
  const keyboardShift = useAnimatedStyle(() => ({ transform: [{ translateY: keyboard.height.value }] }));
  const [sending, setSending] = useState(false);
  // Every unsent message keeps its own entry. A single slot meant that writing
  // a new message after a failure silently discarded the failed one — the text
  // the user had typed, and the only way to retry it, both disappeared.
  const [attempts, setAttempts] = useState<LocalAttempt[]>(() => recallAttempts(match.matchId).map((attempt) => ({ ...attempt, status: 'failed' as const })));
  const [recordingVoice, setRecordingVoice] = useState(false);
  const composerRef = useRef(composer);
  const attemptsRef = useRef(attempts);
  composerRef.current = composer;
  attemptsRef.current = attempts;
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
  const [conversationEnded, setConversationEnded] = useState(false);
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
        setStreamError(null);
        void markMatchRead(match.matchId, { signal: requestController.signal }).catch(() => undefined);
      } catch (nextError) {
        if (active && !isAbortError(nextError)) {
          const failure = classifyRequestFailure(nextError);
          if (failure.kind === 'permission-denied') onSessionExpired();
          else setLoadError(failure);
        }
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
          setStreamError(null);
          mergeMessage(message);
          if (nearNewestRef.current) listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
          else if (message.sender_id !== currentUserId) setShowNewMessage(true);
          if (message.sender_id !== currentUserId) void markMatchRead(match.matchId, { signal: requestController.signal }).catch(() => undefined);
        },
        (message) => {
          if (!active) return;
          setStreamError(classifyRequestFailure(message));
          unsubscribe?.();
          // No hard stop. Giving up after five tries left the chat showing a
          // permanent failure with a live composer under it, and nothing but
          // leaving the screen could bring it back.
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
        () => {
          if (active) setConversationEnded(true);
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
  }, [currentUserId, match.matchId, onSessionExpired, reduceMotion, reloadKey]);

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
      if (mountedRef.current && !isAbortError(error)) setLoadError(classifyRequestFailure(error));
    } finally {
      if (mountedRef.current) setLoadingOlder(false);
    }
  }

  async function refreshMessages() {
    if (refreshing) return;
    setRefreshing(true);
    setLoadError(null);
    try {
      const page = await withRetry((signal) => fetchMessagesPage(match.matchId, undefined, 50, { signal }), { attempts: 3, signal: lifecycleControllerRef.current.signal });
      if (!mountedRef.current) return;
      mergeMessages(page.messages);
      setHasMore(page.hasMore);
      void markMatchRead(match.matchId, { signal: lifecycleControllerRef.current.signal }).catch(() => undefined);
    } catch (error) {
      if (mountedRef.current && !isAbortError(error)) {
        const failure = classifyRequestFailure(error);
        if (failure.kind === 'permission-denied') onSessionExpired();
        else setLoadError(failure);
      }
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }

  const validComposer = composerBody(composer);
  const failedAttemptKinds = attempts.filter((attempt) => attempt.status === 'failed').map((attempt) => attempt.error?.kind ?? 'unknown');
  const errorSurface = conversationErrorSurface({ hasMessages: messages.length > 0, loadFailed: Boolean(loadError), streamFailed: Boolean(streamError) });
  const connectionError = streamError ?? loadError;
  const connectionNoticeVisible = errorSurface === 'notice' && shouldShowConnectionNotice(connectionError?.kind ?? null, failedAttemptKinds);
  const canSend = validComposer !== null && !sending;
  const reportingMessage = useMemo(() => messages.find((message) => message.id === reportMessageId) ?? null, [messages, reportMessageId]);
  // The list renders inverted so the newest message is always pinned to the
  // bottom edge, directly above the composer — also while the keyboard is up.
  // The timeline adds bubble grouping, timestamps and day separators.
  const timeline = useMemo(() => [...buildChatTimeline(messages, new Date(), locale)].reverse(), [locale, messages]);

  useEffect(() => {
    if (!showPartnerProfile && !showSafety) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (showPartnerProfile) setShowPartnerProfile(false);
      else closeSafety();
      return true;
    });
    return () => subscription.remove();
  }, [showPartnerProfile, showSafety]);

  // Leaving the list is not throwing the work away: the draft and every failed
  // send are the person's, and the screen unmounting is not their decision.
  useEffect(() => () => {
    rememberDraft(match.matchId, composerRef.current);
    rememberAttempts(match.matchId, attemptsRef.current.filter((attempt) => attempt.status === 'failed').map(({ clientId, body, localUri, voice }) => ({ clientId, body, localUri, voice })));
  }, [match.matchId]);

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
      announce(t('chat.accessibility.messageSent'));
      await haptic('selection');
    } catch (nextError) {
      if (mountedRef.current && !isAbortError(nextError)) {
        announce(t('chat.accessibility.messageFailed'));
        if (isConversationEndedError(nextError)) {
          setConversationEnded(true);
          forgetChat(match.matchId);
          discardAttempt(clientId);
          return;
        }
        const failure = classifyRequestFailure(nextError);
        if (failure.kind === 'permission-denied') {
          discardAttempt(clientId);
          onSessionExpired();
          return;
        }
        setAttempts((current) => current.map((attempt) => attempt.clientId === clientId ? { ...attempt, status: 'failed' as const, error: failure } : attempt));
      }
    } finally { if (mountedRef.current) setSending(false); }
  }

  async function submitVoice(localUri: string, durationMs: number, retryClientId?: string) {
    setRecordingVoice(false);
    const clientId = retryClientId ?? createClientMessageId();
    setAttempts((current) => [...current, { clientId, body: '', localUri, status: 'sending' as const }]);
    setSending(true);
    try {
      const audioPath = await uploadVoiceRecording(match.matchId, currentUserId, localUri, { signal: lifecycleControllerRef.current.signal });
      setAttempts((current) => current.map((attempt) => attempt.clientId === clientId ? { ...attempt, voice: { audioPath, durationMs } } : attempt));
      const confirmed = await sendVoiceMessage(match.matchId, clientId, audioPath, durationMs, { signal: lifecycleControllerRef.current.signal });
      if (!mountedRef.current) return;
      mergeMessage(confirmed);
      discardAttempt(clientId);
      listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion });
      announce(t('chat.accessibility.messageSent'));
      await haptic('selection');
    } catch (nextError) {
      if (mountedRef.current && !isAbortError(nextError)) {
        announce(t('chat.accessibility.messageFailed'));
        if (isConversationEndedError(nextError)) { setConversationEnded(true); discardAttempt(clientId); return; }
        const failure = classifyRequestFailure(nextError);
        if (failure.kind === 'permission-denied') { discardAttempt(clientId); onSessionExpired(); return; }
        setAttempts((current) => current.map((attempt) => attempt.clientId === clientId ? { ...attempt, status: 'failed' as const, error: failure } : attempt));
      }
    } finally { if (mountedRef.current) setSending(false); }
  }

  async function retryVoice(attempt: LocalAttempt) {
    if (sending) return;
    // The upload may be what failed, in which case there is no path yet — the
    // recording is still on the phone and gets a second run at it.
    if (!attempt.voice && attempt.localUri) { await submitVoice(attempt.localUri, 0, attempt.clientId); return; }
    if (!attempt.voice) return;
    setSending(true);
    setAttempts((current) => current.map((entry) => entry.clientId === attempt.clientId ? { ...entry, status: 'sending' as const } : entry));
    try {
      // The object is already uploaded; the same client id and path converge
      // on the one message the first try meant.
      const confirmed = await sendVoiceMessage(match.matchId, attempt.clientId, attempt.voice.audioPath, attempt.voice.durationMs, { signal: lifecycleControllerRef.current.signal });
      if (!mountedRef.current) return;
      mergeMessage(confirmed);
      discardAttempt(attempt.clientId);
    } catch (nextError) {
      if (mountedRef.current && !isAbortError(nextError)) {
        const failure = classifyRequestFailure(nextError);
        setAttempts((current) => current.map((entry) => entry.clientId === attempt.clientId ? { ...entry, status: 'failed' as const, error: failure } : entry));
      }
    } finally { if (mountedRef.current) setSending(false); }
  }

  const openMessageActions = useCallback((messageId: string, body: string, mine: boolean, longPress: boolean, isVoice = false) => {
    if (longPress) void haptic('selection');
    const actions = [
      // Copying a voice message would put an empty string in the clipboard and
      // quietly destroy whatever was in it.
      ...(isVoice ? [] : [{ text: t('chat.actions.copy'), onPress: () => Clipboard.setString(body) }]),
      ...(mine ? [] : [{ text: t('chat.actions.report'), style: 'destructive' as const, onPress: () => openReport(messageId) }]),
      { text: t('chat.actions.cancel'), style: 'cancel' as const },
    ];
    Alert.alert(t('chat.alerts.messageActions'), undefined, actions);
  }, [haptic, t]);

  const renderTimelineItem = useCallback(({ item, index }: { item: TimelineItem<Message>; index: number }) => {
    if (item.type === 'day') return <ChatMessageRow type="day" label={item.label} index={index} onOpenActions={openMessageActions} />;
    const message = item.message;
    return <ChatMessageRow type="message" messageId={message.id} body={message.body} voice={message.kind === 'voice' && message.audio_path ? { audioPath: message.audio_path, durationMs: message.audio_duration_ms ?? 0 } : null} createdAt={message.created_at} mine={message.sender_id === currentUserId} groupedWithPrevious={item.groupedWithPrevious} endsGroup={item.endsGroup} showsTimestamp={item.showsTimestamp} index={index} onOpenActions={openMessageActions} />;
  }, [currentUserId, openMessageActions]);

  function trackScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const nearNewest = event.nativeEvent.contentOffset.y <= theme.spacing.x8;
    nearNewestRef.current = nearNewest;
    if (nearNewest) setShowNewMessage(false);
  }

  function confirmUnmatch() {
    if (safetyBusy) return;
    confirmDestructive({ title: t('chat.alerts.unmatchTitle', { name: match.firstName }), message: t('chat.alerts.unmatchMessage'), cancelText: t('chat.actions.cancel'), destructiveText: t('chat.actions.unmatch'), onConfirm: () => { if (safetyBusy) return; setSafetyError(null); setSafetyBusy('unmatch'); void unmatch(match.matchId, { signal: lifecycleControllerRef.current.signal }).then(async () => { if (!mountedRef.current) return; await haptic('destructive'); onConversationEnded(); }).catch((error: unknown) => { if (mountedRef.current && !isAbortError(error)) setSafetyError(classifyRequestFailure(error)); }).finally(() => { if (mountedRef.current) setSafetyBusy(null); }); } });
  }

  function confirmBlock() {
    if (safetyBusy) return;
    confirmDestructive({ title: t('chat.alerts.blockTitle', { name: match.firstName }), message: t('chat.alerts.blockMessage'), cancelText: t('chat.actions.cancel'), destructiveText: t('chat.actions.block'), onConfirm: () => { if (safetyBusy) return; setSafetyError(null); setSafetyBusy('block'); void blockUser(match.otherUserId, { signal: lifecycleControllerRef.current.signal }).then(async () => { if (!mountedRef.current) return; await haptic('destructive'); onConversationEnded(); }).catch((error: unknown) => { if (mountedRef.current && !isAbortError(error)) setSafetyError(classifyRequestFailure(error)); }).finally(() => { if (mountedRef.current) setSafetyBusy(null); }); } });
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
      if (mountedRef.current && !isAbortError(nextError)) setSafetyError(classifyRequestFailure(nextError));
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

  if (conversationEnded) return <ScreenState kind="empty" icon="matches" title={t('chat.ended.title')} message={t('chat.ended.message')} actionLabel={t('chat.actions.backToMatches')} onAction={onConversationEnded} />;

  return (
    // Edge-to-edge Android stopped resizing the window for the keyboard, so a
    // padding-based avoider had nothing to push against and the composer stayed
    // underneath it. The screen is driven directly by the keyboard's own
    // animation instead, on the UI thread, which also keeps the movement in sync
    // with the system's easing rather than approximating it.
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title={t('chat.header.title', { name: match.firstName, age: formatCount(match.age, locale) })} eyebrow={t('chat.header.eyebrow')} centered leading={{ icon: 'back', accessibilityLabel: t('chat.accessibility.backToMatches'), onPress: onClose }} onTitlePress={() => setShowPartnerProfile(true)} titleAccessibilityLabel={t('chat.accessibility.openProfile', { name: match.firstName })} trailing={<BinderIconButton name="more" accessibilityLabel={t('chat.accessibility.safetyControls')} selected={showSafety} onPress={() => { if (showSafety) closeSafety(); else { setSafetyMode('menu'); setShowSafety(true); } }} />} />

      {/* Only what sits under the header rides the keyboard. Shifting the whole
          screen took the back arrow, the name and the safety menu off the top
          edge and pushed the content under the status bar while typing. */}
      <Animated.View style={[{ flex: 1, overflow: 'hidden' }, keyboardShift]}>

      {showSafety ? (
        <BinderCard style={{ margin: theme.spacing.x3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name="safety" color={theme.semantic.destructive} /><BinderText variant="title" style={{ flex: 1 }}>{safetyMode === 'report' ? reportMessageId ? t('chat.safety.reportMessage') : t('chat.safety.reportPerson', { name: match.firstName }) : t('chat.safety.title')}</BinderText><BinderIconButton name="close" size={19} accessibilityLabel={t('chat.accessibility.closeSafetyControls')} onPress={closeSafety} /></View>
          {safetyMode === 'report' ? (
            <View style={{ marginTop: theme.spacing.x4 }}>
              {reportingMessage ? <BinderCard style={{ backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.x3 }}><BinderText variant="caption" tone="secondary" numberOfLines={4}>{reportingMessage.body}</BinderText></BinderCard> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x3 }}>{REPORT_REASONS.map((reason) => <BinderChip key={reason.value} label={t(reason.labelKey)} selected={reportReason === reason.value} onPress={() => setReportReason(reason.value)} />)}</View>
              <TextInput accessibilityLabel={t('chat.accessibility.reportDetails')} value={reportDetails} onChangeText={setReportDetails} maxLength={1000} multiline placeholder={t('chat.safety.detailsPlaceholder')} placeholderTextColor={theme.colors.textMuted} selectionColor={theme.accent.accent} style={{ minHeight: theme.spacing.x16 + theme.spacing.x6, maxHeight: theme.spacing.x16 * 2 + theme.spacing.x6, marginTop: theme.spacing.x3, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.control, padding: theme.spacing.x3, textAlignVertical: 'top' }} />
              <BinderButton label={t('chat.actions.reportAndBlock')} icon="report" variant="destructive" loading={reporting} onPress={() => void submitReport()} style={{ marginTop: theme.spacing.x3 }} />
              <BinderButton label={t('chat.actions.backToSafetyControls')} variant="ghost" disabled={reporting} onPress={() => { setSafetyMode('menu'); setReportMessageId(null); setReportDetails(''); }} style={{ marginTop: theme.spacing.x2 }} />
            </View>
          ) : (
            <View style={{ gap: theme.spacing.x2, marginTop: theme.spacing.x4 }}>
              <BinderButton label={t('chat.actions.unmatch')} icon="close" variant="secondary" onPress={confirmUnmatch} />
              <BinderButton label={t('chat.actions.block')} icon="block" variant="destructive" onPress={confirmBlock} />
              <BinderButton label={t('chat.actions.reportAndBlock')} icon="report" variant="destructive" onPress={() => openReport()} />
            </View>
          )}
          {safetyError ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x3 }}>{t(safetyError.messageKey)}</BinderText> : null}
        </BinderCard>
      ) : null}

      {loading ? <ScreenState kind="loading" loadingShape="conversation" message={t('chat.states.opening')} /> : errorSurface === 'full-screen' && loadError ? <ScreenState kind={loadError.kind === 'offline' ? 'offline' : loadError.kind === 'permission-denied' ? 'permission' : 'error'} icon="retry" title={loadError.kind === 'offline' ? t('chat.states.offlineTitle') : t('chat.states.loadErrorTitle')} message={t(loadError.messageKey)} actionLabel={loadError.recovery === 'refresh' ? t('chat.actions.refresh') : t('chat.actions.tryAgain')} onAction={() => setReloadKey((value) => value + 1)} /> : messages.length === 0 ? <ScreenState kind="empty" icon="matches" title={t('chat.empty.title')} message={t('chat.empty.message')} /> : (
        <FlatList
          ref={listRef}
          data={timeline}
          inverted
          keyExtractor={chatTimelineKey}
          contentContainerStyle={{ padding: theme.spacing.x4 }}
          showsVerticalScrollIndicator={false}
          onScroll={trackScroll}
          scrollEventThrottle={theme.motion.feedback}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refreshMessages()} tintColor={theme.accent.onSurface} colors={[theme.accent.onSurface]} progressBackgroundColor={theme.colors.surfaceElevated} />}
          ListFooterComponent={hasMore ? <BinderButton label={t('chat.actions.loadEarlierMessages')} variant="ghost" loading={loadingOlder} onPress={() => void loadOlder()} style={{ marginBottom: theme.spacing.x3 }} /> : null}
          renderItem={renderTimelineItem}
        />
      )}

      {showNewMessage ? <Pressable accessibilityRole="button" accessibilityLabel={t('chat.accessibility.scrollToNewMessage')} onPress={() => { listRef.current?.scrollToOffset({ offset: 0, animated: !reduceMotion }); setShowNewMessage(false); }} style={({ pressed }) => ({ minHeight: theme.spacing.x12, alignSelf: 'center', justifyContent: 'center', paddingHorizontal: theme.spacing.x4, borderRadius: theme.radii.pill, backgroundColor: pressed ? theme.accent.pressed : theme.accent.accent })}><BinderText variant="label" style={{ color: theme.accent.foreground }}>{t('chat.message.new')}</BinderText></Pressable> : null}

      {attempts.map((attempt) => (
        <View key={attempt.clientId} style={{ alignItems: 'flex-end', paddingHorizontal: theme.spacing.x4, paddingTop: theme.spacing.x2 }}>
          <View style={{ maxWidth: '82%', paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x3, borderRadius: theme.radii.control, borderBottomRightRadius: theme.radii.small, backgroundColor: attempt.status === 'failed' ? theme.colors.surfaceElevated : theme.accent.accent, borderWidth: attempt.status === 'failed' ? 1 : 0, borderColor: theme.semantic.destructive }}>
            <BinderText variant="body" style={{ color: attempt.status === 'failed' ? theme.colors.textPrimary : theme.accent.foreground }}>{attempt.body || (attempt.voice ? t('chat.voice.pending', { time: formatVoiceDuration(attempt.voice.durationMs) }) : t('chat.voice.uploading'))}</BinderText>
          </View>
          <View style={{ minHeight: theme.spacing.x12, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x2 }}>
            {attempt.status === 'sending' ? <BinderText variant="caption" tone="muted">{t('chat.message.sending')}</BinderText> : (
              <>
                <BinderText variant="caption" tone="destructive" style={{ flexShrink: 1 }}>{attempt.error ? t(attempt.error.messageKey) : t('chat.errors.messageNotSent')}</BinderText>
                <Pressable accessibilityRole="button" accessibilityLabel={t('chat.accessibility.retrySending', { message: attempt.body.slice(0, 24) })} disabled={sending} onPress={() => attempt.voice || attempt.localUri ? void retryVoice(attempt) : attempt.body ? void submitMessage(attempt.clientId) : discardAttempt(attempt.clientId)} style={({ pressed }) => ({ minHeight: theme.spacing.x12, justifyContent: 'center', paddingHorizontal: theme.spacing.x3, borderRadius: theme.radii.pill, opacity: sending ? theme.feedback.disabledOpacity : 1, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surfaceElevated })}><BinderText variant="label" tone="accent">{t('chat.actions.retry')}</BinderText></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={t('chat.accessibility.discardUnsent', { message: attempt.body.slice(0, 24) })} onPress={() => discardAttempt(attempt.clientId)} style={({ pressed }) => ({ minHeight: theme.spacing.x12, justifyContent: 'center', paddingHorizontal: theme.spacing.x3, borderRadius: theme.radii.pill, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.transparent })}><BinderText variant="label" tone="muted">{t('chat.actions.discard')}</BinderText></Pressable>
              </>
            )}
          </View>
        </View>
      ))}

      {connectionNoticeVisible ? <View accessibilityLiveRegion="assertive" style={{ minHeight: theme.spacing.x12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: theme.spacing.x4 }}><BinderText variant="caption" tone="destructive" style={{ flex: 1 }}>{connectionError ? t(connectionError.messageKey) : ''}</BinderText><BinderButton label={t('chat.actions.retry')} variant="ghost" fullWidth={false} onPress={() => setReloadKey((value) => value + 1)} /></View> : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.x2, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x3, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}>
        {recordingVoice ? <VoiceRecorderBar
          onFinished={(uri, durationMs) => void submitVoice(uri, durationMs)}
          onCancel={() => setRecordingVoice(false)}
          onPermissionDenied={() => { setRecordingVoice(false); Alert.alert(t('chat.voice.permissionTitle'), t('chat.voice.permissionBody')); }}
        /> : <TextInput accessibilityLabel={t('chat.accessibility.messagePerson', { name: match.firstName })} value={composer} onChangeText={setComposer} maxLength={2000} multiline scrollEnabled placeholder={t('chat.message.placeholder', { name: match.firstName })} placeholderTextColor={theme.colors.textMuted} selectionColor={theme.accent.accent} style={{ flex: 1, minHeight: theme.spacing.x12, maxHeight: theme.spacing.x16 * 2, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.control, paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x3, textAlignVertical: 'center' }} />}
        {recordingVoice ? null : validComposer === null && !sending
          ? <BinderIconButton name="mic" selected accessibilityLabel={t('chat.voice.accessibility.record')} onPress={() => setRecordingVoice(true)} />
          : <BinderIconButton name={sending ? 'more' : 'send'} accessibilityLabel={sending ? t('chat.accessibility.sendingMessage') : t('chat.accessibility.sendMessageTo', { name: match.firstName })} selected={canSend || sending} disabled={!canSend} onPress={() => void submitMessage()} />}
      </View>
      </Animated.View>
    </View>
  );
}
