import {existsSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
export const root=path.dirname(fileURLToPath(import.meta.url));
if(existsSync(path.join(root,'.env')))loadEnvFile(path.join(root,'.env'));
export const config={
 backend:process.env.QA_BACKEND||'demo',port:Number(process.env.PORT||8780),
 fastModel:process.env.QA_FAST_MODEL||'',secondaryModel:process.env.QA_SECONDARY_MODEL||'',
 fastEffort:process.env.QA_FAST_EFFORT||'',secondaryEffort:process.env.QA_SECONDARY_EFFORT||'',
 codexBin:process.env.CODEX_BIN||'codex',
 whisperBin:process.env.WHISPER_BIN||'',whisperModel:process.env.WHISPER_MODEL||''
};
if(!['demo','codex'].includes(config.backend))throw Error('QA_BACKEND must be demo or codex');
if(!Number.isInteger(config.port)||config.port<1||config.port>65535)throw Error('PORT must be 1–65535');
