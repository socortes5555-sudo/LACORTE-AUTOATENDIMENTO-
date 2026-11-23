import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pages=['index.html','cliente/index.html','barbeiros.html','equipe/index.html'];
const files=readdirSync(root).filter(path=>/\.(js|css|webmanifest)$/.test(path)).concat(pages,
 'cliente/service-worker.js','equipe/service-worker.js','cliente/manifest.webmanifest','equipe/manifest.webmanifest').sort();
const assetFiles=(dir)=>readdirSync(resolve(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?assetFiles(dir+'/'+entry.name):[dir+'/'+entry.name]);
const normalize=text=>text.replace(/connect-src (?!'self')/,"connect-src 'self' " ).replace(/^.*<meta name="lacorte-release"[^>]+>\n/gm,'').replace(/([?&]v=)[^"'\s<>]+/g,'$1RELEASE');
// FNV-1a 64-bit is used only as a cache-busting fingerprint, never as a security token.
const fingerprint=value=>{
 const bytes=typeof value==='string'?Buffer.from(value,'utf8'):value;
 let hash=0xcbf29ce484222325n;
 for(const byte of bytes)hash=BigInt.asUintN(64,(hash^BigInt(byte))*0x100000001b3n);
 return hash.toString(16).padStart(16,'0');
};
const entries=[];
for(const path of files){
 const content=normalize(readFileSync(resolve(root,path),'utf8'));
 entries.push(path+'\0'+fingerprint(content)+'\0');
}
for(const path of assetFiles('assets').sort()){
 entries.push(path+'\0'+fingerprint(readFileSync(resolve(root,path)))+'\0');
}
const version=fingerprint(entries.join(''));
const outputs=new Map();
for(const path of pages){
 let text=normalize(readFileSync(resolve(root,path),'utf8'));
 text=text.replace(/connect-src (?!'self')/,"connect-src 'self' ");
 text=text.replace('<meta charset="utf-8">','<meta charset="utf-8">\n  <meta name="lacorte-release" content="'+version+'">');
 text=text.replace(/([?&]v=)RELEASE/g,'$1'+version);
 outputs.set(path,text);
}
outputs.set('version.json',JSON.stringify({version})+'\n');
let stale=false;
for(const [path,text] of outputs){
 let current;try{current=readFileSync(resolve(root,path),'utf8');}catch{}
 if(current!==text){stale=true;if(!process.argv.includes('--check'))writeFileSync(resolve(root,path),text);}
}
if(process.argv.includes('--check')&&stale){console.error('Atualize as quatro entradas do aplicativo: node scripts/release.mjs (versão esperada: '+version+')');process.exitCode=1;}
else console.log('LaCorte '+version+(stale?' sincronizada.':' atualizada.'));
