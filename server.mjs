import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,sep} from 'node:path';
import {parseCatalog,recommend,validateProfiles} from './dist/engine.mjs';
import {createAI,AIError} from './ai.mjs';
const ai=createAI();
const rate=new Map();
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const source=process.env.CATALOG_FILE || resolve(root,'catalog.jsonl');
const catalogText=await readFile(source,'utf8');
const catalog=parseCatalog(catalogText,source);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.jsonl':'application/x-ndjson; charset=utf-8'};
const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data))};
const server=createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/ai/') && req.method==='POST'){
   const origin=req.headers.origin;
   if(origin && new URL(origin).host!==req.headers.host){send(res,403,{error:'Запрос разрешён только со страницы приложения.'});return}
   if(!req.headers['content-type']?.startsWith('application/json')){send(res,415,{error:'Нужен JSON.'});return}
   const ip=req.socket.remoteAddress,now=Date.now();
   for(const [key,v] of rate)if(v.until<now)rate.delete(key);
   const bucket=rate.get(ip)||{count:0,until:now+60000};bucket.count++;rate.set(ip,bucket);
   if(bucket.count>30){send(res,429,{error:'Слишком много AI-запросов. Подождите минуту.'});return}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>10*1024*1024){send(res,413,{error:'Максимальный размер — 10 МБ.'});return}}
   try{
    const input=JSON.parse(body);
    if(url.pathname==='/api/ai/brief'){
     send(res,200,await ai.parseBrief(input.brief,input.context||{},catalog));return;
    }
    if(url.pathname==='/api/ai/explain'){
     const profiles=input.catalog?validateProfiles(input.catalog):catalog;
     const result=recommend(profiles,input.query);
     try{const insights=await ai.explain(result,profiles);send(res,200,{result,ai:{status:insights.skipped?'skipped':'ready',...insights}})}
     catch(e){if(!(e instanceof AIError))throw e;send(res,200,{result,ai:{status:'unavailable',code:e.code,message:e.message}})}
     return;
    }
    send(res,404,{error:'Не найдено.'});
   }catch(e){send(res,e instanceof AIError?e.status:400,{error:e.message,code:e.code||'invalid_request'})}return;
  }
  if(url.pathname==='/api/recommend' && req.method==='POST'){
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){send(res,413,{error:'Слишком большой запрос.'});return}}
   try{send(res,200,recommend(catalog,JSON.parse(body)))}catch(e){send(res,400,{error:e.message})}return;
  }
  if(!['GET','HEAD'].includes(req.method)){send(res,405,{error:'Метод не поддерживается.'});return}
  if(url.pathname==='/api/health'){send(res,200,{status:'ok',profiles:catalog.length});return}
  if(url.pathname==='/api/ai/config'){send(res,200,ai.config());return}
  if(url.pathname==='/catalog.jsonl'){res.writeHead(200,{'Content-Type':types['.jsonl']});res.end(req.method==='HEAD'?undefined:catalog.map(p=>JSON.stringify(p)).join('\n'));return}
  const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){send(res,403,{error:'Доступ запрещён.'});return}
  let data;try{data=await readFile(path)}catch{send(res,404,{error:'Не найдено.'});return}
  res.writeHead(200,{
   'Content-Type':types[extname(path)]||'application/octet-stream',
   'X-Content-Type-Options':'nosniff',
   // The local hackathon build changes often; stale ES modules can keep old import rules alive.
   'Cache-Control':'no-store'
  });res.end(req.method==='HEAD'?undefined:data);
 }catch{send(res,500,{error:'Не удалось обработать запрос.'})}
});
const host=process.env.HOST||'127.0.0.1';
server.listen(Number(process.env.PORT||4173),host,()=>console.log(`Local: http://${host}:${server.address().port} (${catalog.length} профилей)`));
