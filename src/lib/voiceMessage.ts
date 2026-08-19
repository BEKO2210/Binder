// Pure voice-message logic, shared by the composer, the bubble and the tests.
// The server enforces the same bounds through messages_payload_coupling.

export const VOICE_MIN_DURATION_MS = 1000;
export const VOICE_MAX_DURATION_MS = 60000;

/** The storage path send_message's guard will accept: match/sender/file. */
export function voiceObjectPath(matchId: string, senderId: string, fileId: string): string {
  return `${matchId}/${senderId}/${fileId}.m4a`;
}

/**
 * What leaving the app in the middle of a take means for that take.
 *
 * The recorder kept running when the app went to the background: the strip
 * counted on, but the microphone is not ours once another app is in front, so
 * the counter and the recording drifted apart — seventy-five seconds away came
 * back as eleven seconds of audio. And the one-minute cap finishes a take by
 * sending it, so a phone in a pocket could post a minute of nothing by itself.
 *
 * Leaving therefore stops the recorder. What is already recorded is kept and
 * waits for a deliberate tap, unless it is too short to be a message at all.
 */
export function interruptedTakeAction(durationMs: number): 'keep' | 'discard' {
  return recordingStopDecision(durationMs) === 'ready' ? 'keep' : 'discard';
}

/** What stopping the recorder at this duration means. */
export function recordingStopDecision(durationMs: number): 'too-short' | 'ready' {
  return durationMs < VOICE_MIN_DURATION_MS ? 'too-short' : 'ready';
}

/** 37200ms → "0:37"; 61 minutes cannot happen, the cap is one minute. */
export function formatVoiceDuration(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Deterministic bar heights for the bubble's waveform, seeded by the message
 * id. This is presentation, not analysis: the same message always draws the
 * same shape, two messages draw different ones, and no amplitude pipeline is
 * needed for that promise.
 */
export function waveformHeights(seed: string, bars: number): number[] {
  let state = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    state ^= seed.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  const heights: number[] = [];
  for (let index = 0; index < bars; index += 1) {
    state ^= state << 13; state |= 0;
    state ^= state >>> 17;
    state ^= state << 5; state |= 0;
    const unit = ((state >>> 0) % 1000) / 1000;
    heights.push(0.25 + unit * 0.75);
  }
  return heights;
}
