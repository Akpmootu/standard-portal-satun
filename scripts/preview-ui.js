import {page} from '../src/page.js';
// Credential-free, loopback-only UI preview. Deliberately never loads .env or .secrets.
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import {overviewPage} from '../src/overview-page.js';
import { createApp } from '../src/app.js';
import { readConfig } from '../src/config.js';
const port=Number(process.env.DEMO_PORT || 3001);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('INVALID_DEMO_PORT');
const config=readConfig({APP_ORIGIN:`http://127.0.0.1:${port}`,SESSION_KEY_HEX:randomBytes(32).toString('hex')});
const noData={table:async()=>{throw new Error('DEMO_HAS_NO_DATA_ACCESS');}};
const app=createApp(config,{store:noData,login:{}});
const server=createServer((req,res)=>{
 if(req.method==='GET'&&req.url==='/demo/login'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"});
  return res.end(page({loginConfigured:true,storageConfigured:true,writeEnabled:true}));
 }
 if(req.method==='GET'&&req.url==='/demo/overview'){
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  return res.end(overviewPage({role:'admin',year:2570,modules:[{module:'mou',units:74,total:2812,records:1100,completed:924,approved:700,pending:180,rejected:44},{module:'ctam',units:6,total:102,records:102,completed:86,approved:78,pending:6,rejected:2},{module:'hait',units:6,total:264,records:120,completed:102,approved:80,pending:18,rejected:4}]}).replace('<main id="main" class="portal-main">','<main id="main" class="portal-main"><p class="demo-banner">ตัวอย่างสำหรับตรวจ UI · ข้อมูลสมมติ ไม่เชื่อมข้อมูลจริง</p>'));
 }
 return app(req,res);
});
server.on('error',()=>{console.error('UI preview could not start. Check whether the loopback port is in use.');process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`Synthetic UI preview: http://127.0.0.1:${port}/demo/dashboard`));


