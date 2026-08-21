// A copy of the database that does not live in the database.
//
// The project runs on Supabase's free plan, and the free plan has no scheduled
// backups: the backups endpoint answers with an empty list, and point-in-time
// recovery is a paid feature. So today the only copy of every account, match and
// conversation is the one Supabase holds. A dropped table, a bad migration or a
// closed account would take it with no way back.
//
// This writes two dumps — the schema and the data — compresses them, and keeps
// the last fourteen. It runs against the linked project with the credentials the
// Supabase CLI already has; no password passes through this file.
//
//   node scripts/backup-database.mjs             into ~/binder-backups
//   BINDER_BACKUP_DIR=/mnt/x node scripts/...    somewhere else
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const root = process.env.BINDER_BACKUP_DIR ?? join(homedir(), 'binder-backups');
const KEEP = 14;
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = join(root, stamp);
mkdirSync(target, { recursive: true });

function dump(name, extra, minimumBytes = 1024) {
  const file = join(target, name);
  execFileSync('supabase', ['db', 'dump', '--linked', ...extra, '-f', file], { stdio: 'inherit' });
  const bytes = statSync(file).size;
  // Roles are three lines on a project with no custom roles; the other two are
  // the ones where an empty file would mean a silent loss.
  if (bytes < minimumBytes) throw new Error(`${name} came back with ${bytes} bytes — that is not a backup.`);
  execFileSync('gzip', ['-9', file]);
  const compressed = `${file}.gz`;
  return { name: `${name}.gz`, bytes: statSync(compressed).size, sha256: createHash('sha256').update(readFileSync(compressed)).digest('hex') };
}

const files = [
  dump('schema.sql', []),
  dump('data.sql', ['--data-only']),
  dump('roles.sql', ['--role-only'], 64),
];

// What a restore needs to know, next to the files it needs.
writeFileSync(join(target, 'MANIFEST.json'), `${JSON.stringify({
  takenAt: new Date().toISOString(),
  project: readFileSync('supabase/.temp/project-ref', 'utf8').trim(),
  commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  files,
  restore: [
    'supabase db reset --linked   # or a fresh project',
    'psql "$DB_URL" -f roles.sql',
    'psql "$DB_URL" -f schema.sql',
    'psql "$DB_URL" -f data.sql',
  ],
}, null, 2)}\n`);

// Fourteen nights. Older ones go, or the disk fills up quietly and the backup
// that matters is the one that failed to write.
const kept = readdirSync(root).filter((entry) => /^\d{4}-\d{2}-\d{2}T/.test(entry)).sort();
for (const old of kept.slice(0, Math.max(0, kept.length - KEEP))) {
  rmSync(join(root, old), { recursive: true, force: true });
}

const total = files.reduce((sum, file) => sum + file.bytes, 0);
console.log(`Backup in ${target} — ${files.map((f) => f.name).join(', ')}, ${(total / 1048576).toFixed(2)} MiB, ${kept.length} kept.`);
