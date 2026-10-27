import {sendPortalError} from '../src/error-page.js';
import { readConfig } from '../src/config.js';
import { createApp } from '../src/app.js';

let handler;
export default async function main(req, res) {
  try {
    // Explicit release gate: this foundation is not a migrated production application.
    if (process.env.ALLOW_PUBLIC_STAGING !== '1') {
      return sendPortalError(req,res,{code:'PUBLIC_STAGING_DISABLED',path:(req.url||'').split('?')[0]});
    }
    handler ||= createApp(readConfig(process.env));
    return await handler(req, res);
  } catch {
    return sendPortalError(req,res,{code:'CONFIGURATION_REQUIRED',path:(req.url||'').split('?')[0]});
  }
}
