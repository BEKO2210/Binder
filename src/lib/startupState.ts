// What a full-screen start-up read should be showing right now.
//
// Two of these reads had no ceiling and could wait forever; they have deadlines
// now, and a deadline needs somewhere to go. The mistake worth avoiding is
// letting that failure become a screen of its own: it would then outrank a
// password recovery, a legal gate, or a session that arrived one second after
// the deadline expired. A failed read is only allowed to speak where the
// loading state it replaces would have spoken, and only while that read still
// has no answer.
//
// This module imports nothing so it can run directly under node:test.
export type StartupPhase = 'loading' | 'failed' | 'ready';

export function startupPhase(hasAnswer: boolean, failed: boolean): StartupPhase {
  // An answer always wins, however late it arrives. A deadline says "stop
  // waiting", never "ignore what came back".
  if (hasAnswer) return 'ready';
  return failed ? 'failed' : 'loading';
}
