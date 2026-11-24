// Throwaway prototype runner. Neither mode contacts LINE or a database.
import {spawn} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(process.argv[2]==='dev'){
 const child=spawn(process.execPath,[resolve(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5181'],{cwd:root,stdio:'inherit',env:{...process.env,VITE_APP_MODE:'mock',VITE_DUTY_DESK_PROTOTYPE:'true',VITE_BASE_PATH:'/'}});
 child.on('exit',code=>process.exit(code??0));
}else{
 const result=await build({stdin:{contents:"import {mount} from './src/DutyDesk.prototype';mount();",resolveDir:root,loader:'tsx'},outfile:resolve(root,'.local/prototype/duty-desk-prototype.js'),bundle:true,format:'iife',platform:'browser',write:false,minify:true,loader:{'.png':'dataurl'},define:{'import.meta.env.DEV':'true','process.env.NODE_ENV':'"production"'}});
 const js=result.outputFiles.find(f=>f.path.endsWith('.js')||f.path==='<stdout>')?.text||result.outputFiles.find(f=>!f.path.endsWith('.css')).text;
 const css=(await readFile(resolve(root,'src/style.css'),'utf8'))+'\n'+(await readFile(resolve(root,'src/refinements.css'),'utf8'))+'\n'+(await readFile(resolve(root,'src/DutyDesk.prototype.css'),'utf8'));
 const html='<!doctype html><html lang="zh-Hant"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>值班工作台｜3 種版面原型</title><style>'+css.replace(/<\/style/gi,'<\\/style')+'</style><div id="root"></div><script>'+js.replace(/<\/script/gi,'<\\/script')+'</script></html>';
 const destination=resolve(root,'.local/prototype');await mkdir(destination,{recursive:true});await writeFile(resolve(destination,'duty-desk-prototype.html'),html);console.log('已建立 .local/prototype/duty-desk-prototype.html；雙擊開啟，底部切換 A／B／C。');
}
