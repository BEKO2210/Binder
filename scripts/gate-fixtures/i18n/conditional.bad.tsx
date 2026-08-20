// English through a conditional expression in the prop itself.
import { BinderButton } from '../../../src/components/ui';

export function Row({ busy }: { busy: boolean }) {
  return <BinderButton label={busy ? 'Saving your profile' : 'Save profile'} />;
}
