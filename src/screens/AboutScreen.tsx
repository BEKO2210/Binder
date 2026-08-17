import Constants from 'expo-constants';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BinderCard, BinderScreenHeader, BinderText, SectionHeader } from '../components/ui';
import { MotionPressable as Pressable } from '../components/ui';
import { DELETE_ACCOUNT_URL, PRIVACY_URL, TERMS_URL, openBinderUrl } from '../lib/safety';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { onClose: () => void };

// Legal identity of the product. The Impressum block is a German statutory
// document and therefore stays in German; everything else follows app language.
export default function AboutScreen({ onClose }: Props) {
  const { theme } = useBinderTheme();
  const version = Constants.expoConfig?.version ?? '';
  const [linkError, setLinkError] = useState('');

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title="About Binder" leading={{ icon: 'back', accessibilityLabel: 'Back to profile', onPress: onClose }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x16 }}>
      <SectionHeader title="One free product." copy="Binder is built and run as an independent, non-commercial project. No ads, no paid tiers, no data brokers." />

      <BinderCard style={{ marginTop: theme.spacing.x6 }}>
        <BinderText variant="micro" tone="muted">IMPRESSUM · ANGABEN GEMÄSS § 5 DDG</BinderText>
        <BinderText variant="title" style={{ marginTop: theme.spacing.x3 }}>Belkis Aslani</BinderText>
        <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>Vogelsangstraße 32{'\n'}71691 Freiberg am Neckar{'\n'}Deutschland</BinderText>
        <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x3 }}>Kontakt: nullmesh@protonmail.com</BinderText>
        <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x4 }}>Binder ist ein kostenloses, werbefreies Angebot ohne kommerziellen Zweck. Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: Belkis Aslani, Anschrift wie oben.</BinderText>
      </BinderCard>

      <BinderCard style={{ marginTop: theme.spacing.x4 }}>
        <BinderText variant="micro" tone="muted">POLICIES</BinderText>
        <View style={{ marginTop: theme.spacing.x2 }}>
          <PolicyLink label="Terms & Community Rules" onPress={() => void openBinderUrl(TERMS_URL).then(() => setLinkError('')).catch(() => setLinkError('Could not open this page. Try again later.'))} />
          <PolicyLink label="Privacy Policy" onPress={() => void openBinderUrl(PRIVACY_URL).then(() => setLinkError('')).catch(() => setLinkError('Could not open this page. Try again later.'))} />
          <PolicyLink label="Account deletion & retention" onPress={() => void openBinderUrl(DELETE_ACCOUNT_URL).then(() => setLinkError('')).catch(() => setLinkError('Could not open this page. Try again later.'))} />
        </View>
        {linkError ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x2 }}>{linkError}</BinderText> : null}
      </BinderCard>

      {version ? <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x6 }}>Binder {version}</BinderText> : null}
      </ScrollView>
    </View>
  );
}

function PolicyLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => ({ minHeight: theme.layout.controlHeight, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.transparent })}>
      <BinderText variant="label" tone="secondary">{label}</BinderText>
    </Pressable>
  );
}
