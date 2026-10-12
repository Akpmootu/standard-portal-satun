import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {referenceSshArgs} from './reference-ssh-options.js';
import {privateDirectory,saveNewPrivateJson} from './private-files.js';
try{
 const php="<?php $p='/var/www/html/digital_stn/hait-RG12/config.php';if(!is_file($p))exit(1);echo base64_encode(file_get_contents($p));";
 const result=spawnSync(resolve(process.env.SystemRoot,'System32/OpenSSH/ssh.exe'),referenceSshArgs('administrator','C:/Users/user/.ssh/id_rsa'),{input:php,encoding:'utf8',timeout:30000,windowsHide:true,maxBuffer:1024*1024});if(result.status!==0)throw Error('READ_FAILED');
 const source=Buffer.from(result.stdout.trim(),'base64').toString('utf8');
 const pick=name=>{const m=source.match(new RegExp("define\\(\\s*['\"]"+name+"['\"]\\s*,\\s*(['\"])([^'\"\\r\\n]+)\\1\\s*\\)"));return m?.[2]||'';};
 const data={mistralKey:pick('MISTRAL_API_KEY'),telegramToken:pick('TELEGRAM_BOT_TOKEN'),telegramChatId:pick('TELEGRAM_CHAT_ID'),migratedAt:new Date().toISOString()};
 if(!data.telegramToken||!data.telegramChatId)throw Error('MISSING_CONFIG');
 await privateDirectory();await saveNewPrivateJson('integrations.json',data);
 async function telegram(method,body){const r=await fetch('https://api.telegram.org/bot'+data.telegramToken+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});const value=await r.json();if(!r.ok||!value.ok)throw Error('BOT_CHECK_FAILED');return value.result;}
 const bot=await telegram('getMe',{}),chat=await telegram('getChat',{chat_id:data.telegramChatId});
 console.log(JSON.stringify({ok:true,mistralConfigured:Boolean(data.mistralKey),telegramConfigured:true,bot:bot.username,chatTitle:chat.title||chat.first_name||'',chatType:chat.type,messageSent:false}));
}catch{console.error('INTEGRATION_SETUP_FAILED: PRIVATE_DETAILS_HIDDEN');process.exitCode=1;}
