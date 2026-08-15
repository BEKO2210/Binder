import { readFile } from 'node:fs/promises';

const source = (await readFile(new URL('../App.tsx', import.meta.url), 'utf8')).trim();
const expected = "export { default } from './src/Root';";

if (source !== expected) {
  console.error('App.tsx must export src/Root so Auth and onboarding cannot be bypassed.');
  console.error(`Expected: ${expected}`);
  console.error(`Actual:   ${source}`);
  process.exit(1);
}

console.log('PASS: App.tsx routes through src/Root.');
