// Type declarations for two expo-symbols internals BinderIcon reuses.
//
// Its public SymbolView renders the Android glyph as a <Text> that follows the
// system font scale, which clips every icon at 200 % (run 040). Drawing the
// same font and codepoint ourselves with scaling off is the fix, and these are
// the two helpers that make that possible. The module's export map does not
// cover them for TypeScript, so the shapes are pinned here — against the exact
// version in the lockfile.
declare module 'expo-symbols/build/android' {
  export function androidSymbolToString(symbol: string | null): string | null;
}

declare module 'expo-symbols/build/utils' {
  export function getFont(weight: unknown): { name: string; font: number };
}
