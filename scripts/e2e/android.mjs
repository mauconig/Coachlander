import { resolve } from 'node:path';

import { projectRoot, requireRunId, runProcess, saveArtifact } from './common.mjs';

const allowedFlows = new Set([
  'session-complete.yaml',
  'session-stop.yaml',
  'session-cancel.yaml',
  'session-resume.yaml',
]);

async function main() {
  const requested = process.argv[2] ?? 'session-complete.yaml';
  if (!allowedFlows.has(requested)) {
    throw new Error(`Flujo Maestro no permitido: ${requested}`);
  }
  requireRunId();
  const flow = resolve(projectRoot, 'e2e', 'maestro', requested);
  let result;
  try {
    result = await runProcess('maestro', ['test', flow]);
    console.log(`Maestro pasó: ${requested}`);
  } finally {
    try {
      const logcat = await runProcess('adb', ['logcat', '-d', '-v', 'time']);
      const trace = logcat.stdout
        .split(/\r?\n/)
        .filter((line) => line.includes('Coachlander E2E API') || line.includes('E2E'))
        .join('\n');
      await saveArtifact(`android-${requested.replace('.yaml', '')}-trace.log`, trace);
    } catch (error) {
      await saveArtifact(`android-${requested.replace('.yaml', '')}-trace-error.txt`, String(error));
    }
  }
  await saveArtifact(`maestro-${requested.replace('.yaml', '')}.log`, `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
