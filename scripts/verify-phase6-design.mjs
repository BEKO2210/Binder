import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const required = [
  'src/theme/tokens.ts',
  'src/theme/ThemeProvider.tsx',
  'src/components/ui/BinderText.tsx',
  'src/components/ui/BinderIcon.tsx',
  'src/components/ui/BinderButton.tsx',
  'src/components/ui/BinderCard.tsx',
  'src/components/ui/BinderInput.tsx',
  'src/components/ui/ScreenState.tsx',
];
const failures = [];
for (const file of required) if (!existsSync(file)) failures.push(`missing Phase 6 design primitive: ${file}`);

// The runtime palette moved into colorTokens.ts (tokens.ts re-exports it), so
// the contract is checked against both files rather than against a stale path.
const tokenSource = ['src/theme/tokens.ts', 'src/theme/colorTokens.ts']
  .filter((path) => existsSync(path))
  .map((path) => readFileSync(path, 'utf8'))
  .join('\n');
for (const semantic of ['accentPrimary', 'warning', 'destructive']) {
  if (semantic === 'accentPrimary' && !tokenSource.includes("accent: '#C7FF4A'")) failures.push('Binder Lime accent token missing');
  if (semantic !== 'accentPrimary' && !tokenSource.includes(semantic)) failures.push(`semantic token missing: ${semantic}`);
}

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

const productionFiles = [...filesUnder('src/screens'), ...filesUnder('src/components')]
  .filter((path) => /\.(ts|tsx)$/.test(path));
const rawColorPattern = /#[0-9A-Fa-f]{3,8}\b/g;
const rawControlGlyphPattern = /[♥×✕✖⚙🔔🎨🗑]/u;
for (const file of productionFiles) {
  const source = readFileSync(file, 'utf8');
  const colors = source.match(rawColorPattern) ?? [];
  if (colors.length > 0) failures.push(`${file}: raw color literals remain (${[...new Set(colors)].join(', ')})`);
  if (rawControlGlyphPattern.test(source)) failures.push(`${file}: raw Unicode/emoji control glyph remains`);
}

const iconSource = existsSync('src/components/ui/BinderIcon.tsx') ? readFileSync('src/components/ui/BinderIcon.tsx', 'utf8') : '';
if (!iconSource.includes('minWidth: 48') || !iconSource.includes('minHeight: 48')) failures.push('icon-button minimum 48dp hit target is not enforced');
if (!iconSource.includes('accessibilityLabel')) failures.push('icon-only control accessibility label contract missing');

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Binder Phase 6 design-system contract PASS');
