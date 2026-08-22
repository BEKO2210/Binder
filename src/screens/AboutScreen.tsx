import Constants from 'expo-constants';
import { memo, useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { BinderCard, BinderScreenHeader, BinderText, SectionHeader } from '../components/ui';
import { MotionPressable as Pressable } from '../components/ui';
import { DELETE_ACCOUNT_URL, PRIVACY_URL, TERMS_URL, openBinderUrl } from '../lib/safety';
import { useBinderTheme } from '../theme/ThemeProvider';

type Props = { onClose: () => void };

// Legal identity of the product. The Impressum block is a German statutory
// document and therefore stays in German — § 5 DDG requires it in German
// whatever language the interface is in. What does follow the app language is
// the line that says so: a person reading Binder in Korean should be told why
// the next paragraph is not in Korean, in Korean. Everything else on the
// screen is translated as usual.
export default function AboutScreen({ onClose }: Props) {
  const { theme, t } = useBinderTheme();
  const version = Constants.expoConfig?.version ?? '';
  const [linkError, setLinkError] = useState('');
  const openPolicy = useCallback((url: string) => {
    void openBinderUrl(url).then(() => setLinkError('')).catch(() => setLinkError(t('about.errors.openPage')));
  }, [t]);
  const openTerms = useCallback(() => openPolicy(TERMS_URL), [openPolicy]);
  const openPrivacy = useCallback(() => openPolicy(PRIVACY_URL), [openPolicy]);
  const openDeletion = useCallback(() => openPolicy(DELETE_ACCOUNT_URL), [openPolicy]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.canvas }}>
      <BinderScreenHeader title={t('about.header.title')} leading={{ icon: 'back', accessibilityLabel: t('about.accessibility.backToProfile'), onPress: onClose }} />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: theme.spacing.screen, paddingTop: theme.spacing.x5, paddingBottom: theme.spacing.x16 }}>
      <SectionHeader title={t('about.intro.title')} copy={t('about.intro.copy')} />

      <BinderCard style={{ marginTop: theme.spacing.x6 }}>
        <BinderText variant="micro" tone="muted">IMPRESSUM · ANGABEN GEMÄSS § 5 DDG</BinderText>
        {/* The block below is German because the law says so. Somebody reading
            the app in Korean deserves to be told that, in Korean, rather than
            meeting a wall of a language they did not choose. */}
        <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x2 }}>{t('about.imprint.note')}</BinderText>
        <BinderText variant="title" style={{ marginTop: theme.spacing.x3 }}>Belkis Aslani</BinderText>
        <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x2 }}>Vogelsangstraße 32{'\n'}71691 Freiberg am Neckar{'\n'}Deutschland</BinderText>
        <BinderText variant="body" tone="secondary" style={{ marginTop: theme.spacing.x3 }}>Kontakt: nullmesh@protonmail.com</BinderText>
        <BinderText variant="caption" tone="muted" style={{ marginTop: theme.spacing.x4 }}>Binder ist ein kostenloses, werbefreies Angebot ohne kommerziellen Zweck. Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV: Belkis Aslani, Anschrift wie oben.</BinderText>
      </BinderCard>

      <BinderCard style={{ marginTop: theme.spacing.x4 }}>
        <BinderText variant="micro" tone="muted">{t('about.policies.eyebrow')}</BinderText>
        <View style={{ marginTop: theme.spacing.x2 }}>
          <PolicyLink label={t('about.policies.terms')} onPress={openTerms} />
          <PolicyLink label={t('about.policies.privacy')} onPress={openPrivacy} />
          <PolicyLink label={t('about.policies.deletion')} onPress={openDeletion} />
        </View>
        {linkError ? <BinderText variant="caption" tone="destructive" style={{ marginTop: theme.spacing.x2 }}>{linkError}</BinderText> : null}
      </BinderCard>

      {version ? <BinderText variant="caption" tone="muted" align="center" style={{ marginTop: theme.spacing.x6 }}>{t('about.version', { version })}</BinderText> : null}
      </ScrollView>
    </View>
  );
}

const PolicyLink = memo(function PolicyLink({ label, onPress }: { label: string; onPress: () => void }) {
  const { theme } = useBinderTheme();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => ({ minHeight: theme.layout.controlHeight, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: theme.colors.borderSubtle, backgroundColor: pressed ? theme.colors.surfacePressed : theme.colors.transparent })}>
      <BinderText variant="label" tone="secondary">{label}</BinderText>
    </Pressable>
  );
});
