export const START = '2026-09-23', END = '2026-12-31';
export const CATEGORIES = ['Ведущий','Фотограф','Банкетный зал','Флорист','Декоратор','Подарки и сувениры','Ведущий церемонии','Фото и видеобудки','Отель','Инструменталист'];
export const FORMATS = ['свадьба','той','корпоратив','конференция','юбилей','день рождения'];
const norm = s => String(s).trim().toLowerCase().replaceAll('ё','е');
const eq = (a,b) => norm(a) === norm(b);
const has = (xs,s) => xs.some(x=>eq(x,s));
export const money = n => new Intl.NumberFormat('ru-RU').format(n) + ' ₸';
function fail(message) { throw new Error(message); }
export function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s; }
function list(v,field) {
  const a = Array.isArray(v) ? v : typeof v === 'string' ? v.split('|') : fail(`Поле ${field}: нужен массив или строка со значениями через |.`);
  if(a.some(x=>typeof x !== 'string')) fail(`Поле ${field}: значения должны быть строками.`);
  return [...new Set(a.map(x=>x.trim()).filter(Boolean))];
}
function bool(v,field) {
  if(v===true || v==='TRUE' || v==='true') return true;
  if(v===false || v==='FALSE' || v==='false') return false;
  fail(`Поле ${field}: укажите true или false.`);
}
export function validateProfiles(raw) {
  if(!Array.isArray(raw) || !raw.length || raw.length>10000) fail('Каталог должен содержать от 1 до 10 000 профилей.');
  const ids = new Set();
  return raw.map((p,i)=>{
    try {
      if(!p || typeof p!=='object') fail('Ожидается объект профиля.');
      const q = {};
      for(const f of ['id','anon_name','city','description']) {
        if(typeof p[f] !== 'string' || !p[f].trim()) fail(`Отсутствует ${f}.`);
        q[f]=p[f].trim();
      }
      if(ids.has(q.id)) fail(`Повторяющийся id ${q.id}.`); ids.add(q.id);
      for(const f of ['categories','event_formats','languages','busy_dates']) q[f]=list(p[f],f);
      if(!q.categories.length || !q.event_formats.length || !q.languages.length) fail('Категории, форматы и языки не могут быть пустыми.');
      if(q.busy_dates.some(d=>!validDate(d) || d<START || d>END)) fail('Занятые даты должны быть в окне 23.09–31.12.2026.');
      if(p.price_from_kzt==null || p.price_from_kzt==='' || !['number','string'].includes(typeof p.price_from_kzt)) fail('Не указана цена.');
      q.price_from_kzt=Number(p.price_from_kzt);
      if(!Number.isSafeInteger(q.price_from_kzt) || q.price_from_kzt<0) fail('Цена должна быть целым неотрицательным числом.');
      q.max_hours=p.max_hours==null || p.max_hours==='' ? null : Number(p.max_hours);
      if(q.max_hours!==null && (!Number.isFinite(q.max_hours) || q.max_hours<=0)) fail('Длительность должна быть положительной или null.');
      for(const f of ['synthetic','city_imputed','price_imputed']) q[f]=bool(p[f],f);
      // Provenance is never inferred from synthetic=false: original entries are anonymized too.
      q.added_for_demo=p.added_for_demo===true;
      return q;
    } catch(e) { fail(`Профиль ${i+1}: ${e.message}`); }
  });
}
export function parseCatalog(text, filename='data.jsonl') {
  text=text.replace(/^\uFEFF/,'').trim();
  if(!text) fail('Файл пуст.');
  let rows;
  if(filename.toLowerCase().endsWith('.json')) rows=JSON.parse(text);
  else if(filename.toLowerCase().endsWith('.jsonl')) rows=text.split(/\r?\n/).filter(s=>s.trim()).map((s,i)=>{try{return JSON.parse(s)}catch{fail(`Строка JSONL ${i+1}: некорректный JSON.`)}});
  else {
    const first=text.split(/\r?\n/)[0];
    const delim=['\t',';',','].sort((a,b)=>first.split(b).length-first.split(a).length)[0];
    let row=[],cell='',quoted=false; const table=[];
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(c==='"') { if(quoted && text[i+1]==='"'){cell+='"';i++} else quoted=!quoted; }
      else if(c===delim && !quoted){row.push(cell);cell=''}
      else if(c==='\n' && !quoted){row.push(cell.replace(/\r$/,''));table.push(row);row=[];cell=''}
      else cell+=c;
    }
    if(quoted) fail('CSV: незакрытая кавычка.');
    row.push(cell.replace(/\r$/,''));table.push(row);
    const header=table.shift().map(s=>s.trim());
    if(new Set(header).size!==header.length) fail('CSV: повторяющиеся названия колонок.');
    rows=table.filter(r=>r.some(x=>x.trim())).map((r,i)=>{
      if(r.length!==header.length) fail(`CSV, строка ${i+2}: ${r.length} колонок вместо ${header.length}.`);
      return Object.fromEntries(header.map((h,i)=>[h,r[i]]));
    });
  }
  return validateProfiles(rows);
}
export function validateQuery(raw) {
  if(!raw || typeof raw!=='object') fail('Нужны параметры заказа.');
  const q={};
  for(const f of ['city','date','event_format','category']) {if(typeof raw[f]!=='string' || !raw[f].trim()) fail(`Заполните ${f}.`);q[f]=raw[f].trim();}
  if(!validDate(q.date)) fail('Укажите корректную дату.');
  if(q.date<START || q.date>END) fail('Календари известны только с 23 сентября по 31 декабря 2026. Выберите дату в этом диапазоне.');
  if(raw.budget==null || raw.budget==='' || !['number','string'].includes(typeof raw.budget)) fail('Укажите бюджет.');
  q.budget=Number(raw.budget);
  if(!Number.isSafeInteger(q.budget) || q.budget<=0) fail('Бюджет должен быть положительным целым числом в тенге.');
  q.hours=raw.hours==null || raw.hours==='' ? null : Number(raw.hours);
  if(q.hours!==null && (!Number.isFinite(q.hours) || q.hours<=0 || q.hours>72)) fail('Длительность: больше 0 и не больше 72 часов.');
  q.language=typeof raw.language==='string'?raw.language.trim():'';
  q.wishes=typeof raw.wishes==='string'?raw.wishes.trim():'';
  if(q.wishes.length>500) fail('Пожелания: не больше 500 символов.');
  return q;
}
const stems = ['атмосфер','интеллигент','импровиза','вокал','камерн','бизнес','форум','репортаж','портрет','цветоч','авторск','свет','звук','панорам','классическ','современн','спокойн','интерактив','английск','казахск','русск','минимал','жив'];
function tokens(s) {
  return [...new Set(norm(s).match(/[а-яa-z0-9]{4,}/g)||[])].map(t=>stems.find(s=>t.startsWith(s))||t);
}
function evidence(p,q) {
  const wanted=tokens(q.wishes);
  const sentences=p.description.split(/(?<=[.!?])\s+|\n|•/).map(s=>s.trim()).filter(Boolean);
  const matches=wanted.filter(t=>norm(p.description).includes(t));
  const best=sentences.map((s,i)=>({s,i,n:wanted.filter(t=>norm(s).includes(t)).length})).sort((a,b)=>b.n-a.n || a.i-b.i)[0]?.s || p.description;
  return {matches:[...new Set(matches)],quote:best.length>270?best.slice(0,267)+'…':best};
}
function rejected(p,q) {
  const r=[];
  if(p.busy_dates.includes(q.date)) r.push('busy');
  if(p.price_from_kzt>q.budget) r.push('budget');
  if(!has(p.event_formats,q.event_format)) r.push('format');
  if(q.language && !has(p.languages,q.language)) r.push('language');
  if(q.hours!==null && p.max_hours!==null && p.max_hours<q.hours) r.push('hours');
  return r;
}
export const REASONS={busy:'заняты на выбранную дату',budget:'цена «от» выше бюджета',format:'не работают с этим форматом',language:'не указан нужный язык',hours:'не хватает часов работы'};
export function recommend(profiles,raw) {
  const q=validateQuery(raw);
  const local=profiles.filter(p=>eq(p.city,q.city) && has(p.categories,q.category));
  const exclusions=Object.fromEntries(Object.keys(REASONS).map(k=>[k,0]));
  const rejectedProfiles=[],candidates=[];
  for(const p of local) {
    const reasons=rejected(p,q);
    if(reasons.length){reasons.forEach(r=>exclusions[r]++);rejectedProfiles.push({id:p.id,name:p.anon_name,reasons});continue}
    const ev=evidence(p,q);
    // Lexical evidence leads; budget headroom is capped at 20 points. Stable ID breaks ties.
    const semanticPoints=Math.min(ev.matches.length,5)*10;
    const budgetPoints=20*(1-p.price_from_kzt/q.budget);
    candidates.push({p,ev,score:semanticPoints+budgetPoints,semanticPoints,budgetPoints});
  }
  candidates.sort((a,b)=>b.score-a.score || a.p.price_from_kzt-b.p.price_from_kzt || (a.p.id<b.p.id?-1:a.p.id>b.p.id?1:0));
  const cards=candidates.slice(0,3).map(({p,ev,score,semanticPoints,budgetPoints})=>({
    id:p.id,name:p.anon_name,category:q.category,city:p.city,price_from_kzt:p.price_from_kzt,
    synthetic:p.synthetic,added_for_demo:p.added_for_demo,city_imputed:p.city_imputed,price_imputed:p.price_imputed,
    max_hours:p.max_hours,languages:p.languages,score:Number(score.toFixed(2)),
    evidence:ev,score_breakdown:{description:semanticPoints,budget:Number(budgetPoints.toFixed(2))},
    explanation:`По календарю свободен ${q.date}; работает с форматом «${q.event_format}»; цена от ${money(p.price_from_kzt)} — на ${money(q.budget-p.price_from_kzt)} ниже лимита${q.language?`; язык: ${q.language}`:''}${q.hours!==null?`; ${p.max_hours===null?'присутствие по часам не требуется':`лимит ${p.max_hours} ч покрывает ваши ${q.hours} ч`}`:''}. В профиле: «${ev.quote}»`,
  }));
  const status=!local.length?'category_absent':!cards.length?'no_matches':'matched';
  const counts=Object.entries(exclusions).filter(([,n])=>n).map(([k,n])=>`${REASONS[k]} — ${n}`).join('; ');
  let message=status==='category_absent'?`В городе ${q.city} в загруженном каталоге нет категории «${q.category}».`:status==='no_matches'?`В категории есть ${local.length} профилей, но ни один не проходит все условия. ${counts}.`:`Подходят ${candidates.length} из ${local.length} профилей. ${cards.length<3?'Показаны все подходящие; дополнить тройку без нарушения условий нельзя. ':`Показаны первые ${cards.length}. `}${counts?`Причины исключения: ${counts}.`:'Все профили проходят условия.'}`;
  const suggestions=[];
  if(status==='no_matches') {
    const free=local.filter(p=>rejected(p,q).every(r=>r==='budget'));
    if(free.length) suggestions.push(`При тех же остальных условиях минимальная цена «от» — ${money(Math.min(...free.map(p=>p.price_from_kzt)))}.`);
    const dates=[];
    for(let t=Date.parse(START);t<=Date.parse(END);t+=86400000) {
      const date=new Date(t).toISOString().slice(0,10);
      if(date!==q.date && local.some(p=>!rejected(p,{...q,date}).length)) dates.push(date);
    }
    dates.sort((a,b)=>Math.abs(Date.parse(a)-Date.parse(q.date))-Math.abs(Date.parse(b)-Date.parse(q.date)) || (a<b?-1:1));
    if(dates.length) suggestions.push(`При тех же условиях есть кандидат на ${dates[0]}; дату можно изменить вручную.`);
  }
  return {status,query:q,cards,total_in_category:local.length,eligible_count:candidates.length,exclusions,rejected_profiles:rejectedProfiles,message,suggestions,calendar_window:{start:START,end:END}};
}
