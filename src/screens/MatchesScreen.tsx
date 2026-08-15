import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { fetchMatches, type MatchSummary } from '../lib/conversation';
import { enablePushNotifications } from '../lib/notifications';

export default function MatchesScreen({
  refreshKey,
  onOpenMatch,
}: {
  refreshKey: number;
  onOpenMatch: (match: MatchSummary) => void;
}) {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pushState, setPushState] = useState<'idle' | 'busy' | 'enabled' | 'unavailable'>('idle');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setMatches(await fetchMatches());
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not load matches.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function enablePush() {
    if (pushState === 'busy') return;
    setPushState('busy');
    try {
      const result = await enablePushNotifications();
      setPushState(result.status === 'registered' ? 'enabled' : 'unavailable');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Could not enable notifications.');
      setPushState('idle');
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>CONVERSATIONS</Text>
          <Text style={styles.title}>Your Binds</Text>
        </View>
        <Pressable onPress={() => void load()} style={styles.refreshButton} accessibilityRole="button">
          <Text style={styles.refreshText}>Refresh</Text>
        </Pressable>
      </View>

      {pushState !== 'enabled' ? (
        <Pressable onPress={() => void enablePush()} style={styles.pushCard} accessibilityRole="button">
          <View style={styles.pushDot} />
          <View style={styles.pushCopy}>
            <Text style={styles.pushTitle}>{pushState === 'busy' ? 'Enabling…' : 'Message alerts'}</Text>
            <Text style={styles.pushText}>
              {pushState === 'unavailable'
                ? 'Remote push is not configured on this build yet. Chat still works normally.'
                : 'Opt in to alerts for new matches and messages.'}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.pushEnabled}>
          <View style={styles.pushDot} />
          <Text style={styles.pushEnabledText}>Message alerts enabled</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#C7FF4A" />
          <Text style={styles.muted}>Loading your matches…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryButton}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : matches.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No Binds yet.</Text>
          <Text style={styles.muted}>Mutual Binds will appear here. No one can message you before that.</Text>
        </View>
      ) : (
        <FlatList
          data={matches}
          keyExtractor={(item) => item.matchId}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable onPress={() => onOpenMatch(item)} style={styles.row} accessibilityRole="button">
              {item.photoUrl ? (
                <Image source={{ uri: item.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>{item.firstName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}
              <View style={styles.rowBody}>
                <View style={styles.rowTop}>
                  <Text numberOfLines={1} style={styles.name}>{item.firstName}, {item.age}</Text>
                  {item.unreadCount > 0 ? (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{Math.min(item.unreadCount, 99)}</Text>
                    </View>
                  ) : null}
                </View>
                <Text numberOfLines={1} style={[styles.preview, item.unreadCount > 0 && styles.previewUnread]}>
                  {item.lastMessageBody ?? "It's a Bind — say hi."}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0B0B0F', paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 16 },
  eyebrow: { color: '#C7FF4A', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: '#F7F7F4', fontSize: 30, lineHeight: 34, fontWeight: '900', marginTop: 4 },
  refreshButton: { backgroundColor: '#17171D', paddingHorizontal: 13, paddingVertical: 9, borderRadius: 999 },
  refreshText: { color: '#DADAE0', fontWeight: '800', fontSize: 12 },
  pushCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: '#2A2A31', borderRadius: 18, backgroundColor: '#121217', padding: 14, marginBottom: 12 },
  pushDot: { width: 9, height: 9, borderRadius: 99, backgroundColor: '#C7FF4A' },
  pushCopy: { flex: 1 },
  pushTitle: { color: '#F3F3EF', fontSize: 13, fontWeight: '900' },
  pushText: { color: '#8F8F98', fontSize: 11, lineHeight: 16, marginTop: 2 },
  pushEnabled: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  pushEnabledText: { color: '#A7A7AE', fontSize: 11, fontWeight: '700' },
  list: { paddingBottom: 28, gap: 8 },
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, backgroundColor: '#141419', padding: 10 },
  avatar: { width: 62, height: 62, borderRadius: 17, backgroundColor: '#24242B' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { color: '#C7FF4A', fontSize: 23, fontWeight: '900' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, color: '#F7F7F4', fontSize: 16, fontWeight: '900' },
  preview: { color: '#85858E', fontSize: 12, marginTop: 6 },
  previewUnread: { color: '#D1D1D5', fontWeight: '800' },
  badge: { minWidth: 22, height: 22, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#C7FF4A', borderRadius: 999 },
  badgeText: { color: '#101115', fontWeight: '900', fontSize: 10 },
  chevron: { color: '#676771', fontSize: 30, paddingHorizontal: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30, gap: 12 },
  muted: { color: '#888891', textAlign: 'center', lineHeight: 20 },
  emptyTitle: { color: '#F7F7F4', fontSize: 22, fontWeight: '900' },
  error: { color: '#FF748A', textAlign: 'center', lineHeight: 20 },
  retryButton: { backgroundColor: '#C7FF4A', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  retryText: { color: '#101115', fontWeight: '900' },
});
