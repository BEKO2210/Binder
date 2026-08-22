import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';

import { signedVoiceUrl } from '../lib/conversation';
import { classifyError, withDeadline } from '../lib/reliability';
import { formatVoiceDuration, waveformHeights } from '../lib/voiceMessage';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderIconButton, BinderText } from './ui';

type Props = {
  messageId: string;
  audioPath: string;
  durationMs: number;
  mine: boolean;
  bucket?: 'voice-media' | 'profile-voice';
};

const BAR_COUNT = 24;

/**
 * The inside of a voice bubble: play/pause, a seeded waveform, the time.
 *
 * The signed URL is fetched on the first play, not on render — a chat page of
 * thirty voice messages must not fire thirty storage requests for bubbles
 * nobody taps. Progress fills the bars from the left while playing.
 */
// The play button is disabled while this runs.
const VOICE_URL_DEADLINE_MS = 12_000;

export function VoiceMessageBubble({ messageId, audioPath, durationMs, mine, bucket }: Props) {
  const { theme, t } = useBinderTheme();
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const loadedRef = useRef(false);

  const bars = useMemo(() => waveformHeights(messageId, BAR_COUNT), [messageId]);
  const onAccent = mine;

  const playing = status.playing;
  const progress = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0;
  const remainingMs = playing && status.duration > 0 ? Math.max(0, (status.duration - status.currentTime) * 1000) : durationMs;

  async function toggle() {
    setFailed(false);
    if (playing) { player.pause(); return; }
    try {
      if (!loadedRef.current) {
        setLoading(true);
        player.replace({ uri: await withDeadline(signedVoiceUrl(audioPath, { bucket }), VOICE_URL_DEADLINE_MS) });
        loadedRef.current = true;
      }
      // A finished clip starts over; anything else resumes where it stopped.
      if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration)) player.seekTo(0);
      player.play();
    } catch (error) {
      classifyError(error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  const barColor = onAccent ? theme.accent.foreground : theme.colors.textMuted;
  const barPlayedColor = onAccent ? theme.accent.foreground : theme.accent.accent;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, minWidth: 200 }}>
      <BinderIconButton
        name={playing ? 'pause' : 'play'}
        size={21}
        color={onAccent ? theme.accent.foreground : theme.accent.onSurface}
        accessibilityLabel={playing ? t('chat.voice.accessibility.pause') : t('chat.voice.accessibility.play')}
        onPress={() => void toggle()}
        disabled={loading}
      />
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2, height: theme.spacing.x8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {bars.map((height, index) => {
          const played = progress > 0 && index / BAR_COUNT < progress;
          return <View key={index} style={{ flex: 1, height: `${Math.round(height * 100)}%`, borderRadius: theme.radii.pill, backgroundColor: played ? barPlayedColor : barColor, opacity: played ? 1 : onAccent ? 0.55 : 0.6 }} />;
        })}
      </View>
      <BinderText variant="caption" maxFontSizeMultiplier={1.4} style={{ color: onAccent ? theme.accent.foreground : theme.colors.textSecondary, fontVariant: ['tabular-nums'] }}>
        {failed ? t('chat.voice.loadFailed') : formatVoiceDuration(remainingMs)}
      </BinderText>
    </View>
  );
}
