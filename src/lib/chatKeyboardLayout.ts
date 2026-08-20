// How much room the keyboard actually takes from the conversation.
//
// The screen already carries the system's bottom inset — the gesture bar or the
// three-button navigation bar — as padding around everything. When the keyboard
// opens it covers that bar, so padding the conversation by the keyboard's full
// height adds the inset a second time and parks the composer a finger's width
// above the keys. On a phone with the three-button bar that gap was 48dp of
// nothing between the text field and the keyboard.

/**
 * @param keyboardHeight the animated height from the keyboard controller,
 *   which is negative while the keyboard is out and 0 when it is away.
 * @param bottomInset the safe-area inset the screen is already padded with.
 */
export function conversationKeyboardPadding(keyboardHeight: number, bottomInset: number): number {
  // Runs inside useAnimatedStyle, i.e. on the UI runtime: without the marker
  // the animation calls a JS function synchronously and the process dies with
  // "Tried to synchronously call a Remote Function".
  'worklet';
  const covered = Math.max(0, -keyboardHeight);
  // Once the keyboard is taller than the bar it hides it, so that padding is
  // already paid for. A keyboard shorter than the inset (mid-animation) must
  // never push the composer down.
  return Math.max(0, covered - bottomInset);
}
