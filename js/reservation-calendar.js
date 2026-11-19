"use strict";
// Read-only availability UI. No booking, hold, device or private-reservation query.
(function () {
 const date=document.getElementById('checkinDate'),slot=document.getElementById('stayDuration'),months=document.getElementById('calendarMonths'),status=document.getElementById('availabilityStatus');
 if(!date||!slot||!months||!status)return;
 const key=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
 const parse=value=>{const parts=String(value).split('-').map(Number);return new Date(parts[0],parts[1]-1,parts[2]);};
 let view=parse(date.value||date.min),generation=0,days={},expires=0,verifiedKey='',source='';
 view=new Date(view.getFullYear(),view.getMonth(),1);
 const facilities=()=>[...document.querySelectorAll('input[name="facility"]:checked')].map(n=>n.value).sort();
 const context=(record)=>({date:record?.checkinDate||date.value,slotId:record?.staySlotId||slot.value,facilities:record?record.facilities.map(f=>f.value).sort():facilities()});
 const contextKey=c=>JSON.stringify([c.slotId,c.facilities]);
 const fresh=c=>Date.now()<expires&&verifiedKey===contextKey(c);
 function render(){
  const focused=document.activeElement?.dataset.calendarDate;months.replaceChildren();const c=context();
  for(let offset=0;offset<2;offset++){
   const first=new Date(view.getFullYear(),view.getMonth()+offset,1),section=document.createElement('section');section.className='calendar-month';
   const title=document.createElement('h3');title.id='calendarMonth'+offset;title.textContent=first.toLocaleDateString(undefined,{month:'long',year:'numeric'});section.setAttribute('aria-labelledby',title.id);section.appendChild(title);
   const grid=document.createElement('div');grid.className='calendar-days';
   for(const label of ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']){const day=document.createElement('span');day.className='calendar-weekday';day.textContent=label;grid.appendChild(day);}
   for(let empty=0;empty<(first.getDay()+6)%7;empty++)grid.appendChild(document.createElement('span'));
   const end=new Date(first.getFullYear(),first.getMonth()+1,0).getDate();
   for(let number=1;number<=end;number++){
    const day=new Date(first.getFullYear(),first.getMonth(),number),value=key(day),button=document.createElement('button'),availability=fresh(c)?days[value]:undefined;
    button.type='button';button.dataset.calendarDate=value;button.textContent=number;button.setAttribute('aria-pressed',String(date.value===value));button.setAttribute('aria-label',day.toLocaleDateString(undefined,{weekday:'long',year:'numeric',month:'long',day:'numeric'})+(availability?' — '+availability:''));button.disabled=value<date.min||availability==='unavailable';
    if(availability)button.dataset.availability=availability;
    button.addEventListener('click',()=>{date.value=value;date.dispatchEvent(new Event('input',{bubbles:true}));date.dispatchEvent(new Event('change',{bubbles:true}));});grid.appendChild(button);
   }
   section.appendChild(grid);months.appendChild(section);
  }
  if(focused)months.querySelector(`[data-calendar-date="${focused}"]`)?.focus({preventScroll:true});
 }
 function message(c,result){
  if(!c.facilities.length){status.textContent='Pick a date. Availability will be checked after facility selection in Step 3.';return;}
  if(result.status==='available')status.textContent=`Available for the selected facilities and stay slot. Source: ${result.snapshot?.source||source}. No slot is held; bookings remain pending verification.`;
  else if(result.status==='unavailable')status.textContent='Unavailable for the selected facilities and stay slot. Choose another date or selection.';
  else status.textContent='Couldn’t verify availability. This remains a pending request; availability must be confirmed by the resort.';
 }
 async function lookup(c,force=false){
  if(!c.facilities.length)return{status:'unknown'};
  if(!force&&fresh(c)&&days[c.date])return{status:days[c.date]};
  const endpoint=window.SHARED_RESERVATIONS_CONFIG?.availabilityEndpoint;
  if(!endpoint)return{status:'unknown'};
  const url=new URL(endpoint,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))throw Error('Unsupported availability source.');
  url.searchParams.set('from',key(view));url.searchParams.set('to',key(new Date(view.getFullYear(),view.getMonth()+2,0)));url.searchParams.set('date',c.date);url.searchParams.set('slotId',c.slotId);url.searchParams.set('facilities',c.facilities.join(','));
  const {user}=await window.SharedReservations.identity();const token=await user.getIdToken();
  const response=await fetch(url,{method:'GET',cache:'no-store',headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(8000)});if(!response.ok)throw Error('Availability lookup failed.');
  const result=await response.json(),age=Date.now()-result.verifiedAt;
  if(!Number.isSafeInteger(result.verifiedAt)||age<0||age>60000||result.slotId!==c.slotId||JSON.stringify(result.facilities)!==JSON.stringify(c.facilities)||typeof result.source!=='string'||!result.source.trim()||result.source.length>100||!result.days||Object.entries(result.days).some(([day,value])=>!/^\d{4}-\d{2}-\d{2}$/.test(day)||!['available','unavailable'].includes(value))||!['available','unavailable'].includes(result.days[c.date]))throw Error('Availability could not be verified.');
  return{status:result.days[c.date],snapshot:result};
 }
 async function refresh(force=false){
  const current=++generation,c=context();days={};expires=0;render();
  if(c.facilities.length)status.textContent='Checking availability for your selected facilities and stay slot…';
  try{const result=await lookup(c,force);if(current!==generation)return;
   if(result.snapshot){days=result.snapshot.days;expires=result.snapshot.verifiedAt+60000;verifiedKey=contextKey(c);source=result.snapshot.source;}
   message(c,result);render();
  }catch{if(current===generation){days={};expires=0;message(c,{status:'unknown'});render();}}
 }
 function changed(){if(date.value){const selected=parse(date.value);if(!Number.isNaN(selected.getTime()))view=new Date(selected.getFullYear(),selected.getMonth(),1);}refresh();}
 date.addEventListener('input',changed);slot.addEventListener('change',()=>refresh(true));
 document.querySelectorAll('input[name="facility"]').forEach(n=>n.addEventListener('change',()=>queueMicrotask(()=>refresh(true))));
 document.getElementById('calendarPrevious').addEventListener('click',()=>{view=new Date(view.getFullYear(),view.getMonth()-1,1);refresh();});
 document.getElementById('calendarNext').addEventListener('click',()=>{view=new Date(view.getFullYear(),view.getMonth()+1,1);refresh();});
 try{const preference=sessionStorage.getItem('reservationGuestRangePreference');if(preference&&/^\d+\s*[–-]\s*\d+\s+Guests$|^\d+\+\s+Guests$/i.test(preference)){const note=document.getElementById('guestRangePreference');note.hidden=false;note.textContent='Homepage guest preference: '+preference+'. Confirm the exact adults, children and seniors below.';}}catch{}
 window.ReservationCalendar={refresh,async verifyBeforeSubmit(record){const c=context(record);if(c.date<date.min)throw Error('Choose a valid check-in date.');let result;try{result=await lookup(c,true);}catch{result={status:'unknown'}}message(c,result);return result;}};
 const timer=setInterval(()=>{if(expires&&Date.now()>=expires){days={};expires=0;message(context(),{status:'unknown'});render();}},1000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});refresh();
})();
