import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, copyFileSync, chmodSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { launchPostgres } from './helpers/launch-postgres.mjs';

test('fixture process transport settles normally, on failure and by an owned-child deadline', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'veylo-controlled-process-'));
  const originalPath = process.env.PATH, originalMarker = process.env.LAUNCH_PROCESS_TEST_PIDFILE;
  const marker = join(dir, 'owned.pid');
  copyFileSync(new URL('./helpers/controlled-docker.fixture', import.meta.url), join(dir, 'docker'));
  chmodSync(join(dir, 'docker'), 0o700);
  process.env.PATH = `${dir}:${originalPath}`;
  process.env.LAUNCH_PROCESS_TEST_PIDFILE = marker;
  try {
    await t.test('normal completion returns trimmed output', async () => {
      assert.equal(await launchPostgres().asyncSql('normal'), 'result');
    });
    await t.test('nonzero exit rejects and permits cleanup', async () => {
      await assert.rejects(launchPostgres().asyncSql('failure'), /controlled failure/);
    });
    for (const query of ['stall', 'ignore-term']) {
      await t.test(`${query} rejects at the deadline and terminates only its owned child`, async t => {
        const db = launchPostgres();
        t.mock.timers.enable({ apis: ['setTimeout'] });
        const pending = db.asyncSql(query).then(value => ({ value }), error => ({ error }));
        let pid;
        try {
          for (let n = 0; n < 100 && !existsSync(marker); n++) await pause(5);
          assert.equal(existsSync(marker), true, 'controlled child is ready');
          pid = Number(readFileSync(marker, 'utf8'));
          t.mock.timers.tick(30000);
          await pause(20);
          t.mock.timers.tick(1000); // bounded TERM grace, then KILL
          await pause(20);
          t.mock.timers.tick(1000); // settle even if transport never closes
          const result = await Promise.race([pending, pause(100).then(() => ({ stranded: true }))]);
          assert.equal(result.stranded, undefined, 'deadline must settle asyncSql so finally can run');
          assert.match(result.error?.message ?? '', /deadline/i);
          assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, 'owned child has exited');
        } finally {
          t.mock.timers.reset();
          if (pid) { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
          rmSync(marker, { force: true });
        }
      });
    }
    await t.test('spawn failure rejects without stranding cleanup', async () => {
      const db = launchPostgres();
      rmSync(join(dir, 'docker'));
      process.env.PATH = dir;
      await assert.rejects(db.asyncSql('normal'), /ENOENT/);
    });
  } finally {
    process.env.PATH = originalPath;
    if (originalMarker === undefined) delete process.env.LAUNCH_PROCESS_TEST_PIDFILE;
    else process.env.LAUNCH_PROCESS_TEST_PIDFILE = originalMarker;
    rmSync(dir, { recursive: true });
  }
});
