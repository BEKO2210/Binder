import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder, useAudioRecorderState } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { AppState, View } from 'react-native';

import { formatVoiceDuration, interruptedTakeAction, recordingStopDecision, VOICE_MAX_DURATION_MS } from '../lib/voiceMessage';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderIconButton, BinderText } from './ui';

type Props = {
  onFinished: (localUri: string, durationMs: number) => void;
  onCancel: () => void;
  onPermissionDenied: () => void;
};

/**
 * The recording strip that replaces the composer while a voice message is
 * being taken: a pulsing dot, the elapsed time counting toward the one-minute
 * cap, discard on the left, send on the right. Recording starts on mount —
 * the microphone button already expressed the intent — and the cap stops it
 * with the take intact rather than throwing it away.
 */
export function VoiceRecorderBar({ onFinished, onCancel, onPermissionDenied }: Props) {
  const { theme, t } = useBinderTheme();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [ready, setReady] = useState(false);
  // A take the person walked away from: recorded, stopped, waiting for a tap.
  const [interrupted, setInterrupted] = useState<{ uri: string; durationMs: number } | null>(null);
  const finishingRef = useRef(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!active) return;
      if (!permission.granted) { onPermissionDenied(); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      if (!active) return;
      await recorder.prepareToRecordAsync();
      if (!active) return;
      recorder.record();
      setReady(true);
    })();
    return () => {
      active = false;
      // Leaving the screen mid-take discards the take; recording must never
      // outlive the strip that shows it.
      try { if (recorder.isRecording) void recorder.stop(); } catch { /* released */ }
      void setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
    };
    // The recorder object is stable for the component's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const durationMs = interrupted?.durationMs ?? state.durationMillis ?? 0;

  // The microphone is not ours once another app is in front: the strip kept
  // counting while nothing was being recorded, and the one-minute cap finishes
  // a take by sending it — a phone in a pocket could post a minute of silence
  // on its own. Leaving stops the recorder; what is already there waits for a
  // deliberate tap.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' || finishingRef.current || !ready) return;
      finishingRef.current = true;
      void (async () => {
        const takenMs = recorder.currentTime ? Math.round(recorder.currentTime * 1000) : (state.durationMillis ?? 0);
        try { await recorder.stop(); } catch { /* already released */ }
        const uri = recorder.uri;
        if (!uri || interruptedTakeAction(takenMs) === 'discard') { onCancel(); return; }
        setInterrupted({ uri, durationMs: Math.min(takenMs, VOICE_MAX_DURATION_MS) });
        finishingRef.current = false;
      })();
    });
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  async function finish() {
    if (interrupted) {
      finishingRef.current = true;
      onFinished(interrupted.uri, interrupted.durationMs);
      return;
    }
    if (finishingRef.current || !ready) return;
    finishingRef.current = true;
    await recorder.stop();
    const uri = recorder.uri;
    const finalMs = Math.min(durationMs, VOICE_MAX_DURATION_MS);
    if (!uri || recordingStopDecision(finalMs) === 'too-short') { onCancel(); return; }
    onFinished(uri, finalMs);
  }

  useEffect(() => {
    if (ready && !interrupted && durationMs >= VOICE_MAX_DURATION_MS) void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, durationMs]);

  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3, minHeight: theme.spacing.x12, backgroundColor: theme.colors.surfaceElevated, borderWidth: 1, borderColor: theme.colors.borderSubtle, borderRadius: theme.radii.control, paddingHorizontal: theme.spacing.x3 }}>
      <BinderIconButton name="delete" size={19} destructive accessibilityLabel={t('chat.voice.accessibility.discard')} onPress={() => { finishingRef.current = true; void recorder.stop(); onCancel(); }} />
      {interrupted ? null : <View style={{ width: theme.spacing.x2, height: theme.spacing.x2, borderRadius: theme.radii.pill, backgroundColor: theme.semantic.destructive }} />}
      <BinderText variant="label" style={{ flex: 1, fontVariant: ['tabular-nums'] }}>
        {interrupted ? t('chat.voice.paused', { time: formatVoiceDuration(durationMs) }) : ready ? t('chat.voice.recording', { time: formatVoiceDuration(durationMs) }) : t('chat.voice.preparing')}
      </BinderText>
      <BinderIconButton name="send" accessibilityLabel={t('chat.voice.accessibility.finish')} selected onPress={() => void finish()} />
    </View>
  );
}
