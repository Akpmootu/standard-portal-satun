import { randomBytes } from 'node:crypto';
import { privateDirectory, saveNewPrivateJson } from './private-files.js';

try {
  await privateDirectory();
  try { await saveNewPrivateJson('local-session.json', { key: randomBytes(32).toString('hex') }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  console.log('Private local configuration is ready. Existing keys were preserved.');
  console.log('Save downloaded OAuth JSON files in .secrets/google-login-client.json and .secrets/google-storage-client.json.');
} catch { console.error('SETUP_FAILED: private directory permissions must be fixed before adding credentials.'); process.exitCode = 1; }
