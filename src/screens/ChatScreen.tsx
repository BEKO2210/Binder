import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  blockUser,
  createClientMessageId,
  fetchMessages,
  markMatchRead,
  reportUser,
  sendMessage,
  subscribeToMessages,
  unmatch,
  type MatchSummary,
  type Message,
  type ReportReason,
} from '../lib/conversation';

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

export default function ChatScreen({
  match,
  currentUserId,
  onClose,
  onConversationEnded,
}: {
  match: MatchSummary;
  currentUserId: string;
  onClose: () => void;
  onConversationEnded: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
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

  function mergeMessage(next: Message) {
    setMessages((current) => {
      if (current.some((message) => message.id === next.id)) return current;
      return [...current, next].sort((a, b) => {
        const time = a.created_at.localeCompare(b.created_at);
        return time === 0 ? a.id.localeCompare(b.id) : time;
      });
    });
  }

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const rows = await fetchMessages(match.matchId);
        if (!active) return;
        setMessages(rows);
        await markMatchRead(match.matchId);
      } catch (nextError) {
        if (active) {
          setLoadError(nextError instanceof Error ? nextError.message : 'Could not load conversation.');
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();

    const unsubscribe = subscribeToMessages(
      match.matchId,
      (message) => {
        if (!active) return;
        mergeMessage(message);
        if (message.sender_id !== currentUserId) {
          void markMatchRead(match.matchId).catch(() => undefined);
        }
      },
      (message) => {
        if (active) setLoadError(message);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [currentUserId, match.matchId]);

  const trimmedComposer = composer.trim();
  const canSend = trimmedComposer.length > 0 && trimmedComposer.length <= 2000 && !sending;
  const reportingMessage = useMemo(
    () => messages.find((message) => message.id === reportMessageId) ?? null,
    [messages, reportMessageId],
  );

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
    } catch (nextError) {
      setFailedAttempt({ clientId, body });
      setSendError(nextError instanceof Error ? nextError.message : 'Message was not sent.');
    } finally {
      setSending(false);
    }
  }

  function confirmUnmatch() {
    Alert.alert(
      `Unmatch ${match.firstName}?`,
      'The conversation closes for both of you immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unmatch',
          style: 'destructive',
          onPress: () => {
            void unmatch(match.matchId)
              .then(() => onConversationEnded())
              .catch((error: unknown) => {
                setLoadError(error instanceof Error ? error.message : 'Could not unmatch.');
              });
          },
        },
      ],
    );
  }

  function confirmBlock() {
    Alert.alert(
      `Block ${match.firstName}?`,
      'You will disappear from each other and the conversation closes immediately.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => {
            void blockUser(match.otherUserId)
              .then(() => onConversationEnded())
              .catch((error: unknown) => {
                setLoadError(error instanceof Error ? error.message : 'Could not block user.');
              });
          },
        },
      ],
    );
  }

  async function submitReport() {
    if (reporting) return;
    setReporting(true);
    setLoadError('');

    try {
      await reportUser({
        reportedUserId: match.otherUserId,
        reason: reportReason,
        details: reportDetails,
        matchId: match.matchId,
        messageId: reportMessageId ?? undefined,
        block: true,
      });
      onConversationEnded();
    } catch (nextError) {
      setLoadError(nextError instanceof Error ? nextError.message : 'Could not submit report.');
    } finally {
      setReporting(false);
    }
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

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={8}
    >
      <View style={styles.header}>
        <Pressable onPress={onClose} style={styles.headerButton} accessibilityRole="button">
          <Text style={styles.headerButtonText}>‹</Text>
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.name}>{match.firstName}, {match.age}</Text>
          <Text style={styles.subtitle}>It's a Bind</Text>
        </View>
        <Pressable
          onPress={() => {
            if (showSafety) closeSafety();
            else {
              setSafetyMode('menu');
              setShowSafety(true);
            }
          }}
          style={styles.headerButton}
          accessibilityRole="button"
        >
          <Text style={styles.more}>•••</Text>
        </Pressable>
      </View>

      {showSafety ? (
        <View style={styles.safetyPanel}>
          <Text style={styles.safetyTitle}>
            {safetyMode === 'report'
              ? reportMessageId
                ? 'Report this message'
                : `Report ${match.firstName}`
              : 'Safety controls'}
          </Text>

          {safetyMode === 'report' ? (
            <>
              {reportingMessage ? <Text style={styles.reportQuote}>“{reportingMessage.body}”</Text> : null}
              <View style={styles.reasonWrap}>
                {REPORT_REASONS.map((reason) => (
                  <Pressable
                    key={reason.value}
                    onPress={() => setReportReason(reason.value)}
                    style={[styles.reasonChip, reportReason === reason.value && styles.reasonChipActive]}
                  >
                    <Text style={[styles.reasonText, reportReason === reason.value && styles.reasonTextActive]}>
                      {reason.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <TextInput
                value={reportDetails}
                onChangeText={setReportDetails}
                maxLength={1000}
                multiline
                placeholder="Optional details for the safety team"
                placeholderTextColor="#65656E"
                style={styles.reportInput}
              />
              <Pressable onPress={() => void submitReport()} disabled={reporting} style={styles.reportButton}>
                <Text style={styles.reportButtonText}>{reporting ? 'Submitting…' : 'Report & block'}</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSafetyMode('menu');
                  setReportMessageId(null);
                  setReportDetails('');
                }}
                style={styles.cancelReport}
              >
                <Text style={styles.cancelReportText}>Back</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.safetyActions}>
              <Pressable onPress={confirmUnmatch} style={styles.safetyAction}>
                <Text style={styles.safetyActionText}>Unmatch</Text>
              </Pressable>
              <Pressable onPress={confirmBlock} style={styles.safetyAction}>
                <Text style={styles.dangerText}>Block</Text>
              </Pressable>
              <Pressable onPress={() => openReport()} style={styles.safetyAction}>
                <Text style={styles.dangerText}>Report & block</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : null}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#C7FF4A" />
          <Text style={styles.muted}>Opening conversation…</Text>
        </View>
      ) : loadError && messages.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
          <Pressable onPress={onClose} style={styles.inlineButton}>
            <Text style={styles.inlineButtonText}>Back to matches</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>You matched.</Text>
              <Text style={styles.muted}>Normal chat only opens after mutual interest. Say something real.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const mine = item.sender_id === currentUserId;
            return (
              <Pressable
                disabled={mine}
                onLongPress={() => openReport(item.id)}
                style={[styles.bubbleWrap, mine ? styles.bubbleWrapMine : styles.bubbleWrapOther]}
              >
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}>
                  <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{item.body}</Text>
                </View>
                {!mine ? <Text style={styles.longPressHint}>Hold to report</Text> : null}
              </Pressable>
            );
          }}
        />
      )}

      {loadError && messages.length > 0 ? <Text style={styles.inlineError}>{loadError}</Text> : null}
      {sendError ? <Text style={styles.inlineError}>{sendError} Tap Send to retry safely.</Text> : null}

      <View style={styles.composerRow}>
        <TextInput
          value={composer}
          onChangeText={(value) => {
            setComposer(value);
            setSendError('');
            if (failedAttempt && failedAttempt.body !== value.trim()) setFailedAttempt(null);
          }}
          maxLength={2000}
          multiline
          placeholder={`Message ${match.firstName}`}
          placeholderTextColor="#696972"
          style={styles.composer}
        />
        <Pressable
          onPress={() => void submitMessage()}
          disabled={!canSend}
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.sendText}>{sending ? '…' : 'Send'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F' },
  header: { paddingTop: 48, paddingHorizontal: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#202026' },
  headerButton: { width: 42, height: 42, borderRadius: 16, backgroundColor: '#17171D', alignItems: 'center', justifyContent: 'center' },
  headerButtonText: { color: '#F7F7F4', fontSize: 34, lineHeight: 36, marginTop: -2 },
  headerCopy: { flex: 1, alignItems: 'center' },
  name: { color: '#F7F7F4', fontSize: 16, fontWeight: '900' },
  subtitle: { color: '#C7FF4A', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, marginTop: 3 },
  more: { color: '#D8D8DE', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
  safetyPanel: { margin: 12, padding: 14, backgroundColor: '#15151B', borderRadius: 20, borderWidth: 1, borderColor: '#2A2A31' },
  safetyTitle: { color: '#F6F6F3', fontWeight: '900', fontSize: 15 },
  safetyActions: { marginTop: 10, gap: 4 },
  safetyAction: { paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#25252C' },
  safetyActionText: { color: '#E6E6E2', fontWeight: '800' },
  dangerText: { color: '#FF748A', fontWeight: '900' },
  reportQuote: { color: '#B7B7BE', fontStyle: 'italic', marginTop: 8, lineHeight: 18 },
  reasonWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  reasonChip: { backgroundColor: '#222228', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  reasonChipActive: { backgroundColor: '#C7FF4A' },
  reasonText: { color: '#B8B8BF', fontSize: 11, fontWeight: '800' },
  reasonTextActive: { color: '#101115' },
  reportInput: { minHeight: 72, maxHeight: 130, marginTop: 12, backgroundColor: '#0F0F14', borderRadius: 14, padding: 12, color: '#F6F6F3', textAlignVertical: 'top' },
  reportButton: { marginTop: 10, backgroundColor: '#FF5A76', borderRadius: 14, alignItems: 'center', paddingVertical: 12 },
  reportButtonText: { color: '#120B0D', fontWeight: '900' },
  cancelReport: { alignItems: 'center', paddingVertical: 10 },
  cancelReportText: { color: '#92929A', fontWeight: '700' },
  messageList: { flexGrow: 1, padding: 14, justifyContent: 'flex-end', gap: 8 },
  bubbleWrap: { maxWidth: '82%' },
  bubbleWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleWrapOther: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMine: { backgroundColor: '#C7FF4A', borderBottomRightRadius: 6 },
  bubbleOther: { backgroundColor: '#1B1B21', borderBottomLeftRadius: 6 },
  bubbleText: { color: '#F0F0F3', fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: '#101115', fontWeight: '600' },
  longPressHint: { color: '#52525A', fontSize: 8, marginTop: 3, marginLeft: 5 },
  composerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, paddingHorizontal: 12, paddingTop: 9, paddingBottom: Platform.OS === 'ios' ? 22 : 12, borderTopWidth: 1, borderTopColor: '#202026' },
  composer: { flex: 1, minHeight: 44, maxHeight: 120, backgroundColor: '#17171D', color: '#F6F6F3', borderRadius: 18, paddingHorizontal: 14, paddingTop: 11, paddingBottom: 11, textAlignVertical: 'center' },
  sendButton: { minWidth: 62, height: 44, backgroundColor: '#C7FF4A', borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 11 },
  sendButtonDisabled: { opacity: 0.35 },
  sendText: { color: '#101115', fontWeight: '900', fontSize: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 24 },
  emptyTitle: { color: '#F7F7F4', fontWeight: '900', fontSize: 22, marginBottom: 8 },
  muted: { color: '#888891', textAlign: 'center', lineHeight: 20 },
  error: { color: '#FF748A', textAlign: 'center', lineHeight: 20 },
  inlineError: { color: '#FF748A', fontSize: 10, paddingHorizontal: 14, paddingVertical: 5, textAlign: 'center' },
  inlineButton: { backgroundColor: '#C7FF4A', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  inlineButtonText: { color: '#101115', fontWeight: '900' },
});
