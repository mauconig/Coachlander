import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const artifactRoot = resolve(projectRoot, 'e2e-artifacts');
export const runId = process.env.E2E_RUN_ID?.trim();
export const apiUrl = (process.env.E2E_API_URL ?? process.env.EXPO_PUBLIC_API_URL ?? 'https://coachlander.147-93-180-120.sslip.io').replace(/\/$/, '');
export const dbTarget = process.env.E2E_DB_TARGET ?? 'vps';
export const dbContainer = process.env.E2E_DB_CONTAINER ?? 'coachlander-db';
export const dbName = process.env.E2E_DB_NAME ?? 'coachlander';
export const dbUser = process.env.E2E_DB_USER ?? 'coachlander';

export function requireRunId() {
  if (!runId || !/^[A-Za-z0-9][A-Za-z0-9._-]{2,119}$/.test(runId)) {
    throw new Error('Definí E2E_RUN_ID con letras, números, guiones, puntos o guiones bajos.');
  }
  return runId;
}

export function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta la variable E2E ${name}`);
  return value;
}

export function fixturePath() {
  requireRunId();
  return resolve(artifactRoot, runId, 'fixture.json');
}

export async function saveArtifact(name, value) {
  requireRunId();
  const path = resolve(artifactRoot, runId, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return path;
}

export async function loadFixture() {
  return JSON.parse(await readFile(fixturePath(), 'utf8'));
}

export function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function sqlArray(values) {
  return `ARRAY[${values.map(sqlString).join(', ')}]::text[]`;
}

export async function runProcess(command, args, { input = '', cwd = projectRoot } = {}) {
  return new Promise((resolveProcess, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${command} ${args.join(' ')} failed with ${code}: ${stderr || stdout}`));
        return;
      }
      resolveProcess({ stdout, stderr });
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

export async function remotePsql(sql, { tuples = false } = {}) {
  const args = [
    dbTarget,
    `docker exec -i ${dbContainer} psql -X -v ON_ERROR_STOP=1 -U ${dbUser} -d ${dbName}${tuples ? " -At -F '|'" : ''}`,
  ];
  const result = await runProcess('ssh', args, { input: sql });
  return result.stdout.trim();
}

export async function queryRows(sql) {
  const output = await remotePsql(sql, { tuples: true });
  if (!output) return [];
  return output.split(/\r?\n/).map((line) => line.split('|'));
}

export async function apiRequest(path, { token, method = 'GET', body, expected } = {}) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (runId) headers['X-E2E-Run-Id'] = runId;
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try { payload = await response.json(); } catch { /* non-JSON response */ }
  if (expected !== undefined && ![].concat(expected).includes(response.status)) {
    throw new Error(`${method} ${path}: esperaba ${expected}, recibió ${response.status}: ${JSON.stringify(payload)}`);
  }
  return { status: response.status, body: payload };
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertEqual(actual, expected, message) {
  assert(actual === expected, `${message}. Esperado: ${expected}; recibido: ${actual}`);
}
