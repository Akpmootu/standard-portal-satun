import { readConfig, loadLocalEnvironment } from '../src/config.js';
import { googleStore } from '../src/google-store.js';

try {
  const result = await googleStore(readConfig(await loadLocalEnvironment())).verifyResources();
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(error.code || 'GOOGLE_SETUP_REQUIRED');
  process.exitCode = 1;
}
