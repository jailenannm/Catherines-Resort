"use strict";

// Loopback port 5000 (and other ports) keeps the demo emulators.
// Port 5001 explicitly opts into the reservations-only local cloud test server.
const reservationsLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
const reservationsCloudTest = reservationsLoopback && window.location.port === "5001";
window.SHARED_RESERVATIONS_CONFIG = {
    cloudTest: reservationsCloudTest,
    mode: reservationsLoopback && !reservationsCloudTest ? "emulator" : "production",
    emulatorProjectId: "demo-catherines-reservations",
    authEmulatorUrl: "http://127.0.0.1:9099",
    databaseEmulatorUrl: "http://127.0.0.1:9000",
    firebaseConfig: {
        apiKey: "AIzaSyC_nunjKa20tju_W2zNPQrRj4IeTNNLmnU",
        authDomain: "atherines-resort-reservations.firebaseapp.com",
        databaseURL: "https://atherines-resort-reservations-default-rtdb.asia-southeast1.firebasedatabase.app",
        projectId: "atherines-resort-reservations",
        storageBucket: "atherines-resort-reservations.firebasestorage.app",
        messagingSenderId: "441873595429",
        appId: "1:441873595429:web:99ed58e04d0214a15313cc"
    },
    confirmationEmailEnabled: false
};
