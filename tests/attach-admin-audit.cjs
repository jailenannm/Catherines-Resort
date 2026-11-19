'use strict';
// Run existing read-only admin checks against the already-running port 5000.
// Never use public-guest-regression here: that runner deliberately clears RTDB.
const Module=require('node:module'),path=require('node:path');
if(process.env.GCLOUD_PROJECT!=='demo-catherines-reservations'||process.env.FIREBASE_DATABASE_EMULATOR_HOST!=='127.0.0.1:9000')throw Error('Running demo emulator required');
const original=Module._load;
Module._load=function(request,parent,...rest){const value=original.call(this,request,parent,...rest);if(parent&&Module._resolveFilename(request,parent)===path.resolve(__dirname,'serve.cjs'))return{...value,startServer:async(port=5000,...options)=>port===5000?{close(callback){callback();}}:value.startServer(port,...options)};return value;};
