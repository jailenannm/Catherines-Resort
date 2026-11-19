"use strict";
// Raw device snapshots only: no DEFAULT_STATE merge, initial seed, local fallback,
// simulated sensor loop, or optimistic writes. Existing device config is reused.
(function(window){
 const allowed={"gate/target":v=>["open","closed"].includes(v),"car/command":v=>["forward","backward","stop"].includes(v),"car/speed":v=>Number.isInteger(v)&&v>=0&&v<=255,"pool/pump":v=>typeof v==="boolean","event/hallLight":v=>typeof v==="boolean","event/stageLight":v=>typeof v==="boolean","ktv/target":v=>["open","closed"].includes(v),"ktv/lightMode":v=>["off","party"].includes(v),"ktv":v=>v&&Object.keys(v).sort().join(',')==='light/b,light/g,light/r,lightMode'&&v.lightMode==='static'&&['light/r','light/g','light/b'].every(k=>typeof v[k]==='boolean')};
 async function create(uid){
  const verify=async()=>{const account=await window.SharedReservations.identity(true);if(account.user.uid!==uid)throw Error('Administrator session changed. Please sign in again.');};
  await verify();
  const preview=window.SHARED_RESERVATIONS_CONFIG?.mode==='emulator';
  let state={mode:preview?'preview':'firebase',writable:!preview,connected:false,receivedAt:0,data:{},error:null},closed=false,ref,connection,dburl;
  const listeners=new Set(),publish=()=>{if(!closed)listeners.forEach(fn=>fn({...state}));};
  if(!preview){
   await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='js/firebase-config.js';script.onload=resolve;script.onerror=()=>reject(Error('Device configuration unavailable.'));document.head.appendChild(script)});
   await verify();
   const options=window.FIREBASE_CONFIG;if(!options?.databaseURL)throw Error('Device database configuration unavailable.');
   const app=window.firebase.apps.find(app=>app.name==='admin-diorama-monitor')||window.firebase.initializeApp(options,'admin-diorama-monitor');
   const root=window.DIORAMA_ROOT||'diorama';dburl=new URL(options.databaseURL);dburl.pathname='/'+root+'.json';
   ref=app.database().ref(root);connection=app.database().ref('.info/connected');
   ref.on('value',snapshot=>{state.data=snapshot.val()||{};state.receivedAt=Date.now();state.error=null;publish()},()=>{state.connected=false;state.receivedAt=0;state.data={};state.error='Device state could not be read.';publish()});
   connection.on('value',snapshot=>{state.connected=snapshot.val()===true;publish()});
  }
  return {
   snapshot:()=>({...state}),subscribe(fn){listeners.add(fn);fn({...state});return()=>listeners.delete(fn)},
   async refresh(){await verify();if(preview)throw Error('Preview is read-only.');const response=await fetch(dburl,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Fresh device state could not be verified.');state.data=await response.json()||{};state.receivedAt=Date.now();publish();return {...state}},
   async send(path,value){await verify();if(preview||closed)throw Error('Preview is read-only.');if(!Object.hasOwn(allowed,path)||!allowed[path](value))throw Error('Unsupported device command.');const url=new URL(dburl);url.pathname=url.pathname.replace(/\.json$/,'/'+path+'.json');const response=await fetch(url,{method:path==='ktv'?'PATCH':'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value),signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Device command was not saved. Please retry.');const saved=await response.json();const matches=path==='ktv'?saved?.lightMode==='static'&&['r','g','b'].every(channel=>(saved['light/'+channel]??saved.light?.[channel])===value['light/'+channel]):saved===value;if(!matches)throw Error('Device command acknowledgement did not match.');return {accepted:true}},
   close(){closed=true;listeners.clear();ref?.off();connection?.off()}
  };
 }
 window.AdminDeviceTransport={create};
})(window);
