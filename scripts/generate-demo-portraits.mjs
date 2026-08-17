// Portraits for the store shoot.
//
// The people in a listing screenshot must look real without being real: using a
// photograph of an actual person as a fictional dating profile is the one use a
// stock licence does not cover, and it is not something to do to someone. These
// portraits are generated, so nobody's likeness is presented as a user.
//
//   node scripts/generate-demo-portraits.mjs docs/demo-profiles.json out-dir
//
// The API key is read from the vault at runtime and never written anywhere.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [manifestPath, outDir] = process.argv.slice(2);
if (!manifestPath || !outDir) {
  console.error('usage: generate-demo-portraits.mjs <manifest.json> <output-dir>');
  process.exit(2);
}

const key = execFileSync(`${process.env.HOME}/.local/bin/vault`, ['get', 'OPEN_AI_API'], { encoding: 'utf8' }).trim();
if (!key) throw new Error('No API key in the vault.');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
mkdirSync(outDir, { recursive: true });

for (const profile of manifest.profiles) {
  for (const [index, prompt] of (profile.portraitPrompts ?? []).entries()) {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: `${prompt}. Photorealistic amateur phone photograph, natural light, candid, slightly imperfect framing, no text, no watermark, vertical portrait orientation.`,
        size: '1024x1536',
        quality: 'medium',
        n: 1,
      }),
    });
    const body = await response.json();
    const base64 = body.data?.[0]?.b64_json;
    if (!base64) throw new Error(`No image returned: ${JSON.stringify(body).slice(0, 300)}`);
    const file = join(outDir, `${profile.firstName.toLowerCase()}-${index + 1}.png`);
    writeFileSync(file, Buffer.from(base64, 'base64'));
    console.log(file);
  }
}
