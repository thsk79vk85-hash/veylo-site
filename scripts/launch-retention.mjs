import { pathToFileURL } from 'node:url';
import { createLaunchRetentionClient } from '../lib/launch-retention-client.mjs';
import { processLaunchRetention } from '../lib/process-launch-retention.mjs';

// Offline only. No environment loading/target/credential/client injection route.
export async function runCli(argv,{stdout=s=>process.stdout.write(s)}={}){
  let limit=100;
  if(argv.length){
    if(argv.length!==2||argv[0]!=='--limit'||!/^(?:[1-9][0-9]?|100)$/.test(argv[1])){
      stdout(`${JSON.stringify({schemaVersion:1,state:'unavailable',reason:'invalid_arguments'})}\n`);return 1;
    }
    limit=Number(argv[1]);
  }
  const result=await processLaunchRetention({client:createLaunchRetentionClient(),limit});
  stdout(`${JSON.stringify(result)}\n`);return 0;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await runCli(process.argv.slice(2));
