import {spawn} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
if(existsSync('.env')){for(const line of readFileSync('.env','utf8').split('\n')){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2].replace(/^['"]|['"]$/g,'');}}
const python=path.join(root,'.venv',process.platform==='win32'?'Scripts/python.exe':'bin/python');
if(!existsSync(python)){console.error('请先运行安装步骤，创建 .venv 并安装后端依赖。');process.exit(1);}
process.env.API_INTERNAL_URL ||= 'http://127.0.0.1:'+(process.env.API_PORT||'18000');
const children=[spawn(python,['-m','uvicorn','study.main:app','--app-dir','services/api','--host','127.0.0.1','--port',process.env.API_PORT||'18000'],{stdio:'inherit',env:process.env}),spawn(process.platform==='win32'?'npm.cmd':'npm',['run','dev','-w','apps/web','--','--port',process.env.WEB_PORT||'3000'],{stdio:'inherit',env:process.env})];
let stopping=false;function stop(){if(stopping)return;stopping=true;children.forEach(p=>p.kill('SIGTERM'));}
process.on('SIGINT',stop);process.on('SIGTERM',stop);children.forEach(p=>p.on('exit',code=>{stop();process.exitCode=code||process.exitCode||0;}));
