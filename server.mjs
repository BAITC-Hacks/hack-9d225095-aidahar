import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {parseCatalog,recommend} from './dist/engine.mjs';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const source=process.env.CATALOG_FILE || resolve(root,'catalog.jsonl');
const catalogText=await readFile(source,'utf8');
const catalog=parseCatalog(catalogText,source);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.jsonl':'application/x-ndjson; charset=utf-8'};
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/api/recommend' && req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){send(res,413,{error:'Слишком большой запрос.'});return}}
   try{send(res,200,recommend(catalog,JSON.parse(body)))}catch(e){send(res,400,{error:e.message})}return;
  }
  if(!['GET','HEAD'].includes(req.method)){send(res,405,{error:'Метод не поддерживается.'});return}
  if(url.pathname==='/api/health'){send(res,200,{status:'ok',profiles:catalog.length});return}
  if(url.pathname==='/catalog.jsonl'){res.writeHead(200,{'Content-Type':types['.jsonl']});res.end(req.method==='HEAD'?undefined:catalog.map(p=>JSON.stringify(p)).join('\n'));return}
  const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){send(res,403,{error:'Доступ запрещён.'});return}
  let data;try{data=await readFile(path)}catch{send(res,404,{error:'Не найдено.'});return}
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);
 }catch{send(res,500,{error:'Не удалось обработать запрос.'})}
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${server.address().port} (${catalog.length} профилей)`));
