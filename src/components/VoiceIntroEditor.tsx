import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { loadMyVoiceIntro, removeVoiceIntro, saveVoiceIntro, type VoiceIntro } from '../lib/voiceIntro';
import { classifyError } from '../lib/reliability';
import { useBinderTheme } from '../theme/ThemeProvider';
import { BinderButton, BinderText } from './ui';
import { VoiceMessageBubble } from './VoiceMessageBubble';
import { VoiceRecorderBar } from './VoiceRecorderBar';

type Props = { userId: string };

/**
 * The profile's voice intro: record, listen, replace, delete.
 *
 * It reuses the chat's recorder strip and bubble, so the two voice surfaces
 * cannot drift apart. The copy says plainly that the intro is public the
 * moment it is saved — that is the launch decision, and people deserve to
 * know it before they speak.
 */
export function VoiceIntroEditor({ userId }: Props) {
  const { theme, t } = useBinderTheme();
  const [intro, setIntro] = useState<VoiceIntro | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [playerKey, setPlayerKey] = useState(0);

  useEffect(() => {
    let active = true;
    loadMyVoiceIntro(userId)
      .then((loaded) => { if (active) setIntro(loaded); })
      .catch(() => { /* the section simply offers recording */ });
    return () => { active = false; };
  }, [userId]);

  async function finishRecording(localUri: string, durationMs: number) {
    setRecording(false);
    setBusy(true);
    setError('');
    try {
      setIntro(await saveVoiceIntro(userId, localUri, durationMs));
      setPlayerKey((value) => value + 1);
    } catch (cause) {
      classifyError(cause);
      setError(t('identity.voiceIntro.saveFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!intro || busy) return;
    setBusy(true);
    setError('');
    try {
      await removeVoiceIntro(intro);
      setIntro(null);
    } catch {
      setError(t('identity.voiceIntro.deleteFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.x3 }}>
      <View>
        <BinderText variant="micro" tone="muted">{t('identity.voiceIntro.title')}</BinderText>
        <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{t('identity.voiceIntro.copy')}</BinderText>
      </View>
      {recording ? (
        <View style={{ flexDirection: 'row' }}>
          <VoiceRecorderBar
            onFinished={(uri, durationMs) => void finishRecording(uri, durationMs)}
            onCancel={() => setRecording(false)}
            onPermissionDenied={() => { setRecording(false); Alert.alert(t('chat.voice.permissionTitle'), t('chat.voice.permissionBody')); }}
          />
        </View>
      ) : intro ? (
        <View style={{ gap: theme.spacing.x3 }}>
          <View style={{ padding: theme.spacing.x3, borderRadius: theme.radii.control, borderWidth: 1, borderColor: theme.colors.borderSubtle, backgroundColor: theme.colors.surfaceElevated }}>
            <VoiceMessageBubble key={playerKey} messageId={`my-intro-${playerKey}`} audioPath={intro.path} durationMs={intro.durationMs} mine={false} bucket="profile-voice" />
          </View>
          <View style={{ flexDirection: 'row', gap: theme.spacing.x2 }}>
            <BinderButton label={t('identity.voiceIntro.replace')} variant="secondary" fullWidth={false} disabled={busy} onPress={() => setRecording(true)} style={{ flex: 1 }} />
            <BinderButton label={t('identity.voiceIntro.delete')} variant="ghost" fullWidth={false} disabled={busy} onPress={() => void remove()} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <BinderButton label={t('identity.voiceIntro.record')} variant="secondary" loading={busy} onPress={() => setRecording(true)} />
      )}
      {error ? <BinderText variant="caption" tone="destructive" accessibilityLiveRegion="assertive">{error}</BinderText> : null}
    </View>
  );
}
