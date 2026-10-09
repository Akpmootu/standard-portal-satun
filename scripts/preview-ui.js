// Credential-free, loopback-only UI preview. Deliberately never loads .env or .secrets.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
const port=Number(process.env.DEMO_PORT || 3001);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('INVALID_DEMO_PORT');
const config=readConfig({APP_ORIGIN:`http://127.0.0.1:${port}`,SESSION_KEY_HEX:randomBytes(32).toString('hex')});
const noData={table:async()=>{throw new Error('DEMO_HAS_NO_DATA_ACCESS');}};
const server=createServer(createApp(config,{store:noData,login:{}}));
server.on('error',()=>{console.error('UI preview could not start. Check whether the loopback port is in use.');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic UI preview: http://127.0.0.1:${port}/demo/dashboard`));
