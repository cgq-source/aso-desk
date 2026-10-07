import { COUNTRIES, normalize, normalizeApp, makeRecord } from './engine.js';
let queue=Promise.resolve(),lastCall=0;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const ttl=6*60*60*1000;
async function scheduled(fn){const run=queue.catch(()=>{}).then(async()=>{await wait(Math.max(0,3700-(Date.now()-lastCall)));lastCall=Date.now();return fn();});queue=run.catch(()=>{});return run;}
async function requestJSON(url){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),14000);try{const r=await fetch(url,{signal:ctrl.signal,referrerPolicy:'no-referrer'});if(!r.ok)throw new Error(`数据源返回 HTTP ${r.status}`);return await r.json();}finally{clearTimeout(timer);}}
function jsonp(url){return new Promise((resolve,reject)=>{const name='aso_cb_'+crypto.getRandomValues(new Uint32Array(2)).join('_'),script=document.createElement('script');let done=false;const clean=()=>{script.remove();clearTimeout(timer);delete window[name];};window[name]=data=>{if(done)return;done=true;clean();resolve(data);};const timer=setTimeout(()=>{if(done)return;done=true;clean();reject(new Error('Apple 查询超时，请稍后再试。'));},15000);script.onerror=()=>{if(done)return;done=true;clean();reject(new Error('Apple 公共接口暂时不可用，可继续使用已有快照。'));};const u=new URL(url);u.searchParams.set('callback',name);script.src=u.href;script.referrerPolicy='no-referrer';document.head.append(script);});}
export class AppleProvider {
 constructor(seed){this.seed=seed;this.cache=new Map();this.inflight=new Map();}
 async apple(path,params,force=false){
  if(params.country&&!COUNTRIES[params.country])throw new Error('请选择支持的国家或地区。');
  const url=new URL('https://itunes.apple.com/'+path);Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));const key=url.href;
  const cached=this.cache.get(key);if(!force&&cached&&Date.now()-cached.time<ttl)return {...cached.value,cached:true};if(this.inflight.has(key))return this.inflight.get(key);
  const promise=scheduled(async()=>{let data;try{data=await requestJSON(key);}catch{data=await scheduledFallback(()=>jsonp(key));}if(!Array.isArray(data.results))throw new Error('Apple 返回的数据格式不支持。');const value={data,sourceURL:key,checkedAt:new Date().toISOString(),cached:false};this.cache.set(key,{time:Date.now(),value});return value;}).finally(()=>this.inflight.delete(key));this.inflight.set(key,promise);return promise;
 }
 async lookup(id,country,force=false){const x=await this.apple('lookup',{id,country},force);const r=x.data.results.find(r=>String(r.trackId)===String(id));if(!r)throw new Error('这个 App 在所选地区没有公开资料，请检查 App ID 或切换地区。');return {...x,app:normalizeApp(r)};}
 async search(term,country,limit=200,force=false){return this.apple('search',{term:normalize(term),country,media:'software',entity:'software',limit},force);}
 async rank(term,country,app,force=false){const x=await this.search(term,country,200,force);return {...makeRecord(term,country,app,x.data.results,x.checkedAt),sourceURL:x.sourceURL,cached:x.cached};}
 async chart(country,type='apps-free',force=false){
  const urls={'apps-free':`https://rss.marketingtools.apple.com/api/v2/${country}/apps/top-free/100/apps.json`,'games-free':`https://itunes.apple.com/${country}/rss/topfreeapplications/limit=100/genre=6014/json`};const url=urls[type];if(!url)throw new Error('此榜单尚未支持。');
  try{const data=await scheduled(()=>requestJSON(url));const rows=data.feed?.results??data.feed?.entry??[];const results=rows.map(r=>r.id?.attributes?{id:r.id.attributes['im:id'],name:r['im:name']?.label,developer:r['im:artist']?.label,icon:r['im:image']?.at(-1)?.label,url:r.id?.label,category:r.category?.attributes?.label}:{id:String(r.id),name:r.name,developer:r.artistName,icon:r.artworkUrl100,url:r.url,category:r.genres?.[0]?.name});return {country,type,sourceURL:url,checkedAt:new Date().toISOString(),results,cached:false};}catch(error){const cached=this.seed.charts?.find(r=>r.country===country&&r.type===type);if(cached)return {...cached,cached:true,warning:'实时榜单暂不可用，显示已采集快照。'};throw error;}
 }
 async reviews(id,country){const url=`https://itunes.apple.com/${country}/rss/customerreviews/id=${id}/sortby=mostrecent/json`;try{const data=await scheduled(()=>requestJSON(url));return {appId:String(id),country,sourceURL:url,checkedAt:new Date().toISOString(),results:(data.feed?.entry??[]).filter(x=>x['im:rating']).map(r=>({id:r.id?.label,title:r.title?.label,body:r.content?.label,rating:Number(r['im:rating'].label),author:r.author?.name?.label,version:r['im:version']?.label,date:r.updated?.label})),cached:false};}catch(error){const cached=this.seed.reviews?.find(r=>r.appId===String(id)&&r.country===country);if(cached)return {...cached,cached:true,warning:'实时评论源暂不可用，显示已采集快照。'};throw error;}}
}
// A failed fetch gets exactly one documented JSONP fallback, without nesting the queue.
async function scheduledFallback(fn){await wait(Math.max(0,3700-(Date.now()-lastCall)));lastCall=Date.now();return fn();}
