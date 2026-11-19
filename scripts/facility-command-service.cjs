'use strict';
// Server-only policy core; no live credentials, endpoint or default device transport.
// Inject only trusted server data adapters. Never pass browser-supplied state/claims.
function createFacilityCommandService({verifyIdToken,readBooking,readTelemetry,transport,integrations={},now=Date.now}) {
 const pending=new Map();
 const includes=(r,facility)=>(r.facilities||[]).some(f=>f.value===facility||f.value==='buyout'||facility==='pool'&&f.value==='event'&&f.packageVersion===2);
 async function authorize(token,reference,facility) {
  const identity=await verifyIdToken(token); // Adapter must verify signature, issuer/audience, expiry/revocation.
  if(!identity?.uid)throw Error('Sign in required.');
  if(identity.admin===true)return identity;
  const booking=await readBooking(reference);
  if(!booking||booking.reference!==reference||booking.ownerUid!==identity.uid||booking.status!=='Checked In'||!includes(booking,facility))throw Error('Booking access denied.');
  return identity;
 }
 async function readiness(token,reference) {
  await authorize(token,reference,'ktv');
  const state=await readTelemetry();
  if(!state||!Number.isSafeInteger(state.receivedAt)||now()-state.receivedAt<0||now()-state.receivedAt>3000||state.hallOpen!==true)throw Error('Fresh Hall-confirmed readiness required.');
  // Shared-speaker arbitration must come from a verified coordinator, not a UI flag.
  if(state.audioOwner!=='ktv')throw Error('KTV audio route unavailable or reserved by Event.');
  return {allowed:true,reference,expiresAt:state.receivedAt+3000,mode:'local-preview'};
 }
 async function request({token,reference,action,value,requestId}) {
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(requestId||''))throw Error('Invalid request identity.');
  const facility=action==='pool-pump'?'pool':action==='ktv-rgb'?'ktv':null;
  if(!facility)throw Error('Unsupported command.');
  const identity=await authorize(token,reference,facility);
  if(action==='pool-pump'&&(identity.admin!==true||typeof value!=='boolean'))throw Error('Pool pump is administrator-only.');
  if(action==='ktv-rgb'&&(!value||Object.keys(value).sort().join(',')!=='b,g,r'||!['r','g','b'].every(k=>typeof value[k]==='boolean')))throw Error('Invalid digital RGB channels.');
  if(integrations[action]!==true||!transport)throw Error('Hardware integration unavailable pending bench verification.');
  const key=identity.uid+':'+requestId,fingerprint=JSON.stringify([reference,action,value]);
  if(pending.has(key)){const prior=pending.get(key);if(prior.fingerprint!==fingerprint)throw Error('Request identity reused.');return prior.promise;}
  const operation=(async()=>{
   const state=await readTelemetry(),board='esp2';
   if(!state||state.connected!==true||state[board]!=='Online'||!Number.isSafeInteger(state.receivedAt)||now()-state.receivedAt<0||now()-state.receivedAt>3000)throw Error('Fresh controller state required.');
   if(action==='ktv-rgb'&&identity.admin!==true)await readiness(token,reference);
   await authorize(token,reference,facility); // Re-read server ownership/status/package immediately before submit.
   const latest=await readTelemetry();
   if(!latest||latest.connected!==true||latest[board]!=='Online'||!Number.isSafeInteger(latest.receivedAt)||now()-latest.receivedAt<0||now()-latest.receivedAt>3000)throw Error('Fresh controller state required.');
   if(action==='ktv-rgb'&&identity.admin!==true&&(latest.hallOpen!==true||latest.audioOwner!=='ktv'))throw Error('KTV readiness changed before submission.');
   const path=action==='pool-pump'?'pool/pump':'ktv';
   const payload=action==='pool-pump'?value:{lightMode:'static','light/r':value.r,'light/g':value.g,'light/b':value.b};
   // submit must durably deduplicate key+fingerprint and reauthorize at worker execution.
   // It must NOT equate a Firebase write acknowledgement to device acknowledgement.
   const accepted=await transport.submit({key,fingerprint,path,payload});
   if(accepted?.accepted!==true)throw Error('Request acceptance not confirmed. Retry the same identity.');
   return {requestId,requestAccepted:true,deviceAcknowledged:false,physicalResultConfirmed:false};
  })();
  pending.set(key,{fingerprint,promise:operation});
  try{return await operation;}finally{pending.delete(key);}
 }
 return {readiness,request};
}
module.exports={createFacilityCommandService};
