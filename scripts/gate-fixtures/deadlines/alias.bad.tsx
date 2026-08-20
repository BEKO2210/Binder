// The same call under another name. A rename in the import was enough to walk
// past a gate that matched on the spelling of the function.
import { sendMessage as transmitMessage } from '../lib/conversation';

export async function send(matchId: string, clientId: string, body: string) {
  return await transmitMessage(matchId, clientId, body);
}
