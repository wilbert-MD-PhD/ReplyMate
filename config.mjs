import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root=path.dirname(fileURLToPath(import.meta.url));
if(existsSync(path.join(root,'.env')))loadEnvFile(path.join(root,'.env'));
export const dataDir=process.env.REPLYMATE_DATA_DIR||path.join(root,'user-data');
export const config={
 backend:process.env.QA_BACKEND||'demo',port:Number(process.env.PORT||8780),
 fastModel:process.env.QA_FAST_MODEL||'',secondaryModel:process.env.QA_SECONDARY_MODEL||'',
 fastEffort:process.env.QA_FAST_EFFORT||'',secondaryEffort:process.env.QA_SECONDARY_EFFORT||'',
 codexBin:process.env.CODEX_BIN||'codex',codexHome:process.env.REPLYMATE_CODEX_HOME||'',desktop:process.env.REPLYMATE_DESKTOP==='1',
 whisperBin:process.env.WHISPER_BIN||'',whisperModel:process.env.WHISPER_MODEL||''
};
if(!['demo','codex','auto'].includes(config.backend))throw Error('QA_BACKEND must be demo, codex or auto');
if(!Number.isInteger(config.port)||config.port<0||config.port>65535)throw Error('PORT must be 0–65535');
