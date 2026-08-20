import { sendMessage } from '../lib/conversation';
import { withDeadline } from '../lib/reliability';

const CHAT_DEADLINE_MS = 12_000;

export async function send(matchId: string, clientId: string, body: string) {
  return await withDeadline(
    sendMessage(matchId, clientId, body),
    CHAT_DEADLINE_MS,
  );
}
