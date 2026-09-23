import {readFile} from 'node:fs/promises';
import {parseCatalog,recommend} from './dist/engine.mjs';
const path=process.env.CATALOG_FILE || new URL('./dist/catalog.jsonl',import.meta.url);
const data=parseCatalog(await readFile(path,'utf8'),String(path));
const base={city:'Алматы',date:'2026-11-14',event_format:'корпоратив',category:'Ведущий',budget:1200000,hours:4,language:'русский',wishes:'интеллигентный атмосферный'};
for(const [name,patch] of [['Плотная категория',{}],['Другая дата',{date:'2026-11-15'}],['Редкая категория',{category:'Флорист',budget:250000}],['Нет совпадений',{budget:50000}],['Категории нет',{category:'Отель'}],['Площадки',{category:'Банкетный зал'}]]){
 const start=performance.now(),r=recommend(data,{...base,...patch});
 console.log(`\n${name} · ${r.status} · ${(performance.now()-start).toFixed(2)} мс\n${r.message}`);
 r.cards.forEach(c=>console.log(`  ${c.name} [${c.id}]: ${c.explanation}`));
 r.suggestions.forEach(s=>console.log(`  ${s}`));
}
