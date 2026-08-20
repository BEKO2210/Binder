// English through a local binding. The gate only looked at literals sitting
// directly in a JSX attribute, so moving the sentence one line up hid it.
import { BinderButton } from '../../../src/components/ui';

export function DangerRow() {
  const deleteLabel = 'Delete account';
  return <BinderButton label={deleteLabel} />;
}
