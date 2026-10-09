import { createServer } from 'node:http';
import { readConfig, loadLocalEnvironment } from './config.js';
import { createApp } from './app.js';

try {
  const env = await loadLocalEnvironment();
  const config = readConfig(env);
  const port = Number(env.PORT || 3000);
  const server = createServer(createApp(config));
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.listen(port, '127.0.0.1', () => console.log(`${config.writer.enabled?'MOU write':'Read-only'} staging: http://127.0.0.1:${port}`));
} catch { console.error('STARTUP_FAILED: check local configuration without sharing secrets.'); process.exitCode = 1; }
