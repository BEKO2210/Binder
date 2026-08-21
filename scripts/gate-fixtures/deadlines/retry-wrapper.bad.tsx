// withRetry looks like protection and is not: it retries a call that settles, so
// a first attempt that never settles is never retried. abortable without a
// signal returns the promise unchanged. Both used to count as a deadline.
import { withRetry, abortable } from '../lib/reliability';
import { sendMessage } from '../lib/conversation';

export async function send(matchId: string, clientId: string, body: string) {
  await withRetry(() => sendMessage(matchId, clientId, body));
  await abortable(sendMessage(matchId, clientId, body));
}
