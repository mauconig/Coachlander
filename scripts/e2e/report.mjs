import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { artifactRoot, requireRunId, saveArtifact } from './common.mjs';

async function readJson(name) {
  try { return JSON.parse(await readFile(resolve(artifactRoot, requireRunId(), name), 'utf8')); }
  catch { return null; }
}

async function main() {
  const fixture = await readJson('fixture.json');
  const api = await readJson('api-results.json');
  const before = await readJson('before.json');
  const after = await readJson('after.json');
  const files = await readdir(resolve(artifactRoot, requireRunId())).catch(() => []);
  const beforeCounts = before?.counts ?? null;
  const afterCounts = after?.counts ?? null;
  const protectedCountsStable = Boolean(
    beforeCounts && afterCounts && Object.keys(beforeCounts).every((key) => beforeCounts[key] === afterCounts[key]),
  );
  const report = {
    runId: requireRunId(),
    generatedAt: new Date().toISOString(),
    fixture,
    api,
    database: { before, after, protectedCountsStable },
    artifacts: files,
    passed: Boolean(api?.results?.every((item) => item.status === 'passed')) && (after ? protectedCountsStable : true),
  };
  await saveArtifact('report.json', report);
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
