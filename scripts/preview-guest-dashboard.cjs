'use strict';
const {seedDashboardPreview}=require('./seed-dashboard-preview.cjs');
const {startServer}=require('../tests/serve.cjs');
seedDashboardPreview().then(async()=>{
 await startServer(5000);
 console.log('EMULATOR PREVIEW ONLY: http://127.0.0.1:5000/my-reservation.html?reservation=CBLR-820001');
 console.log('Sign in: guest-a@example.test / TestPass123! Then open http://127.0.0.1:5000/guest-dashboard.html?reservation=CBLR-820001');
 console.log('Event Package: http://127.0.0.1:5000/guest-dashboard.html?reservation=CBLR-820002');
}).catch(error=>{console.error(error.message);process.exitCode=1});
