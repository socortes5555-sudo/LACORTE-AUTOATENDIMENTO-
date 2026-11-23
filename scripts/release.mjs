import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const pages=['index.html','cliente/index.html','barbeiros.html','equipe/index.html'];
const files=readdirSync(root).filter(path=>/\.(js|css|webmanifest)$/.test(path)).concat(pages,
 'cliente/service-worker.js','equipe/service-worker.js','cliente/manifest.webmanifest','equipe/manifest.webmanifest').sort();
const assetFiles=(dir)=>readdirSync(resolve(root,dir),{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?assetFiles(dir+'/'+entry.name):[dir+'/'+entry.name]);
const normalize=text=>text.replace(/connect-src (?!'self')/,"connect-src 'self' " ).replace(/^.*<meta name="lacorte-release"[^>]+>\n/gm,'').replace(/([?&]v=)[^"'\s<>]+/g,'$1RELEASE');
// Hash each file independently before combining the sorted manifest. This keeps
// the release fingerprint deterministic while avoiding one large concatenated buffer.
const entries=[];
for(const path of files){
 const content=normalize(readFileSync(resolve(root,path),'utf8'));
 entries.push(path+'\0'+createHash('sha256').update(content).digest('hex')+'\0');
}
for(const path of assetFiles('assets').sort()){
 entries.push(path+'\0'+createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')+'\0');
}
const version=createHash('sha256').update(entries.join('')).digest('hex').slice(0,16);
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
