import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile,cp,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))),source=path.join(root,'build/whisper-source'),commit='d1be6fde11ac6e0407606b4e42fe72d34add8037';
const run=(bin,args,opts={})=>{const r=spawnSync(bin,args,{stdio:'inherit',...opts});if(r.error)throw r.error;if(r.status)throw Error(bin+' failed '+r.status);};
try{await stat(path.join(source,'.git'));}catch{await mkdir(path.dirname(source),{recursive:true});run('git',['clone','--depth','1','--branch','v1.9.5','https://github.com/ggml-org/whisper.cpp.git',source]);}
const head=spawnSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).stdout.trim();if(head!==commit)throw Error('Whisper source commit mismatch');
const file=path.join(source,'examples/server/server.cpp');let cpp=await readFile(file,'utf8');
const original='    svr->set_default_headers({{"Server", "whisper.cpp"},\n                             {"Access-Control-Allow-Origin", "*"},\n                             {"Access-Control-Allow-Headers", "content-type, authorization"}});';
const replacement=`    // ReplyMate: this worker accepts only the local Node adapter, never browser origins.
    svr->set_pre_routing_handler([&](const Request &req, Response &res) {
        if (req.has_header("Origin") || req.get_header_value("Sec-Fetch-Site") == "cross-site" ||
            req.get_header_value("Host") != "127.0.0.1:" + std::to_string(sparams.port)) {
            res.status = 403; res.set_content("Forbidden", "text/plain");
            return httplib::Server::HandlerResponse::Handled;
        }
        return httplib::Server::HandlerResponse::Unhandled;
    });
    svr->set_default_headers({{"Server", "whisper.cpp"}});`;
if(cpp.includes(original)){cpp=cpp.replace(original,replacement);await writeFile(file,cpp);}else if(!cpp.includes(replacement))throw Error('Upstream worker boundary changed; re-review patch');
cpp=await readFile(file,'utf8');const errorMarker='        if (res.status == 400) {';const rejectMarker='        if (res.status == 403) { res.set_content("Forbidden", "text/plain"); } else if (res.status == 400) {';if(cpp.includes(errorMarker)){cpp=cpp.replace(errorMarker,rejectMarker);await writeFile(file,cpp);}
let cmake=process.env.CMAKE_BIN||'cmake';if(process.platform!=='win32'){const local=path.join(root,'build/tooling/bin/cmake');try{await stat(local);cmake=local;}catch{}}
const args=['-S',source,'-B',path.join(source,'build'),'-DCMAKE_BUILD_TYPE=Release','-DBUILD_SHARED_LIBS=OFF','-DWHISPER_BUILD_TESTS=OFF','-DWHISPER_CURL=OFF','-DGGML_NATIVE=OFF','-DGGML_OPENMP=OFF','-DGGML_METAL_EMBED_LIBRARY=ON'];
if(process.arch==='x64')args.push('-DGGML_AVX=OFF','-DGGML_AVX2=OFF','-DGGML_AVX512=OFF','-DGGML_FMA=OFF','-DGGML_F16C=OFF');
if(process.platform==='win32')args.push('-DCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded$<$<CONFIG:Debug>:Debug>');
run(cmake,args);run(cmake,['--build',path.join(source,'build'),'--config','Release','--target','whisper-server','--parallel','4']);
const out=path.join(root,'build/whisper-runtime');await mkdir(path.join(out,'bin'),{recursive:true});
let binary=path.join(source,'build/bin',process.platform==='win32'?'Release/whisper-server.exe':'whisper-server');await cp(binary,path.join(out,'bin',path.basename(binary)));await cp(path.join(source,'LICENSE'),path.join(out,'LICENSE'));await writeFile(path.join(out,'GGML-NOTICE.txt'),'ggml is distributed under the MIT license, see LICENSE. Upstream: https://github.com/ggml-org/ggml\n');
await mkdir(path.join(out,'licenses'),{recursive:true});await cp(path.join(source,'examples/server/httplib.h'),path.join(out,'licenses/httplib.h'));await cp(path.join(source,'examples/json.hpp'),path.join(out,'licenses/json.hpp'));await cp(path.join(source,'examples/stb_vorbis.c'),path.join(out,'licenses/stb_vorbis.c'));
await writeFile(path.join(out,'SOURCE.json'),JSON.stringify({tag:'v1.9.5',commit,patch:'Reject all Origin and cross-site requests; require loopback Host. CORS wildcard removed.',build:args.filter(s=>s.startsWith('-D')),platform:process.platform,arch:process.arch},null,2)+'\n');
console.log('Whisper engine built:',out);
