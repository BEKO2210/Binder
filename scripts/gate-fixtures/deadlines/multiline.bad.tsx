// A network call whose arguments run onto the next lines. The line-based gate
// only ever looked at one line at a time, so "await sendMessage(" carried no
// recognisable call and the file passed.
import { sendMessage } from '../lib/conversation';

export async function send(matchId: string, clientId: string, body: string) {
  const confirmed = await sendMessage(
    matchId,
    clientId,
    body,
  );
  return confirmed;
}
