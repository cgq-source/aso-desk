export const COUNTRIES = {us:'美国',cn:'中国大陆',jp:'日本',gb:'英国',de:'德国',fr:'法国',es:'西班牙',br:'巴西',kr:'韩国',tw:'中国台湾',hk:'中国香港',ca:'加拿大',au:'澳大利亚',mx:'墨西哥',it:'意大利',in:'印度',sg:'新加坡',vn:'越南'};
export const LOCALES = {'en-US':'英文（美国）','zh-Hans':'简体中文','zh-Hant':'繁体中文','ja':'日文','de-DE':'德文','fr-FR':'法文','es-ES':'西班牙文','pt-BR':'葡萄牙文（巴西）','ko':'韩文'};
export const SOURCE = 'apple-search-api-v1';
export const normalize = x => String(x ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g,' ').trim();
export const charCount = x => Array.from(String(x ?? '').normalize('NFC')).length;
export const byteCount = x => new TextEncoder().encode(String(x ?? '')).length;
export const escapeHTML = x => String(x ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function safeURL(x){try{const u=new URL(x);return u.protocol==='https:'?u.href:'';}catch{return '';}}
export function appId(x){const t=String(x).trim();if(/^\d{5,15}$/.test(t))return t;try{const u=new URL(t);if(u.hostname==='apps.apple.com')return u.pathname.match(/\/id(\d{5,15})(?:\/|$)/)?.[1]??null;}catch{}return null;}
export function tokens(text,locale='en-US'){
 const t=normalize(text);
 if(/^(zh|ja|ko)/.test(locale)&&typeof Intl.Segmenter==='function')return [...new Intl.Segmenter(locale,{granularity:'word'}).segment(t)].filter(x=>x.isWordLike).map(x=>x.segment);
 return t.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu)??[];
}
export function stem(word){
 const w=normalize(word), exceptions=new Set(['news','series','cross','chess','business','glass','ios','us','puzzles']);
 if(w==='puzzles')return 'puzzle';
 if(exceptions.has(w))return w;
 if(w.length>4&&w.endsWith('ies'))return w.slice(0,-3)+'y';
 if(w.length>4&&/(ches|shes|xes|zes)$/.test(w))return w.slice(0,-2);
 if(w.length>3&&w.endsWith('s')&&!w.endsWith('ss'))return w.slice(0,-1);
 return w;
}
const STOP=new Set(['the','a','an','of','and','or','for','to','your','our','with','by','in','on','at','is','are','you','it','app','apps','game','games']);
const BROAD=new Set(['light','up','puzzle','puzzles','logic','brain','free','best','new','game','app']);
export function inferProfile(app){
 const t=normalize((app.name??'')+' '+(app.subtitle??'')+' '+(app.description??''));
 if(/\bakari\b|\blight ?up\b/.test(t)&&/puzzle|lantern|illuminat/.test(t))return {kind:'akari',features:['akari','light up','logic','grid','lantern','daily','offline','cozy'],seeds:['akari','akari puzzle','akari light','light up puzzle','lightup puzzle','logic grid','brain teaser','daily logic puzzle','offline puzzle','cozy puzzle']};
 if(/crossword|word puzzle|word search/.test(t))return {kind:'word',features:['word','crossword','vocabulary','daily'],seeds:['word puzzle','word search','crossword','daily crossword']};
 if(/sudoku/.test(t))return {kind:'sudoku',features:['sudoku','number','logic','daily'],seeds:['sudoku','daily sudoku','number puzzle','logic puzzle']};
 const words=[...new Set(tokens(app.name+' '+(app.subtitle??'')).filter(w=>!STOP.has(w)))];
 return {kind:'custom',features:words,seeds:[app.name,...words.slice(0,8)].filter(Boolean)};
}
export function relevance(term,profile){
 const n=normalize(term),words=tokens(n),features=(profile.features??[]).map(normalize);
 if(profile.kind==='akari'){
  if(/\b(word|crossword|jigsaw|block|match|sudoku|arrow)\b/.test(n))return {level:'low',label:'低',reason:'可能对应其他谜题玩法，不能仅因同属 Puzzle 就推荐。'};
  if(/\bakari\b|light ?up.*puzzle|puzzle.*light ?up/.test(n))return {level:'high',label:'高',reason:'直接描述 Akari / Light Up 点灯玩法。'};
  if(/logic.*grid|grid.*logic|daily.*logic|logic.*daily/.test(n))return {level:'high',label:'高',reason:'匹配棋盘逻辑或每日谜题场景，仍需核对搜索结果。'};
  if(words.length===1&&BROAD.has(n))return {level:'low',label:'低',reason:'单词过宽，容易匹配照明、通用工具或其他游戏。'};
 }
 const hits=features.filter(f=>n.includes(f));
 if(hits.length>=2)return {level:'high',label:'高',reason:'覆盖多个已确认的产品特征；需继续确认搜索意图。'};
 if(hits.length===1)return {level:'medium',label:'中',reason:'与部分功能或场景相关，需结合头部结果验证。'};
 return {level:'unknown',label:'待校准',reason:'当前产品特征不足以判断；请在设置中补充功能词。'};
}
export function coverage(term,draft){
 const w=tokens(term).filter(x=>!STOP.has(x)).map(stem);
 const has=field=>{const set=new Set(tokens(field).map(stem));return w.length>0&&w.every(x=>set.has(x));};
 return {title:has(draft.title??''),subtitle:has(draft.subtitle??''),keywords:has(draft.keywords??'')};
}
export function analyzeDraft(draft,locale='en-US',category=''){
 const fields=['title','subtitle','keywords'];const issues=[];const seen=new Map();
 for(const f of fields){
  const limit=f==='keywords'?100:30,len=charCount(draft[f]);
  if(len>limit)issues.push({level:'error',field:f,message:`${f==='title'?'标题':f==='subtitle'?'副标题':'关键词字段'}超出 ${limit} 字符（当前 ${len}）。`});
  if(f==='title'&&!len)issues.push({level:'error',field:f,message:'标题不能为空。'});
  for(const token of tokens(draft[f],locale).filter(x=>!STOP.has(x))){
   const key=stem(token);if(seen.has(key))issues.push({level:'warning',field:f,message:`“${token}”与 ${seen.get(key)} 中的词重复或属于常见词形。`});else seen.set(key,f==='title'?'标题':f==='subtitle'?'副标题':'关键词字段');
  }
 }
 for(const [field,label,limit] of [['promotionalText','推广文本',170],['description','描述',4000]])if(charCount(draft[field])>limit)issues.push({level:'error',field,message:`${label}超出 ${limit} 字符。`});
 const categories=new Set(tokens(category).map(stem));
 for(const token of tokens(draft.keywords,locale))if(categories.has(stem(token)))issues.push({level:'warning',field:'keywords',message:`“${token}”与分类词重复，建议检查是否有必要占用字段。`});
 if(/，/.test(draft.keywords??''))issues.push({level:'warning',field:'keywords',message:'关键词字段使用英文逗号分隔。'});
 if(/,\s+/.test(draft.keywords??''))issues.push({level:'warning',field:'keywords',message:'逗号后的空格占用字段容量，可移除。'});
 if(byteCount(draft.keywords)>100&&charCount(draft.keywords)<=100)issues.push({level:'info',field:'keywords',message:'UTF-8 字节数超过 100；不同语言的最终容量以 App Store Connect 校验为准。'});
 return {issues:[...new Map(issues.map(x=>[x.message,x])).values()],counts:Object.fromEntries(fields.map(f=>[f,{characters:charCount(draft[f]),bytes:byteCount(draft[f]),limit:f==='keywords'?100:30}]))};
}
export function competition(record,app){
 const results=(record?.topResults??[]).filter(x=>x.id!==String(app.id));if(results.length<5)return null;
 const term=tokens(record.term).filter(x=>!STOP.has(x)).map(stem);
 const exact=results.filter(r=>{const ts=tokens(r.name).map(stem);return term.length&&term.every(x=>ts.includes(x));}).length/results.length;
 const ratingStrength=results.reduce((a,r)=>a+Math.min(1,Math.log10(1+(r.ratingCount??0))/5),0)/results.length;
 const categoryShare=results.filter(r=>r.category===app.category).length/results.length;
 return {score:Math.round(40*exact+40*ratingStrength+20*categoryShare),parts:{titleMatch:Math.round(exact*100),ratingStrength:Math.round(ratingStrength*100),sameCategory:Math.round(categoryShare*100)},sampleSize:results.length,version:'proxy-v1',explanation:'40% 标题词形匹配 + 40% 评分数量对数代理 + 20% 同分类比例；不代表真实下载量或 Apple 官方竞争度。'};
}
export function actionFor(term,record,profile,draft){
 const r=relevance(term,profile),c=coverage(term,draft);
 if(r.level==='low')return {label:'校准意图',reason:r.reason};
 if(c.title)return {label:'保留观察',reason:'标题已覆盖；结合后续位置和转化观察，不重复堆词。'};
 if(r.level==='high'&&record?.status==='ok'&&record.position!=null)return {label:'测试标题',reason:'产品相关且已在结果中出现，可测试标题覆盖；并不保证移动字段会提升位置。'};
 return {label:'继续验证',reason:record?.status==='ok'&&record.position==null?'本次返回范围中未找到 App；需要结合意图、竞品和热度继续验证。':'缺少实测结果，先查询并核对头部 App。'};
}
export function normalizeApp(r){return {id:String(r.trackId??r.id??''),name:r.trackName??r.name??'',subtitle:r.subtitle??'',description:r.description??'',category:r.primaryGenreName??r.category??'',genres:r.genres??[],developer:r.artistName??r.sellerName??r.developer??'',rating:r.averageUserRating??r.rating??null,ratingCount:r.userRatingCount??r.ratingCount??null,version:r.version??'',icon:safeURL(r.artworkUrl100??r.icon??''),url:safeURL(r.trackViewUrl??r.url??''),languages:r.languageCodesISO2A??r.languages??[]};}
export function makeRecord(term,country,app,results,timestamp=new Date().toISOString()){
 const index=results.findIndex(x=>String(x.trackId??x.id)===String(app.id));
 return {term:normalize(term),country,appId:String(app.id),source:SOURCE,status:'ok',checkedAt:timestamp,position:index<0?null:index+1,returned:results.length,limit:200,topResults:results.slice(0,20).map(normalizeApp)};
}
export function addHistory(history,record){
 if(record.status!=='ok')return history??[];
 const instant=new Date(record.checkedAt);if(!Number.isFinite(instant.getTime()))return history??[];const checkedAt=instant.toISOString();
 const point={date:checkedAt.slice(0,10),checkedAt,position:record.position,returned:record.returned,source:record.source};
 const existing=(history??[]).find(x=>x.date===point.date&&x.source===point.source);if(existing&&new Date(existing.checkedAt).getTime()>instant.getTime())return history;
 return [...(history??[]).filter(x=>!(x.date===point.date&&x.source===point.source)),point].sort((a,b)=>new Date(a.checkedAt)-new Date(b.checkedAt)).slice(-365);
}
export function historyDelta(history,source=SOURCE){const a=(history??[]).filter(x=>x.source===source);if(a.length<2||a.at(-1).position==null||a.at(-2).position==null)return null;return a.at(-2).position-a.at(-1).position;}
export function parseCSV(input){
 const t=String(input).replace(/^\uFEFF/,'');const first=t.split(/\r?\n/)[0]??'';
 const delim=(first.match(/;/g)?.length??0)>(first.match(/,/g)?.length??0)?';':first.includes('\t')?'\t':',';
 let rows=[],row=[],cell='',quoted=false;
 for(let i=0;i<t.length;i++){
  const c=t[i];if(c==='"'){if(quoted&&t[i+1]==='"'){cell+='"';i++;}else if(quoted)quoted=false;else if(!cell)quoted=true;else cell+=c;}
  else if(!quoted&&(c===delim||c==='\n'||c==='\r')){row.push(cell);cell='';if(c!==delim){if(c==='\r'&&t[i+1]==='\n')i++;if(row.some(x=>x.trim()))rows.push(row);row=[];}}
  else cell+=c;
 }
 if(quoted)throw new Error('CSV 的引号未闭合，请检查文件。');
 row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
export function toCSV(rows){return '\uFEFF'+rows.map(r=>r.map(v=>{let t=String(v??'');if(typeof v==='string'&&/^\s*[=+@-]/.test(t))t="'"+t;return '"'+t.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
const key=x=>normalize(x).replace(/[\s_-]/g,'');
export function importPopularity(text,defaultCountry='us'){
 const rows=parseCSV(text),headers=(rows.shift()??[]).map(key),find=names=>headers.findIndex(x=>names.includes(x));
 const ti=find(['searchterm','keyword','term','关键词','搜索词']),pi=find(['searchpopularity1to100','popularity','热度','搜索热度']),ci=find(['countryorregion','country','storefront','国家','地区']),di=find(['month','week','date','period','月份','日期']);
 if(ti<0||pi<0)throw new Error('需要 searchTerm / keyword 和 searchPopularity1to100 / popularity 两列。');
 const values=[],errors=[];
 rows.forEach((r,i)=>{const term=normalize(r[ti]),country=normalize(ci<0?defaultCountry:r[ci]||defaultCountry),raw=String(r[pi]??'').trim(),n=Number(raw);
  if(!term||!COUNTRIES[country]||!raw||!Number.isFinite(n)||n<1||n>100){errors.push(`第 ${i+2} 行：词、国家或 1–100 热度无效。`);return;}
  values.push({term,country,score:n,period:di<0?'未提供':String(r[di]??'未提供'),granularity:di<0?'unknown':headers[di]==='month'?'month':headers[di]==='week'?'week':'date',source:'用户导入 CSV',importedAt:new Date().toISOString()});
 });return {values,errors};
}
export function importAnalytics(text){
 const rows=parseCSV(text),headers=(rows.shift()??[]).map(key),find=names=>headers.findIndex(x=>names.includes(x));
 const di=find(['date','日期']),ii=find(['impressions','曝光','曝光次数']),vi=find(['pageviews','productpageviews','产品页面浏览次数','页面访问']),ni=find(['downloads','firsttimedownloads','appunits','下载','下载次数']);
 if(di<0||[ii,vi,ni].some(x=>x<0))throw new Error('报表需要 date、impressions、pageViews、downloads 四列；可先下载模板整理数据。');
 const values=[];const errors=[];
 rows.forEach((r,i)=>{const date=String(r[di]).trim().replaceAll('/','-'),nums=[ii,vi,ni].map(j=>String(r[j]??'').trim());if(!validISODate(date)||nums.some(n=>!n||!Number.isFinite(Number(n))||Number(n)<0)){errors.push(`第 ${i+2} 行：日期或计数无效。`);return;}values.push({date,impressions:Number(nums[0]),pageViews:Number(nums[1]),downloads:Number(nums[2])});});
 return {values,errors};
}
export function validISODate(t){if(!/^\d{4}-\d{2}-\d{2}$/.test(t))return false;const d=new Date(t+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===t;}
export function appendPopularity(history,entry){return [...(history??[]).filter(x=>!(x.period===entry.period&&x.granularity===entry.granularity)),entry].slice(-104);}
export function popularityTrend(history){
 const valid=(history??[]).filter(x=>x.granularity==='month'?/^\d{4}-\d{2}$/.test(x.period)&&Number(x.period.slice(5))>=1&&Number(x.period.slice(5))<=12:['week','date'].includes(x.granularity)&&validISODate(x.period)).sort((a,b)=>a.period.localeCompare(b.period));
 const latest=valid.at(-1)??history?.at(-1);if(!latest)return null;
 const comparable=valid.filter(x=>x.granularity===latest.granularity&&x.period<latest.period),previous=comparable.at(-1);
 return {latest,previous,delta:previous?latest.score-previous.score:null,periods:valid.filter(x=>x.granularity===latest.granularity).length};
}
export function draftProposal(app,profile,current,locale='en-US'){
 if(profile.kind!=='akari')return {...current,title:current.title||app.name,notes:'先补充产品特征和目标关键词，再人工确定文案；本方案保留现有内容。'};
 const templates={
  'en-US':['Akari Puzzles','Light Up & Daily Logic Boards','brain,teaser,cozy,grid,offline,lantern,bulb,relaxing,challenge'],
  'zh-Hans':['点灯逻辑谜题','果园里的每日逻辑挑战','益智,灯笼,棋盘,离线,休闲,思考,网格,脑力'],
  'zh-Hant':['點燈邏輯謎題','果園裡的每日邏輯挑戰','益智,燈籠,棋盤,離線,休閒,思考,網格,腦力'],
  'ja':['あかりパズル','毎日のロジックチャレンジ','光,ランタン,盤面,オフライン,思考,リラックス'],
  'de-DE':['Akari Rätsel','Licht an: tägliche Logik','denkspiel,raster,offline,gemütlich,laterne,knobeln'],
  'fr-FR':['Puzzles Akari','Lumière et logique au quotidien','grille,cerveau,lanterne,hors ligne,détente,défi'],
  'es-ES':['Puzles Akari','Luz y lógica cada día','cuadrícula,mente,farol,sin conexión,relajante,reto'],
  'pt-BR':['Puzzles Akari','Luz e lógica todos os dias','grade,mente,lanterna,offline,relaxante,desafio'],
  'ko':['아카리 퍼즐','매일 즐기는 빛과 논리','두뇌,랜턴,격자,오프라인,휴식,도전']
 };
 const localized=templates[locale]??templates['en-US'];
 const name=app.name||current.title,joined=name+': '+localized[0];
 return {...current,title:charCount(joined)<=30?joined:name,subtitle:localized[1],keywords:localized[2],notes:'规则候选：保留品牌，加入点灯玩法和每日场景；补充词尚需搜索与热度验证。'};
}
