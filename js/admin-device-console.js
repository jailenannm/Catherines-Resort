"use strict";
(function(window){
 const commands={gateOpen:['gate/target','open','esp1','gate'],gateClose:['gate/target','closed','esp1','gate'],carForward:['car/command','forward','esp1','travel'],carReverse:['car/command','backward','esp1','travel'],carStop:['car/command','stop','esp1','stop'],carSpeed:['car/speed',null,'esp1','speed'],pumpOn:['pool/pump',true,'esp2'],pumpOff:['pool/pump',false,'esp2'],hallOn:['event/hallLight',true,'esp2'],hallOff:['event/hallLight',false,'esp2'],stageOn:['event/stageLight',true,'esp2','stage'],stageOff:['event/stageLight',false,'esp2','stage'],ktvOpen:['ktv/target','open','esp1','door'],ktvClose:['ktv/target','closed','esp1','door'],ktvOff:['ktv/lightMode','off','esp2'],ktvParty:['ktv/lightMode','party','esp2'],ktvStatic:['ktv',null,'esp2']};
 const read=(data,path)=>path.split('/').reduce((value,key)=>value?.[key],data);
 async function start(overrides){
  const $=id=>document.getElementById(id),Shared=window.SharedReservations;
  let uid,authorized=false,service,off=()=>{},generation=0,busy=false,snapshot={mode:'preview',writable:false,connected:false,receivedAt:0,data:{}};
  const pulses={esp1:{value:null,changedAt:0},esp2:{value:null,changedAt:0}};
  function health(board){const pulse=pulses[board];if(!snapshot.connected||snapshot.mode==='preview'||!pulse.changedAt)return 'Unknown';const age=Date.now()-pulse.changedAt;return age<0?'Unknown':age<15000?'Online':'Offline'}
  function fresh(board){return health(board)==='Online'&&Number.isFinite(snapshot.receivedAt)&&Date.now()-snapshot.receivedAt>=0&&Date.now()-snapshot.receivedAt<15000}
  const value=(path,board)=>fresh(board)?read(snapshot.data,path):undefined;
  const text=(id,message)=>{if($(id))$(id).textContent=message};
  const requestLabel=raw=>typeof raw==='boolean'?(raw?'On requested — output Unknown':'Off requested — output Unknown'):'Unknown';
  function render(){
   for(const board of ['esp1','esp2']){const heartbeat=read(snapshot.data,'status/'+board+'/heartbeat');if(Number.isFinite(heartbeat)&&heartbeat!==pulses[board].value){if(pulses[board].value!==null)pulses[board].changedAt=Date.now();pulses[board].value=heartbeat}text(board+'Health',health(board));const rssi=value('status/'+board+'/rssi',board);text(board+'Signal','Signal: '+(Number.isFinite(rssi)&&rssi<0&&rssi>=-127?rssi+' dBm':'Unknown'))}
   text('transportState',snapshot.mode==='preview'?'Preview — read-only; no live device connection.':snapshot.error||('State database: '+(snapshot.connected?'Connected':'Disconnected')+'. Device presence depends on observed heartbeat changes.'));
   if(overrides)text('transportState',(snapshot.mode==='preview'?'Preview — read-only':'Database '+(snapshot.connected?'connected':'disconnected'))+' · '+(authorized?'Administrator verified':'Authorization pending')+' · ESP1: '+health('esp1')+' · ESP2: '+health('esp2')+' · ESP3: Not integrated'+(snapshot.error?' · '+snapshot.error:''));
   const microphone=value('event/soundLevel','esp1');text('soundReport',Number.isFinite(microphone)&&microphone>=0&&microphone<=100?microphone+' / 100 — raw mapped level':'Unknown');
   const gate=value('gate/state','esp1'),car=value('car/state','esp1'),ir=value('gate/irBlocked','esp1'),hall=value('ktv/hallOpen','esp1');
   text('gateReport',['open','closed'].includes(gate)?gate+' — not physical clearance confirmation':'Unknown');text('carReport',['moving forward','moving backward','stopped'].includes(car)?car:'Unknown');text('irReport',typeof ir==='boolean'?(ir?'Blocked (reported)':'Clear (reported)'):'Unknown');text('ktvReady',typeof hall==='boolean'?(hall?'Hall confirmed':'Not Hall-confirmed'):'Unknown');text('pumpRequest',requestLabel(value('pool/pump','esp2')));text('hallRequest',requestLabel(value('event/hallLight','esp2')));text('stageRequest',requestLabel(value('event/stageLight','esp2')));
   if(overrides){$('commandFields').disabled=!authorized||!snapshot.writable||!snapshot.connected||busy;document.querySelectorAll('[data-command]').forEach(button=>{const command=commands[button.dataset.command];button.disabled=!authorized||!snapshot.writable||!snapshot.connected||busy||(command[3]!=='stop'&&!fresh(command[2]));})}
  }
  function clear(){snapshot={mode:'preview',writable:false,connected:false,receivedAt:0,data:{}};for(const board of ['esp1','esp2'])pulses[board]={value:null,changedAt:0};if($('operatorClearance'))$('operatorClearance').checked=false;render()}
  function deny(){$('adminState').hidden=false;authorized=false;off();service?.close();service=null;clear();$('adminContent').hidden=true;$('adminSignIn').hidden=false;text('adminState','Administrator access required. Sign in with a trusted administrator account.');text('commandFeedback','No command requested.')}
  $('logoutButton').addEventListener('click',async()=>{try{await Shared.signOut();location.href='login.html'}catch{text('adminState','Sign-out failed. Please retry.')}});
  async function accountChanged(){const current=++generation;authorized=false;render();try{const identity=await Shared.identity(true);if(current!==generation)return;if(uid&&uid!==identity.user.uid){off();service?.close();service=null;clear()}uid=identity.user.uid;authorized=true;$('adminState').hidden=overrides;$('adminContent').hidden=false;$('adminSignIn').hidden=true;text('adminState','Trusted administrator session verified.');if(!service){const candidate=await window.AdminDeviceTransport.create(uid);if(current!==generation){candidate.close();return}service=candidate;off=service.subscribe(next=>{snapshot=next;render()})}render();window.AdminLayout?.contentReady()}catch{if(current===generation)deny()}}
  async function send(id){if(busy||!commands[id])return;const current=generation,command=commands[id],clearance=$('operatorClearance')?.checked===true;busy=true;text('commandFeedback','Validating command request…');if($('operatorClearance'))$('operatorClearance').checked=false;render();try{
   const identity=await Shared.identity(true);if(!authorized||identity.user.uid!==uid||current!==generation||!service)throw Error('Administrator session could not be verified.');
   snapshot=await service.refresh();render();if(!snapshot.writable||!snapshot.connected)throw Error('Device requests are unavailable.');const [path,defaultValue,board,safety]=command;if(safety!=='stop'&&!fresh(board))throw Error('A fresh device heartbeat is required.');
   const ir=read(snapshot.data,'gate/irBlocked'),gate=read(snapshot.data,'gate/state'),car=read(snapshot.data,'car/state');
   if(['gate','travel','speed','door'].includes(safety)&&!clearance)throw Error('Visually verify clearance for this request first.');
   if(['gate','travel','speed'].includes(safety)&&ir!==false)throw Error('A fresh clear entrance IR report is required.');
   if(safety==='gate'&&car!=='stopped')throw Error('The motor must report stopped before moving the gate.');
   if(safety==='travel'&&gate!=='open')throw Error('An open gate report and visual gate clearance are required for motor travel.');
   if(safety==='travel'&&car!=='stopped')throw Error('Stop the motor before requesting travel or changing direction.');
   if(safety==='speed'&&car!=='stopped')throw Error('Stop the motor before changing PWM.');
   if(safety==='stage'&&!(read(snapshot.data,'event/mode')===false||read(snapshot.data,'event/reactive')===false))throw Error('Manual spotlight control is unavailable while reactive ownership is active or unknown.');
   let payload=id==='carSpeed'?Number($('carSpeed').value):id==='ktvStatic'?{lightMode:'static','light/r':$('ktvR').checked,'light/g':$('ktvG').checked,'light/b':$('ktvB').checked}:defaultValue;
   if(id==='carSpeed'&&(!Number.isInteger(payload)||payload<0||payload>255))throw Error('PWM must be an integer from 0 to 255.');
   const latest=await Shared.identity(true);if(!authorized||latest.user.uid!==uid||current!==generation)throw Error('Administrator session changed.');text('commandFeedback','Saving command request…');const result=await service.send(path,payload);if(!result?.accepted)throw Error('Device command was not acknowledged.');if(current===generation)text('commandFeedback','Command request saved. Physical action is not confirmed by this page.');
  }catch(error){if(current===generation)text('commandFeedback',error.message||'Command failed. No physical success is confirmed.')}finally{busy=false;render()}}
  if(overrides){document.querySelectorAll('[data-command]').forEach(button=>button.addEventListener('click',()=>send(button.dataset.command)));$('carSpeed').addEventListener('input',()=>text('speedDraft',$('carSpeed').value))}
  const stopAuth=Shared.watchIdentity(accountChanged),timer=setInterval(render,1000);render();
  window.addEventListener('pagehide',()=>{++generation;authorized=false;stopAuth();off();service?.close();clearInterval(timer)},{once:true});
 }
 window.AdminDeviceConsole={start};
})(window);
