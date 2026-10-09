import {readConfig,loadLocalEnvironment} from '../src/config.js';
import {googleStore} from '../src/google-store.js';
import {diagnoseMouRead} from '../src/mou-read-diagnostic.js';

try {
  const report=await diagnoseMouRead(googleStore(readConfig(await loadLocalEnvironment())));
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=1;
} catch {
  console.error('MOU_DIAGNOSTIC_PRIVATE_CONFIG_UNAVAILABLE: run in your normal terminal; no credentials printed.');
  process.exitCode=1;
}
