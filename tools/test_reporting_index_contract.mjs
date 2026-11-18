// Isolated module doubles model production Firestore rejecting missing indexes.
import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';
const indexes=JSON.parse(fs.readFileSync(new URL('../firestore.indexes.json',import.meta.url)));
const fields={sales:'completedAt',sale_adjustments:'updatedAt',refunds:'updatedAt',credit_adjustments:'updatedAt',sale_voids:'updatedAt',inventory_movements:'createdAt',shop_ledger:'date'};
for(const [col,field] of Object.entries(fields)){
 const found=indexes.indexes.some(x=>x.collectionGroup===col&&x.queryScope==='COLLECTION'&&['businessId','storeId',field].every(k=>x.fields.some(f=>f.fieldPath===k&&f.order==='ASCENDING')));
 assert(found,`Missing report index: ${col}, businessId, storeId, ${field}`);
}
console.log('REPORT INDEX CONTRACT: all seven scoped time-range query indexes declared.');
const fake=String.raw`
const Module=require('module'),old=Module._load;class HttpsError extends Error{constructor(code,message){super(message);this.code=code}}
const firestore=()=>({collection:col=>({where(){return this},get:async()=>{if(col==='sales'){const e=new Error('The query requires an index. synthetic-only');e.code=9;throw e}return{docs:[]}}})});
Module._load=function(id,p,i){if(id==='firebase-functions/v2/https')return {onCall:(_o,h)=>h,HttpsError};if(id==='firebase-admin')return {firestore};if(id==='./business-store-authority')return{resolveBusinessStoreContext:async()=>({businessId:'b',storeId:'s'})};return old.call(this,id,p,i)};
const f=require('./functions/reporting-authority');f.posReports({auth:{uid:'synthetic'},data:{period:{start:'2026-11-01',end:'2026-12-01'}}}).then(()=>{console.error('did not fail');process.exit(1)},e=>{if(e.code!=='failed-precondition'||!e.message.startsWith('REPORT_INDEX_UNAVAILABLE'))throw e;console.log('REPORT INDEX FAILURE: typed safe diagnostic, no false zero.');});
`;
execFileSync(process.execPath,['--input-type=commonjs','-'],{cwd:new URL('..',import.meta.url),input:fake,stdio:['pipe','inherit','inherit']});
