import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dest=path.join(root,'apps/web/public/vision');
await mkdir(path.join(dest,'wasm'),{recursive:true});
let source=path.join(root,'node_modules/@mediapipe/tasks-vision/wasm');
try{await readdir(source);}catch{source=path.join(root,'apps/web/node_modules/@mediapipe/tasks-vision/wasm');}
const hashes={};
for(const name of await readdir(source)){if(!/\.(js|wasm)$/.test(name))continue;await copyFile(path.join(source,name),path.join(dest,'wasm',name));hashes['wasm/'+name]=createHash('sha256').update(await readFile(path.join(dest,'wasm',name))).digest('hex');}
const url='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const model=await fetch(url);if(!model.ok)throw new Error('Model download failed: '+model.status);
const bytes=Buffer.from(await model.arrayBuffer());const sha=createHash('sha256').update(bytes).digest('hex');
const lockPath=path.join(root,'integrations/vision-assets.lock.json');
let existing;try{existing=JSON.parse(await readFile(lockPath,'utf8'));}catch{}
if(existing&&existing.model_sha256!==sha)throw new Error('Model hash mismatch; review upstream before updating the lock.');
await writeFile(path.join(dest,'face_landmarker.task'),bytes);
await writeFile(lockPath,JSON.stringify({model_url:url,model_sha256:sha,model_version:1,wasm_sha256:hashes},null,2)+'\n');
console.log('本机视觉模型与 WASM 已安装，SHA-256 已记录。');
