'use strict';
// Explicit operator-run SIMULATION. No real sensor evidence is claimed.
const {randomUUID}=require('node:crypto');
const {createEmulatorDepartureVerifier}=require('./emulator-departure-verifier.cjs');
const reference=process.argv[2];
if(!/^CBLR-[0-9]{6}$/.test(reference||''))throw Error('Usage: node scripts/complete-emulator-checkout.cjs CBLR-123456');
const event={eventId:'fixture-departure-cli-'+randomUUID(),reference,receivedAt:Date.now(),trusted:true,exitConfirmed:true,gateClear:true,motorStopped:true,facilitiesReset:true};
createEmulatorDepartureVerifier({fixtures:[event]})(event.eventId).then(result=>console.log(JSON.stringify({...result,evidence:'server-controlled emulator fixture; not physical verification'}))).catch(error=>{console.error(error.message);process.exitCode=1});
