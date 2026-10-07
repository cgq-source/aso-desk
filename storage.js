import { normalize, addHistory, inferProfile, COUNTRIES, validISODate } from './engine.js';
const KEY='aso-desk.workspace.v1';
const newer=(a,b)=>new Date(a??0).getTime()>new Date(b??0).getTime();
export const scopeKey=(id,country)=>String(id)+':'+country;
const dictionary=v=>v&&typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).some(k=>['__proto__','constructor','prototype'].includes(k));
const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function checkSavedApp(a){
 if(!a||typeof a.id!=='string'||!/^\d+$/.test(a.id)||typeof a.name!=='string')throw new Error('备份中的 App 资料无效。');
 for(const f of ['subtitle','description','category','developer','version','icon','url'])if(a[f]!=null&&typeof a[f]!=='string')throw new Error('备份中的 App 文本无效。');
 if(a.ratingCount!=null&&(!nonnegative(a.ratingCount)||!Number.isInteger(a.ratingCount)))throw new Error('备份中的评分数量无效。');
 if(a.rating!=null&&(!nonnegative(a.rating)||a.rating>5))throw new Error('备份中的评分无效。');
 if(a.storefronts!=null){if(!dictionary(a.storefronts))throw new Error('备份中的地区资料无效。');for(const m of Object.values(a.storefronts)){checkSavedApp(m);if(m.id!==a.id)throw new Error('备份中的地区 App ID 不一致。');}}
}
function checkPosition(p){
 if(!p||!Number.isInteger(p.returned)||p.returned<0||p.returned>200||p.position!=null&&(!Number.isInteger(p.position)||p.position<1||p.position>p.returned))throw new Error('备份中的搜索位置无效。');
}
function checkPopularity(p){
 if(!p||!nonnegative(p.score)||p.score<1||p.score>100||typeof p.term!=='string'||typeof p.country!=='string'||!/^[a-z]{2}$/.test(p.country))throw new Error('备份热度数据无效。');
}
export class Workspace {
 constructor(seed){this.seed=seed;this.error=null;try{this.state=JSON.parse(localStorage.getItem(KEY)||'null');}catch{this.error='本地存档无法读取，当前使用公开快照；原始存档仍保留。';}if(!this.state||this.state.schema!==1)this.state={schema:1,apps:{},scopes:{},popularity:{},selection:{appId:seed.apps[0].id,country:'us'},preferences:{}};this.mergeSeed(seed);}
 mergeSeed(seed){for(const app of seed.apps){this.state.apps[app.id]??=app;for(const country of Object.keys(app.storefronts??{us:app})){const m=app.storefronts?.[country]??app;const sc=this.ensure(app.id,country,m);if(!sc.metadata.checkedAt||newer(m.checkedAt,sc.metadata.checkedAt))sc.metadata={...m,subtitle:sc.metadata.subtitleSource?.startsWith('用户')?sc.metadata.subtitle:m.subtitle,country};for(const record of seed.searches??[]){if(record.appId!==app.id||record.country!==country)continue;const t=normalize(record.term);if(!Object.hasOwn(sc.words,t))sc.words[t]={term:t,tracked:false};const remote=seed.histories?.[[app.id,country,t].join('|')]??[];for(const point of remote){sc.words[t].history=addHistory(sc.words[t].history,{...point,status:'ok'});}if(!sc.words[t].record||newer(record.checkedAt,sc.words[t].record.checkedAt)){sc.words[t].record=record;sc.words[t].history=addHistory(sc.words[t].history,record);}}}}}
 ensure(id,country,metadata){const k=scopeKey(id,country),base=this.state.apps[id];if(this.state.scopes[k])return this.state.scopes[k];const known=metadata??base?.storefronts?.[country];const m=known?{...known,country}:{id:String(id),name:base?.name??'App '+id,description:base?.description??'',category:base?.category??'',genres:base?.genres??[],icon:base?.icon??'',developer:base?.developer??'',subtitle:'',rating:null,ratingCount:null,version:'',checkedAt:null,country,countryUnverified:true};return this.state.scopes[k]={metadata:m,profile:inferProfile(m),words:{},competitors:[],drafts:{},experiments:[],analytics:[],updatedAt:null};}
 get selection(){return this.state.selection;}
 get current(){return this.ensure(this.selection.appId,this.selection.country);}
 save(){try{localStorage.setItem(KEY,JSON.stringify(this.state));this.error=null;return true;}catch{this.error='本机存储空间不足或被浏览器禁用；当前修改仅保留在本页，请立即导出备份。';return false;}}
 update(fn){fn(this.state);this.save();}
 addApp(app,country){this.state.apps[app.id]??=app;const sc=this.ensure(app.id,country,app);sc.metadata=app;sc.profile=inferProfile(app);this.state.selection={appId:app.id,country};this.save();}
 select(id,country){this.state.selection={appId:String(id),country};this.ensure(id,country);this.save();}
 addWord(term){const t=normalize(term);if(!t||t.length>160||['__proto__','constructor','prototype'].includes(t))throw new Error('关键词无效；请输入 1–160 字符的普通搜索词。');if(!Object.hasOwn(this.current.words,t))this.current.words[t]={term:t,tracked:false};this.save();return this.current.words[t];}
 record(record){const key=scopeKey(record.appId,record.country),sc=this.state.scopes[key];if(!sc)throw new Error('查询所属的 App / 地区不存在。');const t=normalize(record.term);sc.words[t]??={term:t,tracked:false};sc.words[t].record=record;if(record.status==='ok')sc.words[t].history=addHistory(sc.words[t].history,record);sc.updatedAt=record.checkedAt;this.save();}
 export(){return JSON.stringify({...this.state,exportedAt:new Date().toISOString()},null,2);}
 restore(text){
  const x=JSON.parse(text);
  if(x.schema!==1||!dictionary(x.apps)||!dictionary(x.scopes)||!x.selection||!dictionary(x.popularity)||x.popularityHistory&&!dictionary(x.popularityHistory))throw new Error('不是有效的 ASO Desk 备份。');
  if(!Object.hasOwn(COUNTRIES,x.selection.country)||!Object.hasOwn(x.apps,x.selection.appId)||!Object.hasOwn(x.scopes,scopeKey(x.selection.appId,x.selection.country)))throw new Error('备份缺少选中的 App / 地区。');
  for(const [id,a] of Object.entries(x.apps)){checkSavedApp(a);if(id!==a.id)throw new Error('备份 App ID 不一致。');}
  for(const [k,s] of Object.entries(x.scopes)){
   if(!s.metadata||!dictionary(s.words)||!dictionary(s.drafts)||!s.profile||!Array.isArray(s.profile.features)||!Array.isArray(s.profile.seeds)||!Array.isArray(s.competitors)||!Array.isArray(s.experiments)||!Array.isArray(s.analytics))throw new Error('备份中的工作区结构无效：'+k);
   checkSavedApp(s.metadata);
   const [id,country]=k.split(':');if(k!==scopeKey(id,country)||id!==s.metadata.id||!Object.hasOwn(COUNTRIES,country)||!Object.hasOwn(x.apps,id))throw new Error('备份工作区归属无效。');
   if([...s.profile.features,...s.profile.seeds].some(v=>typeof v!=='string'))throw new Error('备份产品特征无效。');
   for(const [t,w] of Object.entries(s.words)){
    if(!w||typeof w.term!=='string'||t!==normalize(w.term)||w.history&&!Array.isArray(w.history))throw new Error('备份关键词结构无效。');
    for(const p of w.history??[])checkPosition(p);
    if(w.record){const r=w.record;if(!['ok','error'].includes(r.status)||!Array.isArray(r.topResults))throw new Error('备份搜索记录无效。');if(r.status==='ok')checkPosition(r);r.topResults.forEach(checkSavedApp);}
   }
   const checkDraft=d=>{if(!d||['title','subtitle','keywords'].some(f=>typeof d[f]!=='string'))throw new Error('备份文案结构无效。');};
   Object.values(s.drafts).forEach(checkDraft);s.experiments.forEach(v=>checkDraft(v.draft));s.competitors.forEach(checkSavedApp);
   for(const row of s.analytics)if(!row||!validISODate(row.date)||['impressions','pageViews','downloads'].some(f=>!nonnegative(row[f])))throw new Error('备份转化报表无效。');
  }
  Object.values(x.popularity).forEach(checkPopularity);
  for(const h of Object.values(x.popularityHistory??{})){if(!Array.isArray(h))throw new Error('备份热度历史无效。');h.forEach(checkPopularity);}
  this.state=x;this.save();
 }
}
