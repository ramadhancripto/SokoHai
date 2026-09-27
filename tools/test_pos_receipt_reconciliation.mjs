#!/usr/bin/env node
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const child = String.raw`
const assert = require('node:assert/strict');
const Module = require('node:module');
const originalLoad = Module._load;
const docs = new Map();
const snap = data => ({ exists: data !== undefined, data: () => data });
const ref = path => ({ path, id: path.split('/').pop(), async get() { return snap(docs.get(path)); } });
const db = { doc(path) { return ref(path); }, collection(name) { return { where(field, op, value) { return { name, field, op, value }; } }; }, async runTransaction(fn) { const writes=[]; const tx={ async get(target){ if(target?.name) return {docs:[...docs.entries()].filter(([p,d])=>p.startsWith(target.name+'/')&&d&&d[target.field]===target.value).map(([p,d])=>({id:p.split('/').pop(),data:()=>d}))}; return snap(docs.get(target.path)); }, create(target,data){writes.push(['create',target,data]);}, set(target,data,opt){writes.push(['set',target,data,opt]);} }; const out=await fn(tx); for(const w of writes){if(w[0]==='create') docs.set(w[1].path,w[2]); else docs.set(w[1].path,w[3]?.merge?{...(docs.get(w[1].path)||{}),...w[2]}:w[2]);} return out;} };
const admin={firestore:Object.assign(()=>db,{FieldValue:{}})};
Module._load=function(request,parent,isMain){if(request==='firebase-functions/v2/https')return{onCall:(_o,h)=>h,HttpsError:class HttpsError extends Error{constructor(c,m){super(m);this.code=c;}}};if(request==='firebase-admin')return admin;if(request==='./business-store-authority')return{resolveBusinessStoreContext:async({auth,product,requestedBusinessId,requestedStoreId})=>{if(!auth||auth.uid!=='cashier-1')throw new Error('UNAUTHORIZED');if(product.businessId!==requestedBusinessId||product.storeId!==requestedStoreId)throw new Error('SCOPE');return{ownerUid:'seller-1',businessId:requestedBusinessId,storeId:requestedStoreId};}};return originalLoad.call(this,request,parent,isMain);};
const a=require('./functions/inventory-authority.js');
const call=(name,data,auth={uid:'cashier-1',token:{}})=>a[name]({data,auth});
const put=(p,d)=>docs.set(p,d);
const sale=(id,method='Cash',payment={method,amount:100,total:100})=>({saleId:id,idempotencyKey:id+'-key',businessId:'b1',storeId:'s1',sellerId:'seller-1',cashierId:'cashier-1',status:'COMPLETED',immutableSnapshot:true,customer:{name:'Asha',phone:'0700'},items:[{productId:'p1',productNameAtSale:'Old Name',quantity:2,stockQuantity:2,unitMode:'pc',unitPriceAtSale:50,lineTotal:100,variantId:null,sku:'SKU1'}],totals:{subtotal:100,discount:0,total:100},payment,createdAt:'2026-01-01T00:00:00.000Z'});
const req=(type,id,extra={})=>({idempotencyKey:type+'-key-'+id,businessId:'b1',storeId:'s1',transactionType:type,originalSaleId:id,...extra});
const err=async(p,e)=>{await assert.rejects(p,x=>{assert.ok(x.code===e||x.message.includes(e));return true;});};
(async () => {
put('sales/sale-cash',sale('sale-cash','Cash',{method:'Cash',amount:100,cashReceived:120,change:20,status:'RECORDED'}));
const r=await call('posReceipt',req('SALE','sale-cash',{total:999})); assert.equal(r.transactionType,'SALE'); assert.equal(r.total,100); assert.equal(r.items[0].productNameAtSale,'Old Name'); assert.match(r.receiptNumber,/^SKH-b1-s1-receipt_sale_sale-cash$/); assert.equal((await call('posReceipt',req('SALE','sale-cash'))).receiptId,r.receiptId);
const rec=await call('posReconcile',req('SALE','sale-cash')); assert.equal(rec.status,'RECONCILED'); assert.equal(rec.expectedAmount,100); assert.equal((await call('posReconcile',req('SALE','sale-cash'))).reconciliationId,rec.reconciliationId);
put('sales/sale-mno',sale('sale-mno','Mpesa',{method:'Mpesa',amount:100,status:'PENDING_VERIFICATION'})); assert.equal((await call('posReconcile',req('SALE','sale-mno'))).status,'PENDING');
put('sales/sale-deni',sale('sale-deni','Deni',{method:'Deni',amount:100,deposit:40,outstanding:60,status:'CREDIT_OPEN'})); const dr=await call('posReconcile',req('SALE','sale-deni')); assert.equal(dr.status,'PENDING'); assert.equal(dr.difference,60);
put('sale_adjustments/adj1',{adjustmentId:'adj1',adjustmentType:'RETURN',originalSaleId:'sale-cash',businessId:'b1',storeId:'s1',sellerId:'seller-1',status:'RETURNED',amount:50,paymentMethod:'Cash',paymentStatus:'REFUND_PENDING',inventoryDisposition:'SELLABLE_RETURN',items:[{productId:'p1',originalSaleItemId:'sale-cash:item:0',quantity:1,amount:50}]});
const rr=await call('posReceipt',req('RETURN','sale-cash',{adjustmentId:'adj1'})); assert.equal(rr.total,50); assert.equal(rr.status,'RETURNED'); assert.equal(rr.adjustmentId,'adj1'); const rrec=await call('posReconcile',req('RETURN','sale-cash',{adjustmentId:'adj1'})); assert.equal(rrec.status,'PENDING');
put('refunds/ref1',{refundId:'ref1',originalSaleId:'sale-cash',adjustmentId:'adj1',businessId:'b1',storeId:'s1',amount:50,method:'Cash',status:'REFUND_PENDING',reference:null,pendingReason:'CASHIER_CONFIRMATION_REQUIRED'}); const fr=await call('posReceipt',req('REFUND','sale-cash',{refundId:'ref1'})); assert.equal(fr.total,50); assert.equal(fr.payment.status,'REFUND_PENDING'); assert.equal((await call('posReconcile',req('REFUND','sale-cash',{refundId:'ref1'}))).status,'PENDING');
put('credit_adjustments/ca1',{creditAdjustmentId:'ca1',originalSaleId:'sale-deni',adjustmentId:'adj2',businessId:'b1',storeId:'s1',amount:40,status:'CREDIT_ADJUSTED',previousOutstanding:100,newOutstanding:60,creditStatus:'CREDIT_OPEN'}); put('sale_adjustments/adj2',{adjustmentType:'RETURN',originalSaleId:'sale-deni',businessId:'b1',storeId:'s1',status:'RETURNED',amount:40,paymentStatus:'CREDIT_ADJUSTED'}); const cr=await call('posReceipt',req('CREDIT_ADJUSTMENT','sale-deni',{creditAdjustmentId:'ca1',adjustmentId:'adj2'})); assert.equal(cr.payment.newOutstanding,60); assert.equal((await call('posReconcile',req('CREDIT_ADJUSTMENT','sale-deni',{creditAdjustmentId:'ca1',adjustmentId:'adj2'}))).status,'RECONCILED');
put('sale_voids/v1',{voidId:'v1',originalSaleId:'sale-cash',businessId:'b1',storeId:'s1',status:'VOIDED',originalSaleTotal:100,inventoryApplied:true,financialStatus:'FINANCIAL_REVERSAL_PENDING'}); const vr=await call('posReceipt',req('VOID','sale-cash',{voidId:'v1'})); assert.equal(vr.status,'VOIDED'); assert.equal(vr.payment.status,'FINANCIAL_REVERSAL_PENDING'); assert.equal((await call('posReconcile',req('VOID','sale-cash',{voidId:'v1'}))).status,'PENDING');
await err(call('posReceipt',{...req('SALE','sale-cash'),businessId:'other'}),'SALE_SCOPE_MISMATCH'); await err(call('posReceipt',req('SALE','sale-cash'),null),'unauthenticated');
assert.equal(typeof a.posReceipt,'function'); assert.equal(typeof a.posReconcile,'function'); assert.equal(typeof a.posSale,'function'); assert.equal(typeof a.posReturn,'function'); assert.equal(typeof a.posRefund,'function'); assert.equal(typeof a.posCreditAdjustment,'function'); assert.equal(typeof a.posVoid,'function'); assert.equal(typeof a.inventoryAdjust,'function');
console.log('POS-5 receipt reconciliation checks passed');
})();
`;

execFileSync(process.execPath, ['--input-type=commonjs', '-'], { cwd: new URL('..', import.meta.url).pathname, input: child, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
