import assert from 'node:assert/strict';
import { test } from 'node:test';

import { destructiveConfirmationActions } from '../src/lib/destructiveConfirmationPolicy.ts';

test('destructive confirmations always put cancel before the destructive action', () => {
  let confirmed = false;
  const actions = destructiveConfirmationActions('Cancel', 'Delete', () => { confirmed = true; });

  assert.deepEqual(actions.map(({ text, style }) => ({ text, style })), [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive' },
  ]);
  actions[1]?.onPress?.();
  assert.equal(confirmed, true);
});
