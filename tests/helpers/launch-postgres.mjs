import { spawnSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// No database URL is accepted. Only a local Unix-socket Docker daemon and an
// owned, network-isolated container can be used; no app database is cloned.
export function launchPostgres() {
  const name = `veylo-launch-test-${randomUUID()}`;
  const context = spawnSync('docker', ['context', 'inspect'], { encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL' });
  if (context.status !== 0) throw new Error(`Local Docker required: ${context.stderr}`);
  const endpoint = process.env.DOCKER_HOST || JSON.parse(context.stdout)[0].Endpoints.docker.Host;
  if (!endpoint.startsWith('unix://')) throw new Error('Refusing non-local Docker endpoint');
  const docker = (...args) => {
    const result = spawnSync('docker', ['--host', endpoint, ...args], { encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL' });
    if (result.status !== 0) throw new Error(`Docker failed: ${result.stderr || result.error}`);
    return result.stdout.trim();
  };
  const args = ['--host', endpoint, 'exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'];
  const sql = (query) => {
    const result = spawnSync('docker', args, { input: query, encoding: 'utf8', timeout: 30000, killSignal: 'SIGKILL' });
    if (result.status !== 0) throw new Error(result.stderr || String(result.error));
    return result.stdout.trim();
  };
  const asyncSql = (query) => new Promise((resolve, reject) => {
    const child = spawn('docker', args);
    let out = '', err = '';
    let settled = false, failure, escalation, settlement;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline); clearTimeout(escalation); clearTimeout(settlement);
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      child.unref();
      if (error) reject(error); else resolve(value);
    };
    const stop = error => {
      if (settled || failure) return;
      failure = error;
      // Signal only this spawned transport child, never a group or container.
      child.kill('SIGTERM');
      escalation = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        settlement = setTimeout(() => finish(failure), 1000);
      }, 1000);
    };
    const deadline = setTimeout(() => stop(new Error('Fixture process deadline exceeded')), 30000);
    child.stdout.on('data', b => { out += b; });
    child.stderr.on('data', b => { err += b; });
    child.on('error', stop);
    child.stdin.on('error', stop);
    child.on('close', code => finish(failure || (code === 0 ? null : new Error(err || 'Fixture process failed')), out.trim()));
    child.stdin.end(query);
  });
  let owned = false;
  return {
    name, sql, asyncSql,
    async start() {
      docker('run', '--pull=never', '--detach', '--name', name, '--label', 'veylo.launch-test=true',
        '--network', 'none', '--user', 'postgres', '--entrypoint', '/bin/sh',
        'public.ecr.aws/supabase/postgres:17.6.1.134', '-c',
        'initdb -D /tmp/launch-pg -U postgres --auth=trust >/tmp/launch-init.log && exec postgres -D /tmp/launch-pg -k /tmp -c listen_addresses=');
      owned = true;
      // Explicit local socket, independent of the image's inherited defaults.
      args.push('-h', '/tmp');
      for (let i = 0; i < 100; i++) {
        try { sql('select 1'); return; } catch { await new Promise(r => setTimeout(r, 100)); }
      }
      throw new Error(`PostgreSQL did not start: ${docker('logs', name)}`);
    },
    cleanup() {
      if (owned) {
        docker('rm', '--force', '--volumes', name);
        owned = false;
        console.log(`Cleaned owned fixture container ${name}`);
      }
    },
  };
}
