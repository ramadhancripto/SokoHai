#!/usr/bin/env node
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const dom=new JSDOM('<button id="accept">Kubali</button>',{runScripts:'outside-only'}), w=dom.window;
const source=fs.readFileSync(new URL('../js/app/16-pos-admin-jobs.js',import.meta.url),'utf8');
const start=source.indexOf('const skhAcceptingRides = new Set();'), end=source.indexOf('\nwindow.verifyHandoverToken =',start);
assert(start>0&&end>start);let calls=0,resolve,opened=0, messages=[];
w.skh={requireAuth:()=>true};w.sokohaiToast=(msg,type)=>messages.push({msg,type});w.skhOpenTokenBox=()=>opened++;
w.skhCustodyServerAccept=()=>{calls++;return new Promise(r=>resolve=r)};
w.eval('const skh=window.skh;\n'+source.slice(start,end));
const btn=w.document.querySelector('button');
let first=w.directRequestTransporter('ride',btn);assert(btn.disabled);assert.equal(btn.textContent,'Inakubali…');
await w.directRequestTransporter('ride',btn);assert.equal(calls,1);assert.equal(opened,0);assert.equal(messages.length,0);
resolve({data:{ok:true,token:'PK-OK'}});await first;assert.equal(opened,1);assert.equal(messages[0].type,'success');assert(!btn.disabled);
w.skhCustodyServerAccept=async()=>({data:{ok:false,message:'No'}});await w.directRequestTransporter('ride',btn);assert.equal(opened,1);assert.equal(messages.at(-1).type,'error');
w.skhCustodyServerAccept=async()=>{let e=new Error('Ombi limechukuliwa');e.code='functions/failed-precondition';throw e};await w.directRequestTransporter('ride',btn);assert.equal(messages.at(-1).msg,'Ombi limechukuliwa');assert.equal(opened,1);assert(!btn.disabled);
console.log('PICKUP ACCEPT UI: busy, duplicate guard, success and two failure cases passed (JSDOM)');
