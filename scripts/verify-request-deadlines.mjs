// A request that never answers is worse than one that fails. A failure reaches
// the screen; silence keeps a loading state, a spinning button or a disabled
// control on screen forever, and every one of those was found that way on the
// device rather than in a test: the deck's "Wird gespeichert…" for seventy
// seconds, the celebration's CTA, the legal gate before that.
//
// So: every awaited network call inside a screen or a component carries a
// deadline. A call that deliberately does not may say so on the line above with
//
//   // no-deadline: <reason>
//
// which is a decision somebody wrote down, not an omission.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/screens', 'src/components'];

// What counts as a call that leaves the phone. Everything here either talks to
// Supabase directly or is a thin wrapper in src/lib that does.
const NETWORK_CALLS = [
  /\bsupabase\.(from|rpc|auth|storage|functions)\b/,
  /\b(fetchDiscoveryBatch|countDiscoveryCandidates|loadDiscoveryPreferences|loadAttributeFilterCount|recordDecision|refreshDiscoveryLocation)\s*\(/,
  /\b(fetchMatches|fetchMessagesPage|sendMessage|markMatchRead|unmatch|blockUser|reportMessage|reportUser)\s*\(/,
  /\b(listMyProfileMedia|addProfileImage|removeProfileImage|reorderProfileMedia|uploadVoiceRecording|signedVoiceUrl)\s*\(/,
  /\b(fetchPartnerProfile|reportAndBlockDiscoveryProfile|loadSafetyNotice|acceptCurrentLegalGate|loadLegalGateWithDeadline)\s*\(/,
  /\b(getBetaSettings|setBetaDiagnostics|submitBetaFeedback|deleteCurrentAccount)\s*\(/,
  /\b(saveVoiceIntro|removeVoiceIntro|refreshPushRegistration|updateNotificationPreferences)\s*\(/,
];

function sourceFiles(directory) {
  const entries = readdirSync(directory);
  return entries.flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') || path.endsWith('.ts') ? [path] : [];
  });
}

const violations = [];

for (const root of ROOTS) {
  for (const file of sourceFiles(root)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (!line.includes('await ')) return;
      if (!NETWORK_CALLS.some((pattern) => pattern.test(line))) return;
      if (line.includes('withDeadline(')) return;
      const previous = lines[index - 1] ?? '';
      if (previous.includes('no-deadline:')) return;
      violations.push(`${file}:${index + 1}  ${line.trim().slice(0, 120)}`);
    });
  }
}

if (violations.length > 0) {
  console.error(`Requests without a deadline (${violations.length}):`);
  for (const violation of violations) console.error(`  ${violation}`);
  console.error('\nWrap the call in withDeadline(...), or write "// no-deadline: <reason>" above it.');
  process.exit(1);
}

console.log('Every awaited request in a screen or component carries a deadline.');
