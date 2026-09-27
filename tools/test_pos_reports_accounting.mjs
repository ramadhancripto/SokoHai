import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const script = String.raw`
const Module=require('module'); const original=Module._load;
function firestore(){return {collection:()=>({where(){return this;},get:async()=>({docs:[]})})}}; firestore.FieldValue={};
Module._load=function(request,parent,isMain){
 if(request==='firebase-functions/v2/https') return {onCall:(_o,h)=>h,HttpsError:class HttpsError extends Error{constructor(c,m){super(m);this.code=c;}}};
 if(request==='firebase-admin') return {firestore};
 if(request==='./business-store-authority') return {resolveBusinessStoreContext:async({requestedBusinessId,requestedStoreId})=>({businessId:requestedBusinessId,storeId:requestedStoreId,ownerUid:'owner'})};
 return original.call(this,request,parent,isMain);
};
const { _testing }=require('./functions/reporting-authority'); const { aggregateReport, periodBounds } = _testing;
if (periodBounds({ preset: 'today', asOf: '2026-09-15T12:00:00.000Z' }).end !== '2026-09-16T00:00:00.000Z') throw Error('today period');
if (periodBounds({ preset: 'last_month', asOf: '2026-09-15T12:00:00.000Z' }).start !== '2026-08-01T00:00:00.000Z') throw Error('last month period');
const period={start:'2026-09-01T00:00:00.000Z',end:'2026-10-01T00:00:00.000Z'};
const sale={saleId:'s1',businessId:'b1',storeId:'st1',cashierId:'cashier-1',status:'COMPLETED',completedAt:'2026-09-10T10:00:00.000Z',totals:{total:100,discount:5},payment:{method:'Cash',status:'RECORDED',amount:100,cashReceived:120,change:20},items:[{productId:'p1',variantId:'v1',sku:'SKU-RED',unitId:'piece',inventoryKey:'p1:v1:piece',quantity:2,lineTotal:100}]};
const other={...sale,saleId:'other',businessId:'other-business'};
const report=aggregateReport({businessId:'b1',storeId:'st1',period,sales:[sale,other],adjustments:[{businessId:'b1',storeId:'st1',status:'RETURNED',amount:20,updatedAt:'2026-09-11T10:00:00.000Z'}],refunds:[{businessId:'b1',storeId:'st1',status:'REFUND_PENDING',amount:20,updatedAt:'2026-09-11T10:00:00.000Z'}],credits:[{businessId:'b1',storeId:'st1',status:'CREDIT_ADJUSTMENT_PENDING',amount:10,updatedAt:'2026-09-11T10:00:00.000Z',creditAdjustmentId:'c1'},{businessId:'b1',storeId:'st1',status:'CREDIT_ADJUSTMENT_PENDING',amount:10,updatedAt:'2026-09-11T10:00:00.000Z',creditAdjustmentId:'c1'}],voids:[{businessId:'b1',storeId:'st1',status:'VOIDED',originalSaleTotal:30,updatedAt:'2026-09-12T10:00:00.000Z'}],movements:[{businessId:'b1',storeId:'st1',movementType:'SALE',quantity:-2,createdAt:'2026-09-10T10:00:00.000Z'}],ledger:[{businessId:'b1',storeId:'st1',type:'expense',amount:8,date:'2026-09-10T10:00:00.000Z'},{businessId:'b1',storeId:'st1',type:'supplier_payment',amount:12,date:'2026-09-10T10:00:00.000Z'}]});
if(report.summary.grossSales!==100||report.summary.returnedAmount!==20||report.summary.netSales!==50) throw Error('net semantics');
if(report.summary.refundsPending!==20||report.summary.expenses!==8||report.summary.supplierPayments!==12) throw Error('pending/ledger semantics');
if(report.summary.cashCollected!==100||report.payments.Cash.completedAmount!==100) throw Error('cash semantics');
if(report.products['p1:v1:piece'].sku!=='SKU-RED'||report.cashiers['cashier-1'].grossSales!==100) throw Error('identity/cashier semantics');
if(report.summary.creditOutstanding!==0) throw Error('duplicate credit or scope leak');
const boundary=aggregateReport({businessId:'b1',storeId:'st1',period:{start:'2026-09-10T00:00:00.000Z',end:'2026-09-11T00:00:00.000Z'},sales:[sale]});
if(boundary.summary.completedSales!==1) throw Error('date boundary');
console.log('POS-7 reports/accounting behavioral checks passed');
`;
execFileSync(process.execPath, ['--input-type=commonjs', '-'], { input: script, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
assert.ok(true);
