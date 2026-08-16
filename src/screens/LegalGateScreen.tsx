import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { BinderBrand, BinderButton, BinderCard, BinderIcon, BinderText, SectionHeader } from '../components/ui';
import { PRIVACY_URL, TERMS_URL, acceptCurrentLegalGate, openBinderUrl, type LegalGate } from '../lib/safety';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { gate: LegalGate; onAccepted: () => void };

export default function LegalGateScreen({ gate, onAccepted }: Props) {
  const { theme } = useBinderTheme();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function open(url: string) {
    setError('');
    try { await openBinderUrl(url); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this page.'); }
  }

  async function accept() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError('');
    try { await acceptCurrentLegalGate(gate); onAccepted(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save your acceptance.'); }
    finally { setBusy(false); }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.canvas }} contentContainerStyle={{ paddingTop: theme.spacing.x5, paddingHorizontal: theme.spacing.screen, paddingBottom: theme.spacing.x16 }}>
      <BinderBrand />
      <View style={{ marginTop: theme.spacing.x8 }}>
        <SectionHeader eyebrow="BEFORE YOU CREATE OR SHARE" title="Clear rules before conversation." copy="Binder is 18+ and built around mutual choice. Before you create a profile, upload a photo or send a message, accept the current Terms & Community Rules and Privacy Policy." />
      </View>
      <View style={{ gap: theme.spacing.x3, marginTop: theme.spacing.x6 }}>
        <PolicyCard index="01" icon="legal" title="Terms & Community Rules" copy="18+ only · consent · no harassment · no sexual exploitation · no impersonation, scams or block evasion." version={gate.terms_version} onPress={() => void open(TERMS_URL)} />
        <PolicyCard index="02" icon="privacy" title="Privacy Policy" copy="What Binder stores, why location stays private, how safety records work and how to delete your account." version={gate.privacy_version} onPress={() => void open(PRIVACY_URL)} />
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }} onPress={() => setConfirmed((value) => !value)} style={({ pressed }) => ({ marginTop: theme.spacing.x5, flexDirection: 'row', gap: theme.spacing.x3, padding: theme.spacing.x4, borderRadius: theme.radii.control, borderWidth: 1, borderColor: confirmed ? theme.accent.accent : theme.colors.borderStrong, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface })}>
        <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: confirmed ? theme.accent.accent : theme.colors.borderStrong, backgroundColor: confirmed ? theme.accent.accent : 'transparent', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {confirmed ? <BinderIcon name="check" size={17} color={theme.accent.foreground} /> : null}
        </View>
        <BinderText variant="label" tone="secondary" style={{ flex: 1 }}>I have read and agree to the current Terms & Community Rules and Privacy Policy.</BinderText>
      </Pressable>
      {error ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x4 }}>{error}</BinderText> : null}
      <BinderButton label="Agree & continue" loading={busy} disabled={!confirmed} onPress={() => void accept()} style={{ marginTop: theme.spacing.x5 }} />
      <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x4 }}>There is no skip. Material policy changes can require a new acceptance before more UGC is created.</BinderText>
    </ScrollView>
  );
}

function PolicyCard({ index, icon, title, copy, version, onPress }: { index: string; icon: 'legal' | 'privacy'; title: string; copy: string; version: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress}>
      {({ pressed }) => (
        <BinderCard style={{ backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.surface }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.x3 }}><BinderIcon name={icon} size={22} color={theme.accent.accent} /><BinderText variant="micro" tone="muted">{index}</BinderText></View>
            <BinderIcon name="chevronRight" size={22} color={theme.colors.textMuted} />
          </View>
          <BinderText variant="title" style={{ marginTop: theme.spacing.x5 }}>{title}</BinderText>
          <BinderText variant="caption" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>{copy}</BinderText>
          <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x3 }}>Version {version}</BinderText>
        </BinderCard>
      )}
    </Pressable>
  );
}
