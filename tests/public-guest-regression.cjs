'use strict';
const {spawnSync}=require('node:child_process');
(async()=>{
 if(process.env.GCLOUD_PROJECT!=='demo-catherines-reservations')throw Error('Demo emulator project required');
 for(const test of (process.argv.length>2?process.argv.slice(2):['phase2a2','phase2b1','phase2b2','phase2c1','phase2c2','event-package','my-reservation-page','booking-navigation','public-navigation','register'])){
  const cleared=await fetch('http://127.0.0.1:9000/.json?ns=demo-catherines-reservations-default-rtdb',{method:'PUT',headers:{Authorization:'Bearer owner','Content-Type':'application/json'},body:'null'});if(!cleared.ok)throw Error('Emulator reset failed');
  console.log('\nChecking '+test);
  const result=spawnSync(process.execPath,['tests/'+test+'.test.cjs'],{stdio:'inherit',env:process.env});
  if(result.status!==0)process.exit(result.status||1);
 }
})().catch(error=>{console.error(error);process.exitCode=1});
