'use strict';
// Emulator rules are intentionally a separate, reviewable artifact. Never deploy them.
const fs=require('node:fs');
const rules=JSON.parse(fs.readFileSync('shared-reservations.rules.json','utf8'));
const status=rules.rules.sharedReservations.$reference.status;
const checkout="auth != null && auth.token.aud === 'demo-catherines-reservations' && auth.token.firebase.sign_in_provider === 'password' && data.parent().child('ownerUid').val() === auth.uid && data.val() === 'Checked In' && newData.val() === 'Checking Out'";
status['.write']='('+status['.write']+') || ('+checkout+')';
status['.validate']='('+status['.validate']+') || ('+checkout+')';
fs.writeFileSync('shared-reservations.emulator.rules.json',JSON.stringify(rules,null,2)+'\n');
