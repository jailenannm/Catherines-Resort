"use strict";
// Shared lifecycle only. No local history, storage clearing, device connector or commands.
document.addEventListener('DOMContentLoaded',()=>{
 const $=id=>document.getElementById(id),Shared=window.SharedReservations;
 const reference=new URL(location.href).searchParams.get('reservation');
 let off=()=>{},busy=false,state;
 $('checkoutBack').href='my-reservation.html'+(/^CBLR-[0-9]{6}$/.test(reference||'')?'?reservation='+encodeURIComponent(reference):'');
 const emulator=window.SHARED_RESERVATIONS_CONFIG?.mode==='emulator'&&window.SHARED_RESERVATIONS_CONFIG?.cloudTest!==true;
 function render(next){
  state=next;const record=next.reservation;
  $('checkoutReference').textContent=record?'Booking '+record.reference:'Your reservation';
  $('checkoutStatus').textContent=record?.status||'';
  $('requestCheckout').hidden=!record||record.status!=='Checked In';$('requestCheckout').disabled=busy;
  $('checkoutSignIn').hidden=Boolean(next.user)||next.loading;
  $('retryCheckout').hidden=next.loading||Boolean(record);
  $('checkoutMessage').textContent=next.loading?'Loading your shared reservation…':!record?'This reservation is unavailable. Sign in or return to My Reservation to select your booking.':record.status==='Checked In'?'Request checkout when ready. Reserved facilities lock after the shared request is saved.':record.status==='Checking Out'?'Your checkout request is saved. Facility access is locked. Please wait for front-desk departure verification; completion is simulated only by a trusted emulator fixture.':record.status==='Completed'?'Your shared booking is Completed. Facility access remains locked. This emulator does not confirm physical departure.':'This booking is not eligible to request checkout.';
 }
 function start(){off();render({loading:true});off=Shared.subscribeOwnedReservation(reference,render);}
 $('retryCheckout').addEventListener('click',start);
 $('checkoutSignIn').addEventListener('click',()=>{if(/^CBLR-[0-9]{6}$/.test(reference||'')){try{sessionStorage.setItem('myReservationSignInReference',reference);}catch{/* Optional selector only. */}}});
 $('requestCheckout').addEventListener('click',async()=>{
  if(busy||state?.reservation?.status!=='Checked In')return;
  const selected=state.reservation,owner=state.user?.uid;
  busy=true;$('requestCheckout').disabled=true;
  try{const result=await Shared.requestCheckout(selected.reference);if(state.user?.uid===owner&&state.reservation?.reference===selected.reference)render({...state,reservation:{...state.reservation,status:result.status}});}
  catch(error){if(state.user?.uid===owner)$('checkoutMessage').textContent=error.message||'Checkout request failed. Please retry.';}
  finally{busy=false;$('requestCheckout').disabled=false;}
 });
 if(emulator)start();else $('checkoutMessage').textContent='Checkout is unavailable in this environment. Live departure verification is not configured. Return to My Reservation.';
 window.addEventListener('pagehide',()=>off(),{once:true});
});
