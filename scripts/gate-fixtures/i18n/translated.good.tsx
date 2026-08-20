import { BinderButton } from '../../../src/components/ui';

export function Row({ t }: { t: (key: string) => string }) {
  const label = t('profileSettings.actions.saveProfile');
  return <BinderButton label={label} />;
}
