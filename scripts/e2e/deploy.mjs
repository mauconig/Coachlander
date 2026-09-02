import { runProcess, dbTarget, projectRoot, saveArtifact } from './common.mjs';

const remoteProject = process.env.E2E_REMOTE_PROJECT ?? '/opt/coachlander';

async function main() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const backup = `backend/.deploy-backup-e2e-${stamp}`;
  await runProcess('ssh', [dbTarget, `cd ${remoteProject} && mkdir -p ${backup} && cp backend/src/server.mjs ${backup}/server.mjs && cp backend/db/schema.sql ${backup}/schema.sql && cp docker-compose.yml ${backup}/docker-compose.yml`]);
  await runProcess('scp', ['backend/src/server.mjs', `${dbTarget}:${remoteProject}/backend/src/server.mjs`], { cwd: projectRoot });
  await runProcess('scp', ['backend/db/schema.sql', `${dbTarget}:${remoteProject}/backend/db/schema.sql`], { cwd: projectRoot });
  await runProcess('scp', ['backend/package.json', `${dbTarget}:${remoteProject}/backend/package.json`], { cwd: projectRoot });
  await runProcess('scp', ['backend/package-lock.json', `${dbTarget}:${remoteProject}/backend/package-lock.json`], { cwd: projectRoot });
  await runProcess('scp', ['docker-compose.yml', `${dbTarget}:${remoteProject}/docker-compose.yml`], { cwd: projectRoot });
  const build = await runProcess('ssh', [dbTarget, `cd ${remoteProject} && E2E_TRACE_ENABLED=true docker compose up -d --build coachlander-api`]);
  await saveArtifact('deploy.txt', `${build.stdout}\n${build.stderr}`);
  console.log(`API E2E desplegado. Backup remoto: ${backup}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
