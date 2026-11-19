'use strict';
// Explicit demo-emulator preview fixtures only. Never load this in a browser.
const {seed,project}=require('../tests/seed-emulator.cjs');
const {createEmulatorVerifier}=require('./emulator-check-in-verifier.cjs');
async function seedDashboardPreview(){
 if(process.env.GCLOUD_PROJECT!==project||process.env.FIREBASE_DATABASE_EMULATOR_HOST!=='127.0.0.1:9000'||process.env.FIREBASE_AUTH_EMULATOR_HOST!=='127.0.0.1:9099')throw Error('Dashboard preview requires the isolated demo Auth/RTDB emulators.');
 const accounts=await seed(), uid=accounts['guest-a'].localId;
 const request=async(route,method='GET',value)=>{const response=await fetch('http://127.0.0.1:9000/'+route+'.json?ns='+project+'-default-rtdb',{method,headers:{Authorization:'Bearer owner','Content-Type':'application/json'},...(value===undefined?{}:{body:JSON.stringify(value)})});if(!response.ok)throw Error('Preview fixture operation failed.');return response.json()};
 const specs=[['CBLR-820001','pool','Confirmed','00820101'],['CBLR-820002','event','Confirmed','00820102'],['CBLR-820003','pool','Pending Verification',''],['CBLR-820004','pool','Confirmed','00820104']];
 for(const [reference,kind,status,card]of specs){
  const existing=await request('sharedReservations/'+reference);
  if(existing&&existing.submissionAttemptId!=='dashboard-preview-'+reference)throw Error('Preview reference is already used by another fixture; no overwrite allowed.');
  if(card){const claim=await request('rfidAssignments/'+card);if(claim&&claim!==reference)throw Error('Preview card belongs to another fixture.');}
  const subtotal=kind==='event'?15000:1200;
  const record={reference,ownerUid:uid,submissionAttemptId:'dashboard-preview-'+reference,checkinDate:'2026-12-25',staySlotId:'day-retreat',duration:'Day Retreat (8:00 AM – 6:00 PM)',adults:2,children:0,senior:0,totalGuests:2,honorific:'Ms.',guestName:'Emulator Preview Guest',mobile:'00000000000',email:'guest-a@example.test',specialRequests:'Demo-emulator preview only',facilities:[{value:kind,name:kind==='event'?'Celebration Event Package':'Swimming Pool',price:subtotal,...(kind==='event'?{packageVersion:2}:{})}],prices:{subtotal,tourismTax:250,serviceCharge:subtotal*.08,total:subtotal+250+subtotal*.08},status,rfidLinked:card,createdAt:new Date().toISOString()};
  await request('sharedReservations/'+reference,'PUT',record);if(card)await request('rfidAssignments/'+card,'PUT',reference);
 }
 const events=specs.slice(0,2).map(([reference,kind,status,card])=>({eventId:'dashboard-preview-scan-'+reference+'-'+Date.now(),readerId:'emulator-fixture-reader',uid:card,byteCount:4,authenticated:true,fullUid:true,receivedAt:Date.now()}));
 const verify=createEmulatorVerifier({fixtures:events});for(const event of events)await verify(event.eventId);
 return {accounts,references:{pool:'CBLR-820001',event:'CBLR-820002',pending:'CBLR-820003',confirmed:'CBLR-820004'}};
}
module.exports={seedDashboardPreview};
if(require.main===module)seedDashboardPreview().then(()=>console.log('Demo-only dashboard fixtures ready: Pool CBLR-820001, Event CBLR-820002, Pending CBLR-820003, Confirmed CBLR-820004. Sign in as guest-a@example.test / TestPass123!')).catch(error=>{console.error(error.message);process.exitCode=1});
