// A request handed to .then() instead of awaited. The gate started its search at
// `await`, so this whole shape was invisible — and a settings screen really did
// keep a spinner on screen forever when the answer never came.
import { sendMessage } from '../lib/conversation';

export function send(matchId: string, clientId: string, body: string) {
  sendMessage(matchId, clientId, body)
    .then(() => undefined)
    .catch(() => undefined)
    .finally(() => undefined);
}
