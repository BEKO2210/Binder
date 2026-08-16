import { useEffect, useMemo, useState } from 'react';
import { Alert, AppState, BackHandler, FlatList, Platform, Pressable, TextInput, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { buildChatTimeline, timeLabel, type TimelineItem } from '../lib/chatTimeline';

import { BinderButton, BinderCard, BinderChip, BinderIcon, BinderIconButton, BinderText, ScreenState } from '../components/ui';
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

type FailedAttempt = { clientId: string; body: string };
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
  const [loadError, setLoadError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [composer, setComposer] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [failedAttempt, setFailedAttempt] = useState<FailedAttempt | null>(null);
  const [showSafety, setShowSafety] = useState(false);
  const [safetyMode, setSafetyMode] = useState<SafetyMode>('menu');
  const [reportReason, setReportReason] = useState<ReportReason>('harassment');
  const [reportDetails, setReportDetails] = useState('');
  const [reportMessageId, setReportMessageId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [showPartnerProfile, setShowPartnerProfile] = useState(false);

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
    let unsubscribe: (() => void) | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryAttempt = 0;
    let appIsActive = AppState.currentState === 'active';

    async function load(initial: boolean) {
      if (initial) setLoading(true);
      setLoadError('');
      try {
        const page = await fetchMessagesPage(match.matchId);
        if (!active) return;
        mergeMessages(page.messages);
        setHasMore(page.hasMore);
        await markMatchRead(match.matchId);
      } catch (nextError) {
        if (active) setLoadError(nextError instanceof Error ? nextError.message : 'Could not load conversation.');
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
          mergeMessage(message);
          if (message.sender_id !== currentUserId) void markMatchRead(match.matchId).catch(() => undefined);
        },
        (message) => {
          if (!active) return;
          setLoadError(message);
          unsubscribe?.();
          const delay = Math.min(15_000,1_000 * 2 ** retryAttempt);
          retryAttempt += 1;
          retryTimer = setTimeout(() => {
            retryTimer = null;
            connect();
          },delay);
        },
      );
    }

    void load(true);
    connect();
    const appState = AppState.addEventListener('change',(state) => {
      if (!active) return;
      appIsActive = state === 'active';
      if (state === 'active') {
        retryAttempt = 0;
        if (retryTimer) clearTimeout(retryTimer);
        void load(false);
        connect();
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
      if (retryTimer) clearTimeout(retryTimer);
      unsubscribe?.();
      appState.remove();
    };
  }, [currentUserId, match.matchId]);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    setLoadError('');
    try {
      const page = await fetchMessagesPage(match.matchId,oldest);
      mergeMessages(page.messages);
      setHasMore(page.hasMore);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load earlier messages.');
    } finally {
      setLoadingOlder(false);
    }
  }

  const trimmedComposer = composer.trim();
  const canSend = trimmedComposer.length > 0 && trimmedComposer.length <= 2000 && !sending;
  const reportingMessage = useMemo(() => messages.find((message) => message.id === reportMessageId) ?? null, [messages, reportMessageId]);
  // The list renders inverted so the newest message is always pinned to the
  // bottom edge, directly above the composer — also while the keyboard is up.
  // The timeline adds bubble grouping, timestamps and day separators.
  const timeline = useMemo(() => [...buildChatTimeline(messages)].reverse(), [messages]);

  useEffect(() => {
    if (!showPartnerProfile) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setShowPartnerProfile(false);
      return true;
    });
    return () => subscription.remove();
  }, [showPartnerProfile]);

  async function submitMessage() {
    if (!canSend) return;
    const body = trimmedComposer;
    const clientId = failedAttempt?.body === body ? failedAttempt.clientId : createClientMessageId();
    setSending(true);
    setSendError('');
    try {
      const confirmed = await sendMessage(match.matchId, clientId, body);
      mergeMessage(confirmed);
      setComposer('');
      setFailedAttempt(null);
      await haptic('selection');
    } catch (nextError) {
      setFailedAttempt({ clientId, body });
      setSendError(nextError instanceof Error ? nextError.message : 'Message was not sent.');
    } finally { setSending(false); }
  }

  function confirmUnmatch() {
    Alert.alert(`Unmatch ${match.firstName}?`, 'The conversation closes for both of you immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unmatch', style: 'destructive', onPress: () => { void unmatch(match.matchId).then(async () => { await haptic('destructive'); onConversationEnded(); }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not unmatch.')); } },
    ]);
  }

  function confirmBlock() {
    Alert.alert(`Block ${match.firstName}?`, 'You will disappear from each other and the conversation closes immediately.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block', style: 'destructive', onPress: () => { void blockUser(match.otherUserId).then(async () => { await haptic('destructive'); onConversationEnded(); }).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : 'Could not block user.')); } },
    ]);
  }

  async function submitReport() {
    if (reporting) return;
    setReporting(true);
    setLoadError('');
    try {
      await reportUser({ reportedUserId: match.otherUserId, reason: reportReason, details: reportDetails, matchId: match.matchId, messageId: reportMessageId ?? undefined, block: true });
      await haptic('destructive');
      onConversationEnded();
    } catch (nextError) {
      setLoadError(nextError instanceof Error ? nextError.message : 'Could not submit report.');
    } finally { setReporting(false); }
  }

  function openReport(messageId?: string) {
    setReportMessageId(messageId ?? null);
    setReportReason('harassment');
    setReportDetails('');
    setSafetyMode('report');
    setShowSafety(true);
  }

  function closeSafety() {
    setShowSafety(false);
    setSafetyMode('menu');
    setReportMessageId(null);
    setReportDetails('');
  }

  if (showPartnerProfile) {
    return <PartnerProfileScreen userId={match.otherUserId} fallbackName={match.firstName} onClose={() => setShowPartnerProfile(false)} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.colors.canvas }} behavior="padding" keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}>
      <View style={{ paddingTop: theme.spacing.x3, paddingHorizontal: theme.spacing.x3, paddingBottom: theme.spacing.x3, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle }}>
        <BinderIconButton name="back" accessibilityLabel="Back to matches" onPress={onClose} />
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${match.firstName}'s profile`} onPress={() => setShowPartnerProfile(true)} style={{ flex: 1, alignItems: 'center' }}>
          <BinderText variant="label">{match.firstName}, {match.age}</BinderText>
          <BinderText variant="micro" tone="accent" style={{ marginTop: theme.spacing.x1 }}>View profile</BinderText>
        </Pressable>
        <BinderIconButton name="more" accessibilityLabel="Conversation safety controls" selected={showSafety} onPress={() => { if (showSafety) closeSafety(); else { setSafetyMode('menu'); setShowSafety(true); } }} />
      </View>

      {showSafety ? (
        <BinderCard style={{ margin: theme.spacing.x3 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name="safety" color={theme.semantic.destructive} /><BinderText variant="title" style={{ flex: 1 }}>{safetyMode === 'report' ? reportMessageId ? 'Report this message' : `Report ${match.firstName}` : 'Safety controls'}</BinderText><BinderIconButton name="close" size={19} accessibilityLabel="Close safety controls" onPress={closeSafety} /></View>
          {safetyMode === 'report' ? (
            <View style={{ marginTop: theme.spacing.x4 }}>
              {reportingMessage ? <BinderCard style={{ backgroundColor: theme.colors.surfaceElevated, padding: theme.spacing.x3 }}><BinderText variant="caption" tone="secondary" numberOfLines={4}>{reportingMessage.body}</BinderText></BinderCard> : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.x2, marginTop: theme.spacing.x3 }}>{REPORT_REASONS.map((reason) => <BinderChip key={reason.value} label={reason.label} selected={reportReason === reason.value} onPress={() => setReportReason(reason.value)} />)}</View>
              <TextInput value={reportDetails} onChangeText={setReportDetails} maxLength={1000} multiline placeholder="Optional details for the safety team" placeholderTextColor={theme.colors.textMuted} selectionColor={theme.accent.accent} style={{ minHeight: 88, maxHeight: 150, marginTop: theme.spacing.x3, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.control, padding: theme.spacing.x3, textAlignVertical: 'top' }} />
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
        </BinderCard>
      ) : null}

      {loading ? <ScreenState kind="loading" message="Opening conversation…" /> : loadError && messages.length === 0 ? <ScreenState kind="error" icon="retry" title="Conversation did not load" message={loadError} actionLabel="Back to matches" onAction={onClose} /> : messages.length === 0 ? <ScreenState kind="empty" icon="matches" title="You matched." message="Normal chat opens only after mutual interest. Say something real." /> : (
        <FlatList
          data={timeline}
          inverted
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ flexGrow: 1, padding: theme.spacing.x4 }}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={hasMore ? <BinderButton label="Load earlier messages" variant="ghost" loading={loadingOlder} onPress={() => void loadOlder()} style={{ marginBottom: theme.spacing.x3 }} /> : null}
          renderItem={({ item }) => {
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
              <Animated.View entering={reduceMotion ? undefined : FadeInDown.duration(theme.motion.feedback)} style={{ marginTop: item.groupedWithPrevious ? theme.spacing.x1 : theme.spacing.x3 }}>
                <Pressable disabled={mine} onLongPress={() => openReport(message.id)} accessibilityHint={mine ? undefined : 'Hold to report this message'} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
                  <View style={{
                    paddingHorizontal: theme.spacing.x4,
                    paddingVertical: theme.spacing.x3,
                    borderRadius: bubbleRadius,
                    borderTopRightRadius: mine && item.groupedWithPrevious ? theme.radii.small / 2 : bubbleRadius,
                    borderTopLeftRadius: !mine && item.groupedWithPrevious ? theme.radii.small / 2 : bubbleRadius,
                    backgroundColor: mine ? theme.accent.accent : theme.colors.surfaceElevated,
                    borderWidth: mine ? 0 : 1,
                    borderColor: theme.colors.borderSubtle,
                  }}>
                    <BinderText selectable variant="body" style={{ color: mine ? theme.accent.foreground : theme.colors.textPrimary }}>{message.body}</BinderText>
                  </View>
                  {item.showsTimestamp ? (
                    <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x1, alignSelf: mine ? 'flex-end' : 'flex-start', marginHorizontal: theme.spacing.x2 }}>
                      {timeLabel(message.created_at)}
                    </BinderText>
                  ) : null}
                </Pressable>
              </Animated.View>
            );
          }}
        />
      )}

      {loadError && messages.length > 0 ? <BinderText variant="caption" tone="destructive" style={{ paddingHorizontal: theme.spacing.x4 }}>{loadError}</BinderText> : null}
      {sendError ? <BinderText variant="caption" tone="destructive" style={{ paddingHorizontal: theme.spacing.x4 }}>{sendError} Tap Send to retry safely.</BinderText> : null}

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.x2, paddingHorizontal: theme.spacing.x3, paddingVertical: theme.spacing.x3, borderTopWidth: 1, borderTopColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surface }}>
        <TextInput value={composer} onChangeText={(value) => { setComposer(value); setSendError(''); if (failedAttempt && failedAttempt.body !== value.trim()) setFailedAttempt(null); }} maxLength={2000} multiline placeholder={`Message ${match.firstName}`} placeholderTextColor={theme.colors.textMuted} selectionColor={theme.accent.accent} style={{ flex: 1, minHeight: 48, maxHeight: 130, color: theme.colors.textPrimary, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.control, paddingHorizontal: theme.spacing.x4, paddingVertical: theme.spacing.x3, textAlignVertical: 'center' }} />
        <BinderIconButton name="send" accessibilityLabel={`Send message to ${match.firstName}`} selected={canSend} disabled={!canSend} onPress={() => void submitMessage()} />
      </View>
    </KeyboardAvoidingView>
  );
}
