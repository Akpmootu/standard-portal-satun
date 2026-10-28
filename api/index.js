import {sendPortalError} from '../src/error-page.js';
import {randomUUID} from 'node:crypto';
import {securityEvents} from '../src/security-events.js';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

let handler;
const security=securityEvents();
export default async function main(req, res) {
  const requestId=randomUUID();
  const unavailable=code=>{res.setHeader('X-Portal-Request-Id',requestId);security.record({requestId,code,status:503,method:req.method});return sendPortalError(req,res,{code,path:(req.url||'').split('?')[0]});};
  try {
    // Explicit release gate: this foundation is not a migrated production application.
    if (process.env.ALLOW_PUBLIC_STAGING !== '1') {
      return unavailable('PUBLIC_STAGING_DISABLED');
    }
    handler ||= createApp(readConfig(process.env));
    return await handler(req, res);
  } catch {
    return unavailable('CONFIGURATION_REQUIRED');
  }
}
