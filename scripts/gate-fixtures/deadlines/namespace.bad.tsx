// Reached through a namespace import instead of a named one.
import * as conversation from '../lib/conversation';

export async function send(matchId: string, clientId: string, body: string) {
  return await conversation.sendMessage(matchId, clientId, body);
}
