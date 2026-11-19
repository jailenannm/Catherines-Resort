"use strict";
// Browser-only karaoke. Never loads DioramaLink, writes device state or routes speakers.
(function () {
 if(window.SHARED_RESERVATIONS_CONFIG?.facilitiesV2Enabled)return; // One audio authority in v2; preserve local preview otherwise.
 let current;
 const localMedia = value => {
  if(typeof value!=="string")return null;
  const url=new URL(value,location.href);
  return url.origin===location.origin&&url.pathname.startsWith('/assets/ktv/')&&!url.search&&!url.hash?url.href:null;
 };
 function unmount(){current?.close();current=null;}
 function mount(container){
  const reference=window.GuestAccess.state.reservation?.reference;
  if(current?.reference===reference&&current.root.isConnected)return;
  unmount();
  const root=document.createElement('section');root.className='guest-facility-card karaoke-preview';root.id='karaokePreview';
  root.innerHTML='<span class="guest-preview-label">Local browser preview</span><h2>Lighthouse Karaoke</h2><p>Playback uses this browser only. Diorama speakers, microphone mixing and TFT lyrics are not connected.</p><label>Search songs<input type="search" id="karaokeSearch" placeholder="Title or artist"></label><ul id="karaokeSongs"></ul><p id="karaokeTitle">No song selected</p><p id="karaokeReadiness" role="status">Hall/audio readiness: Unknown</p><p id="karaokeStatus" role="status">Loading approved local catalog…</p><p id="karaokeLyrics" aria-live="polite"></p><div class="karaoke-actions"><button type="button" id="karaokePlay" disabled>Play</button><button type="button" id="karaokePause" disabled>Pause</button><button type="button" id="karaokeStop" disabled>Stop</button></div><audio preload="none"></audio>';
  container.appendChild(root);
  const $=id=>root.querySelector('#'+id),audio=root.querySelector('audio');
  let closed=false,songs=[],selected,cues=[],lease=0,busy=false,version=0,mediaReady=false,checking=false,lastCheck=0,phase='stopped',endpointMissing=false;
  const allowed=()=>!closed&&window.GuestAccess.accessFor('ktv').allowed&&window.GuestAccess.state.reservation?.reference===reference;
  const ready=()=>allowed()&&lease>Date.now()&&lease<=Date.now()+3500;
  const status=message=>{$('karaokeStatus').textContent=message;};
  function buttons(){ $('karaokePlay').disabled=!ready()||!mediaReady||busy; $('karaokePause').disabled=audio.paused; $('karaokeStop').disabled=!selected; }
  function stop(message='Stopped'){++version;phase='stopped';audio.pause();try{audio.currentTime=0;}catch{}$('karaokeLyrics').textContent='';status(message);buttons();}
  function lyrics(){const cue=phase!=='stopped'&&mediaReady&&cues.find(c=>audio.currentTime>=c.start&&audio.currentTime<c.end);$('karaokeLyrics').textContent=cue?.text||'';}
  async function refresh(){
   if(checking||endpointMissing||!allowed())return;
   checking=true;lastCheck=Date.now();const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),2000);
   try{
    const identity=await window.SharedReservations.identity(),token=await identity.user.getIdToken();
    const response=await fetch('/api/ktv-preview-readiness',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({reference}),signal:controller.signal,cache:'no-store'});
    if(response.status===404||response.status===501)endpointMissing=true;
    if(!response.ok)throw Error('Readiness unavailable');const result=await response.json();
    if(!allowed()||result.allowed!==true||result.reference!==reference||result.mode!=='local-preview'||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now()||result.expiresAt>Date.now()+3500)throw Error('Readiness unavailable');
    lease=result.expiresAt;$('karaokeReadiness').textContent='Hall confirmed; KTV preview audio lease ready.';
   }catch{lease=0;$('karaokeReadiness').textContent='Hall/audio readiness: Unknown or unavailable. Trusted server verification is required.';if(!audio.paused)stop('Playback stopped: door/audio readiness unavailable.');}
   finally{clearTimeout(timeout);checking=false;buttons();}
  }
  function list(){
   const query=$('karaokeSearch').value.toLowerCase();$('karaokeSongs').replaceChildren();
   for(const song of songs.filter(s=>(s.title+' '+(s.artist||'')).toLowerCase().includes(query))){const li=document.createElement('li'),button=document.createElement('button');button.type='button';button.textContent=song.title+(song.artist?' — '+song.artist:'');button.addEventListener('click',()=>select(song));li.appendChild(button);$('karaokeSongs').appendChild(li);}
  }
  async function select(song){
   stop();selected=song;mediaReady=false;cues=[];buttons();const generation=version;$('karaokeTitle').textContent=song.title;status('Loading timed lyrics…');
   try{
    const response=await fetch(song.lyrics,{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();
    if(!Array.isArray(data)||!data.length||data.length>10000||data.some((c,i)=>!Number.isFinite(c.start)||!Number.isFinite(c.end)||c.start<0||c.end<=c.start||typeof c.text!=='string'||c.text.length>2000||i>0&&c.start<data[i-1].end))throw Error();
    if(closed||generation!==version)return;cues=data;audio.src=song.audio;mediaReady=true;status('Ready for local preview. Fresh Hall/audio verification is required.');
   }catch{if(!closed&&generation===version)status('Missing or invalid track/timed-lyrics files. Playback unavailable.');}
   buttons();
  }
  $('karaokeSearch').addEventListener('input',list);
  $('karaokePlay').addEventListener('click',async()=>{
   if(busy||!mediaReady||!allowed())return;busy=true;const generation=version;buttons();
   try{await refresh();if(!ready()||generation!==version)throw Error('Playback blocked: fresh Hall/audio readiness required.');phase='playing';await audio.play();if(!ready()||generation!==version){audio.pause();return;}status('Playing — local browser preview');}
   catch(error){if(generation===version)stop(error.name==='NotSupportedError'?'Missing or unsupported audio track.':error.message||'Playback unavailable.');}
   finally{busy=false;buttons();}
  });
  $('karaokePause').addEventListener('click',()=>{++version;phase='paused';audio.pause();status('Paused');buttons();});
  $('karaokeStop').addEventListener('click',()=>stop());
  audio.addEventListener('timeupdate',lyrics);audio.addEventListener('seeked',lyrics);audio.addEventListener('ended',()=>stop());audio.addEventListener('error',()=>{mediaReady=false;stop('Missing or unsupported audio track.');});
  const timer=setInterval(()=>{
   if(!allowed()){lease=0;stop('Playback locked: booking access lost.');return;}
   if(!ready()&&!audio.paused)stop('Playback stopped: Hall/audio verification expired.');
   if(Date.now()-lastCheck>=1000)refresh();buttons();
  },250);
  current={root,reference,close(){closed=true;clearInterval(timer);stop();audio.removeAttribute('src');audio.load();root.remove();}};
  fetch('/assets/ktv/catalog.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(data=>{
   if(closed)return;if(!Array.isArray(data))throw Error();
   songs=data.filter(s=>s&&typeof s.title==='string'&&typeof s.id==='string'&&localMedia(s.audio)&&localMedia(s.lyrics)).map(s=>({...s,audio:localMedia(s.audio),lyrics:localMedia(s.lyrics)}));list();status(songs.length?'Select a song.':'No approved local tracks are installed. Backing audio and timed lyrics are required.');
  }).catch(()=>{if(!closed)status('Song catalog unavailable. Approved local media is required.');});
  refresh();
 }
 window.KtvPreview={mount,unmount};window.addEventListener('pagehide',unmount);
})();
