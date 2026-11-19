'use strict';
// Trusted-server library only. No HTTP endpoint, reader key, deployment or device command.
const {createHmac,timingSafeEqual}=require('node:crypto');
const {createCheckInVerifier}=require('./check-in-verifier.cjs');
const signedFields=p=>JSON.stringify([p.readerId,p.eventId,p.uid,p.byteCount,p.observedAt]);
function createSignedRfidCheckIn({readerKeys,store,now=Date.now,isBookingEligible}) {
 const events=new Map();
 const verify=createCheckInVerifier({store,now,isBookingEligible,allowedReaders:Object.keys(readerKeys),resolveTrustedScan:id=>events.get(id)});
 return async function receive(payload,signature) {
  const key=Object.hasOwn(readerKeys,payload?.readerId)?readerKeys[payload.readerId]:null,time=now();
  if(!(typeof key==='string'||Buffer.isBuffer(key))||Buffer.byteLength(key)<32||!/^[A-Za-z0-9_-]{16,100}$/.test(payload?.eventId||'')||
   !/^(?:[0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/.test(payload?.uid||'')||
   ![4,7,10].includes(payload?.byteCount)||payload.uid.length!==payload.byteCount*2||
   !Number.isSafeInteger(payload.observedAt)||time-payload.observedAt<0||time-payload.observedAt>15000||
   !/^[0-9a-f]{64}$/.test(signature||''))throw Error('Unauthenticated or stale reader event.');
  const expected=createHmac('sha256',key).update(signedFields(payload)).digest();
  if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))throw Error('Unauthenticated reader event.');
  const previous=events.get(payload.eventId),fingerprint=signedFields(payload);
  if(previous&&previous.fingerprint!==fingerprint)throw Error('Scan event identity was reused.');
  for(const [id,event]of events)if(time-event.receivedAt>15000)events.delete(id);
  if(events.size>=1000&&!events.has(payload.eventId))throw Error('Reader ingress busy. Retry.');
  events.set(payload.eventId,previous||Object.freeze({eventId:payload.eventId,readerId:payload.readerId,uid:payload.uid,byteCount:payload.byteCount,receivedAt:time,authenticated:true,fullUid:true,fingerprint}));
  return verify(payload.eventId);
 };
}
module.exports={createSignedRfidCheckIn,signedFields};
