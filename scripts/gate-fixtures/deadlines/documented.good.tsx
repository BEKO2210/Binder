import { sendMessage } from '../lib/conversation';

export async function send(matchId: string, clientId: string, body: string) {
  // no-deadline: the caller owns the timeout for this one and cancels it itself.
  return await sendMessage(matchId, clientId, body);
}
