import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

let handler;
export default async function main(req, res) {
  try {
    // Explicit release gate: this foundation is not a migrated production application.
    if (process.env.ALLOW_PUBLIC_STAGING !== '1') {
      res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end('{"error":"PUBLIC_STAGING_DISABLED"}');
    }
    handler ||= createApp(readConfig(process.env));
    return await handler(req, res);
  } catch {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end('{"error":"CONFIGURATION_REQUIRED"}');
  }
}
