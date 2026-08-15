#!/usr/bin/env node
/**
 * Pulls the app's SQLite database off a connected Android device.
 *
 *   npm run db:pull            -> ./tempo.db (+ WAL sidecars)
 *   npm run db:pull -- out.db
 *
 * Requires a development build (`npm run android:build`): `run-as` only works
 * on a debuggable APK, so this cannot reach the database inside Expo Go.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const PACKAGE = 'com.coachlander.tempo';
const REMOTE_DIR = 'files/SQLite';
const DB = 'tempo.db';

const out = resolve(process.argv[2] ?? DB);

const adb = (args, encoding = 'utf8') =>
  execFileSync('adb', args, { encoding, maxBuffer: 256 * 1024 * 1024 });

function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

const devices = spawnSync('adb', ['devices'], { encoding: 'utf8' });
if (devices.error) fail('No se encontró `adb`. Instalá las platform-tools de Android.');

const connected = devices.stdout
  .split('\n')
  .slice(1)
  .filter((line) => line.trim().endsWith('device'));
if (connected.length === 0) fail('No hay ningún dispositivo o emulador conectado.');

// The -wal sidecar holds writes that have not been checkpointed yet, so a
// database pulled without it can be missing the most recent sets.
for (const suffix of ['', '-wal', '-shm']) {
  const remote = `${REMOTE_DIR}/${DB}${suffix}`;
  const target = `${out}${suffix}`;

  const exists = spawnSync('adb', ['shell', 'run-as', PACKAGE, 'ls', remote], {
    encoding: 'utf8',
  });
  if (exists.status !== 0 || /No such file/i.test(exists.stdout + exists.stderr)) {
    if (suffix === '') {
      fail(
        `No se pudo leer ${remote} en ${PACKAGE}.\n` +
          '  Abrí la app al menos una vez y usá un development build\n' +
          '  (npm run android:build) — run-as no funciona con Expo Go.',
      );
    }
    continue;
  }

  writeFileSync(target, adb(['exec-out', 'run-as', PACKAGE, 'cat', remote], 'buffer'));
  console.log(`✓ ${basename(target)}`);
}

console.log(`\nListo. Abrilo con:  sqlite3 ${basename(out)}`);
