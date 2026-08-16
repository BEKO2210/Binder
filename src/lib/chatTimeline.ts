// Pure chat timeline shaping: bubble grouping, timestamp placement and day
// separators. No React Native imports — runs under node:test.

export type TimelineMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
};

export type TimelineItem<M extends TimelineMessage> =
  | { type: 'day'; id: string; label: string }
  | {
      type: 'message';
      id: string;
      message: M;
      // Grouped bubbles sit tight together and share a flat inner corner.
      groupedWithPrevious: boolean;
      // The last bubble of a group carries the time caption.
      showsTimestamp: boolean;
    };

const GROUP_WINDOW_MS = 5 * 60 * 1000;

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function dayLabel(iso: string, reference: Date = new Date()): string {
  const key = dayKey(iso);
  const todayKey = reference.toISOString().slice(0, 10);
  const yesterday = new Date(reference.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  if (key === todayKey) return 'Today';
  if (key === yesterdayKey) return 'Yesterday';
  const date = new Date(`${key}T00:00:00Z`);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export function timeLabel(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// Input ascending by created_at; output ascending with day separators and
// grouping flags resolved.
export function buildChatTimeline<M extends TimelineMessage>(messages: M[], reference: Date = new Date()): TimelineItem<M>[] {
  const items: TimelineItem<M>[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message) continue;
    const previous = index > 0 ? messages[index - 1] : undefined;
    const next = index < messages.length - 1 ? messages[index + 1] : undefined;

    if (!previous || dayKey(previous.created_at) !== dayKey(message.created_at)) {
      items.push({ type: 'day', id: `day-${dayKey(message.created_at)}`, label: dayLabel(message.created_at, reference) });
    }

    const groupedWithPrevious = Boolean(
      previous
      && previous.sender_id === message.sender_id
      && dayKey(previous.created_at) === dayKey(message.created_at)
      && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() <= GROUP_WINDOW_MS,
    );
    const groupedWithNext = Boolean(
      next
      && next.sender_id === message.sender_id
      && dayKey(next.created_at) === dayKey(message.created_at)
      && new Date(next.created_at).getTime() - new Date(message.created_at).getTime() <= GROUP_WINDOW_MS,
    );

    items.push({
      type: 'message',
      id: message.id,
      message,
      groupedWithPrevious,
      showsTimestamp: !groupedWithNext,
    });
  }
  return items;
}
