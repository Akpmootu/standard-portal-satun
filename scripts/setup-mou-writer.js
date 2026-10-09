// Run in the owner's normal PowerShell. Never prints the signing secret.
import {createInterface} from 'node:readline/promises';
import {randomBytes} from 'node:crypto';
import {saveNewPrivateJson} from './private-files.js';
const prompt=createInterface({input:process.stdin,output:process.stdout});
try{
  const url=(await prompt.question('Apps Script deployment URL (https://script.google.com/macros/s/.../exec): ')).trim();
  if(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(url))throw Error('INVALID_WRITER_URL');
  await saveNewPrivateJson('mou-writer.json',{url,secret:randomBytes(32).toString('hex')});
  console.log('Saved privately to .secrets/mou-writer.json. Copy its secret to the Apps Script MOU_WRITER_SECRET property yourself. Do not send it to chat. Writes remain disabled.');
}catch(error){console.error(error.message==='INVALID_WRITER_URL'?'INVALID_WRITER_URL':'WRITER_SETUP_FAILED: existing file or private-directory permissions need owner inspection; nothing was overwritten.');process.exitCode=1;}
finally{prompt.close();}
