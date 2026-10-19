import { pathToFileURL } from 'node:url';
import { consolidateLaunchList, createConsolidationClient } from '../lib/consolidate-launch-list.mjs';

// No .env loading, interactive approval, issuer, disposal, or send mode.
export async function runCli(argv, { client, env = process.env, stdout = s => process.stdout.write(s) } = {}) {
  try {
    const options = {}, seen = new Set();
    const selectors = { '--project-ref': 'expectedProjectRef', '--expected-scope': 'expectedScopeHash',
      '--approval-ref': 'approvalRef', '--source-commit': 'expectedSourceCommit' };
    for (let i = 0; i < argv.length; i++) {
      const flag = argv[i];
      if (seen.has(flag)) throw Error();
      seen.add(flag);
      if (flag === '--apply') options.approvedApply = true;
      else {
        if (!Object.hasOwn(selectors, flag) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw Error();
        options[selectors[flag]] = argv[++i];
      }
    }
    if (options.approvedApply && Object.values(selectors).some(name => !options[name])) throw Error();
    const result = await consolidateLaunchList({ ...options, client: client ?? createConsolidationClient({ env }) });
    stdout(`${JSON.stringify(result)}\n`);
    return 0;
  } catch {
    stdout(`${JSON.stringify({ schemaVersion: 1, outcome: 'unavailable' })}\n`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli(process.argv.slice(2));
}
