import test from 'node:test';
import assert from 'node:assert/strict';
import {recommend,buildTeam,validateQuery} from '../dist/engine.mjs';
const q={city:'Алматы',date:'2026-11-14',event_format:'корпоратив',category:'Ведущий',budget:500,team_budget:1000,team_roles:['Фотограф','Инструменталист'],hours:4,language:'русский'};
const p=(id,categories,price,extra={})=>({id,anon_name:id,categories,price_from_kzt:price,city:'Алматы',event_formats:['корпоратив'],languages:['русский'],max_hours:4,busy_dates:[],description:'Атмосферная программа мероприятия.',...extra});
const host=p('host',['Ведущий','Инструменталист'],400);
test('musician in main profile does not cover photographer; unique members counted once',()=>{
 const r=recommend([host,p('photo',['Фотограф'],300),p('music',['Инструменталист'],100)],q);
 assert.equal(r.teams.length,1);const t=r.teams[0];assert.equal(t.status,'complete');assert.equal(t.total_from_kzt,700);assert.deepEqual(t.members.map(m=>m.id),['host','photo']);
});
test('finds globally cheaper combination rather than greedily assigning each role',()=>{
 const data=[p('host',['Ведущий'],400),p('photo',['Фотограф'],250),p('music',['Инструменталист'],250),p('both',['Фотограф','Инструменталист'],350)];
 const t=buildTeam(data,{...q,team_budget:800},'host');assert.equal(t.status,'complete');assert.equal(t.total_from_kzt,750);assert.deepEqual(t.members.map(m=>m.id),['host','both']);assert.deepEqual(buildTeam([...data].reverse(),{...q,team_budget:800},'host'),t);
});
test('every supplemental member respects hard constraints',()=>{
 for(const extra of [{busy_dates:[q.date]},{city:'Астана'},{languages:['английский']},{max_hours:2},{event_formats:['свадьба']}]){
 const t=buildTeam([host,p('photo',['Фотограф'],100,extra)],q,'host');assert.equal(t.status,'partial');assert.deepEqual(t.missing.map(m=>m.role),['Фотограф']);assert.equal(t.members.length,1);
 }
});
test('budget never silently exceeded to complete a team',()=>{
 const t=buildTeam([host,p('photo',['Фотограф'],700)],q,'host');assert.equal(t.status,'partial');assert.equal(t.total_from_kzt,400);assert.match(t.missing[0].reason,/бюджет/);
 assert.equal(buildTeam([host],{...q,team_budget:300},'host').status,'over_budget');
});
test('no fabricated services from descriptions and no team unless roles requested',()=>{
 const data=[{...host,categories:['Ведущий'],description:'Могу обсудить фотографа и музыканта.'}];
 assert.equal(buildTeam(data,q,'host').missing.length,2);
 assert.deepEqual(recommend(data,{...q,team_roles:[]}).teams,[]);
});
test('invalid team limits and excessive roles rejected',()=>{
 for(const team_budget of [-1,0,1.5,'bad'])assert.throws(()=>validateQuery({...q,team_budget}));
 assert.throws(()=>validateQuery({...q,team_roles:Array.from({length:9},(_,i)=>String(i))}));
});
