import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAI,mergeBrief,validateInsights} from '../ai.mjs';
import {parseCatalog,recommend} from '../dist/engine.mjs';
const profiles=parseCatalog(await readFile(new URL('../dist/catalog.jsonl',import.meta.url),'utf8'));
const query={city:'Алматы',date:'2026-11-14',event_format:'корпоратив',category:'Ведущий',budget:1200000,hours:4,language:'русский',wishes:'интеллигентный атмосферный'};
const base=recommend(profiles,query);
const candidates=base.cards.map(c=>({...c,description:profiles.find(p=>p.id===c.id).description}));
const insight={comparison:{recommended_id:candidates[0].id,reason:'Предпочтителен для заданного сценария.',tradeoff:'Состав программы нужно уточнить.',alternatives:candidates.map(c=>({id:c.id,choose_when:'Важен описанный стиль.'}))},summary:'У кандидатов разные стили ведения.',cards:candidates.map(c=>({id:c.id,angle:'Особенность профиля',reason:'Стиль можно сопоставить с вашим брифом.',quote:c.evidence.quote,question:'Как вы адаптируете программу под нашу команду?'}))};
const parsed={is_event_request:true,city:'Алматы',date:'2026-11-14',event_format:'корпоратив',category:'Ведущий',budget:1200000,hours:null,language:null,wishes:'интеллигентный атмосферный',assumptions:[]};
const ok=value=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]})});

test('missing parameters are explicitly inherited from form',()=>{const r=mergeBrief(parsed,query);assert.equal(r.status,'ready');assert.deepEqual(r.inherited,['hours','language']);assert.equal(r.query.hours,4);assert.equal(r.extracted.hours,undefined)});
test('missing required fields do not invent a budget',()=>{const r=mergeBrief({...parsed,budget:null});assert.equal(r.status,'needs_input');assert.deepEqual(r.missing,['budget'])});
test('irrelevant brief and out-of-window date are rejected',()=>{assert.throws(()=>mergeBrief({...parsed,is_event_request:false}),/Опишите/);assert.throws(()=>mergeBrief({...parsed,date:'2027-01-01'},query),/Календари/)});
test('hallucinated quotes and unknown/duplicate IDs are rejected',()=>{
 assert.throws(()=>validateInsights({...insight,cards:insight.cards.map((c,i)=>i?c:{...c,quote:'Этот текст не существует в исходном профиле.'})},candidates),/цитатами/);
 assert.throws(()=>validateInsights({...insight,cards:insight.cards.map((c,i)=>i?c:{...c,id:'invented'})},candidates),/цитатами/);
 assert.throws(()=>validateInsights({...insight,cards:insight.cards.map(()=>insight.cards[0])},candidates),/цитатами/);
});
test('AI cannot reorder the shortlist',()=>{const r=validateInsights({...insight,cards:[...insight.cards].reverse()},candidates);assert.deepEqual(r.cards.map(c=>c.id),base.cards.map(c=>c.id))});
test('Responses API uses strict schema, store:false and server authorization; response cached',async()=>{
 let calls=0;const ai=createAI({apiKey:'test-secret',fetchImpl:async(url,opts)=>{calls++;assert.equal(url,'https://api.openai.com/v1/responses');assert.equal(opts.headers.Authorization,'Bearer test-secret');const body=JSON.parse(opts.body);assert.equal(body.store,false);assert.equal(body.text.format.strict,true);assert.equal(body.temperature,0);return ok(insight)}});
 const first=await ai.explain(base,profiles),second=await ai.explain(base,profiles);assert.equal(calls,1);assert.equal(first.cached,false);assert.equal(second.cached,true);assert.ok(!JSON.stringify(first).includes('test-secret'));assert.deepEqual(base.cards.map(c=>c.id),first.cards.map(c=>c.id));
});
test('parse cache includes form context and respects changed duration',async()=>{let calls=0;const ai=createAI({apiKey:'test',fetchImpl:async()=>{calls++;return ok(parsed)}});const a=await ai.parseBrief('Нужен ведущий на корпоратив',query,profiles),b=await ai.parseBrief('Нужен ведущий на корпоратив',{...query,hours:8},profiles);assert.equal(a.query.hours,4);assert.equal(b.query.hours,8);assert.equal(calls,2)});
test('explicit year does not inherit a hallucinated model assumption',async()=>{const ai=createAI({apiKey:'test',fetchImpl:async()=>ok({...parsed,assumptions:['Год не указан']})});const r=await ai.parseBrief('Корпоратив 14 ноября 2026',query,profiles);assert.deepEqual(r.assumptions,[])});
test('concurrent duplicate requests are deduplicated',async()=>{let calls=0;const ai=createAI({apiKey:'test',fetchImpl:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return ok(insight)}});await Promise.all([ai.explain(base,profiles),ai.explain(base,profiles)]);assert.equal(calls,1)});
test('no key or no matches makes zero paid requests',async()=>{let calls=0;const ai=createAI({apiKey:'',fetchImpl:async()=>{calls++;throw new Error('not called')}});await assert.rejects(ai.explain(base,profiles),{code:'not_configured'});const empty=recommend(profiles,{...query,budget:1});assert.equal((await ai.explain(empty,profiles)).skipped,true);assert.equal(calls,0);assert.equal(ai.config().configured,false)});
test('provider errors are sanitized and not cached',async()=>{let calls=0;const ai=createAI({apiKey:'test-secret',fetchImpl:async()=>{calls++;return {ok:false,status:429,json:async()=>({error:'test-secret'})}}});for(let i=0;i<2;i++)await assert.rejects(ai.explain(base,profiles),e=>e.code==='quota_or_rate_limit'&&!e.message.includes('test-secret'));assert.equal(calls,2)});
test('network timeout/refusal falls back intentionally',async()=>{const unavailable=createAI({apiKey:'test',fetchImpl:async()=>{throw new Error('transport details')}});await assert.rejects(unavailable.explain(base,profiles),{code:'timeout'});const refusal=createAI({apiKey:'test',fetchImpl:async()=>({ok:true,json:async()=>({status:'completed',output:[{content:[{type:'refusal',refusal:'no'}]}]})})});await assert.rejects(refusal.explain(base,profiles),{code:'invalid_response'})});
test('changed profile content invalidates explanation cache',async()=>{let calls=0;const ai=createAI({apiKey:'test',fetchImpl:async()=>{calls++;return ok(insight)}});await ai.explain(base,profiles);await ai.explain(base,profiles.map(p=>p.id===base.cards[0].id?{...p,description:p.description+' Дополнение.'}:p));assert.equal(calls,2)});

test('comparison rejects invented winners, missing alternatives and duplicates',()=>{
 for(const comparison of [{...insight.comparison,recommended_id:'invented'},{...insight.comparison,alternatives:[]},{...insight.comparison,alternatives:candidates.map(()=>insight.comparison.alternatives[0])}])assert.throws(()=>validateInsights({...insight,comparison},candidates),/цитатами/);
});
test('LLM receives computed team coverage and shared budget; budget changes invalidate cache',async()=>{
 let calls=0;const ai=createAI({apiKey:'test',fetchImpl:async(url,opts)=>{calls++;const payload=JSON.parse(JSON.parse(opts.body).input);assert.equal(payload.teams.length,3);assert.ok(payload.teams.every(t=>t.budget===payload.query.team_budget));assert.ok(payload.candidates.every(c=>Array.isArray(c.categories)));return ok(insight)}});
 for(const team_budget of [2000000,2100000])await ai.explain(recommend(profiles,{...query,team_budget,team_roles:['Фотограф','Инструменталист']}),profiles);
 assert.equal(calls,2);
});
test('brief preserves requested team roles and inherits team settings when omitted',()=>{
 const context={...query,team_roles:['Фотограф'],team_budget:2000000};
 assert.deepEqual(mergeBrief(parsed,context).query.team_roles,['Фотограф']);
 const r=mergeBrief({...parsed,team_roles:['Инструменталист'],team_budget:1500000},context);assert.deepEqual(r.query.team_roles,['Инструменталист']);assert.equal(r.query.team_budget,1500000);
});
test('schema restricts each candidate to verbatim quotes from their own profile',async()=>{
 const ai=createAI({apiKey:'test',fetchImpl:async(url,opts)=>{
  const schema=JSON.parse(opts.body).text.format.schema;
  assert.equal(schema.properties.comparison.properties.alternatives.minItems,candidates.length);
  for(const variant of schema.properties.cards.items.anyOf){const id=variant.properties.id.enum[0];const profile=profiles.find(p=>p.id===id);assert.ok(profile);assert.ok(variant.properties.quote.enum.every(quote=>profile.description.includes(quote)));}
  return ok(insight);
 }});
 await ai.explain(base,profiles);
});
