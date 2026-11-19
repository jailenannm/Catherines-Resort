'use strict';
// Source boundary probe only: every fetch and Firebase ref is a local double.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const calls=[];
const window={SharedReservations:{async identity(){return{admin:true,user:{uid:'fixture-admin'}}}},SHARED_RESERVATIONS_CONFIG:{mode:'cloud'},FIREBASE_CONFIG:{databaseURL:'https://device.invalid'}};
window.firebase={apps:[{name:'admin-diorama-monitor',database(){return{ref(){return{on(event,next){next({val:()=>null})},off(){}}}}}}]};
const document={createElement(){return{}},head:{appendChild(script){script.onload()}}};
const fakeFetch=async(url,options={})=>{calls.push({url:String(url),options});return{ok:true,json:async()=>options.body?JSON.parse(options.body):{}}};
const context=vm.createContext({window,document,URL,AbortSignal,Date,Object,JSON,Promise,Error,fetch:fakeFetch});
vm.runInContext(fs.readFileSync('js/admin-device-transport.js','utf8'),context);
(async()=>{const service=await window.AdminDeviceTransport.create('fixture-admin');await service.refresh();const result=await service.send('pool/pump',true);
 assert.equal(result.accepted,true);assert.equal(calls.length,2);
 for(const call of calls){assert.equal(new URL(call.url).searchParams.has('auth'),false);assert.equal(call.options.headers?.Authorization,undefined);}
 service.close();console.log('CONFIRMED AUDIT LIMIT: device GET/PUT carry no device-project credential; a matching database echo yields accepted=true with no controller acknowledgement. All transport was fake.');
})().catch(error=>{console.error(error);process.exitCode=1});
