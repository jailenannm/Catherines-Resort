// Operator-only tool. Copy outside the checkout before installing firebase-admin.
// No credential, UID or email belongs in this source file.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const TARGET_PROJECT = 'atherines-resort-reservations';
function verifyEnvironment(env) {
    for (const name of ['FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST']) {
        if (env[name]) throw new Error('Refusing emulator environment: ' + name);
    }
    for (const name of ['GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) {
        if (env[name] && env[name] !== TARGET_PROJECT) throw new Error('Conflicting project: ' + name);
    }
}
function checkUser(user, uid, expectedEmail) {
    assert.equal(user.uid, uid, 'Fetched UID must exactly match the intended UID');
    assert.equal((user.email || '').toLowerCase(), expectedEmail.toLowerCase(), 'Admin email must match the Console account');
    assert.equal(user.disabled, false, 'Target user must be enabled');
}
async function prepareAdminClaim({ auth, projectId, uid, expectedEmail, apply = false, confirm, log = console.log }) {
    assert.equal(projectId, TARGET_PROJECT, 'Wrong reservations project');
    assert(typeof uid === 'string' && uid.length > 0 && uid.length <= 128 && !/[\s\[\]<>]/.test(uid), 'Enter the real Console UID, not a placeholder');
    assert(typeof expectedEmail === 'string' && expectedEmail.includes('@'), 'Enter the expected admin email locally');
    const user = await auth.getUser(uid);
    checkUser(user, uid, expectedEmail);
    log(JSON.stringify({ project: projectId, uid: user.uid, email: user.email, existingClaimKeys: Object.keys(user.customClaims || {}), plannedAdmin: true }));
    if (!apply) {
        log('DRY RUN ONLY: no claims changed. Compare project, UID and email with Firebase Console.');
        return { applied: false };
    }
    const required = 'GRANT admin TO ' + uid + ' IN ' + TARGET_PROJECT;
    if (await confirm(required) !== required) throw new Error('Confirmation did not match; no role change');
    // Re-read immediately before the update to preserve the latest existing claims.
    const latest = await auth.getUser(uid);
    checkUser(latest, uid, expectedEmail);
    const previous = latest.customClaims || {};
    const merged = { ...previous, admin: true };
    await auth.setCustomUserClaims(uid, merged);
    const verified = await auth.getUser(uid);
    checkUser(verified, uid, expectedEmail);
    assert.equal(verified.customClaims?.admin, true, 'Admin claim was not verified');
    for (const [key, value] of Object.entries(previous)) {
        if (key !== 'admin') assert(isDeepStrictEqual(verified.customClaims[key], value), 'Existing claim was not preserved: ' + key);
    }
    log('Verified admin:true on the target UID; existing non-admin claims preserved. Sign out and sign in again.');
    return { applied: true };
}
async function main() {
    const env = process.env;
    verifyEnvironment(env);
    assert(process.argv.slice(2).every(arg => arg === '--apply'), 'Only --apply is accepted');
    assert(env.GOOGLE_APPLICATION_CREDENTIALS && env.RESERVATIONS_REPO_ROOT, 'Set the local credential path and checkout root');
    const credentialPath = fs.realpathSync(env.GOOGLE_APPLICATION_CREDENTIALS);
    const checkout = fs.realpathSync(env.RESERVATIONS_REPO_ROOT);
    const relative = path.relative(checkout, credentialPath);
    assert(path.isAbsolute(relative) || relative === '..' || relative.startsWith('..' + path.sep), 'Credentials must be outside the checkout');
    const credential = JSON.parse(fs.readFileSync(credentialPath, 'utf8'));
    assert.equal(credential.type, 'service_account', 'Use a service-account credential');
    assert.equal(credential.project_id, TARGET_PROJECT, 'Credential belongs to the wrong project');
    const { initializeApp, cert, deleteApp } = require('firebase-admin/app');
    const { getAuth } = require('firebase-admin/auth');
    const app = initializeApp({ credential: cert(credential), projectId: TARGET_PROJECT }, 'reservations-role-operator');
    try {
        await prepareAdminClaim({
            auth: getAuth(app), projectId: app.options.projectId,
            uid: env.RESERVATIONS_ADMIN_UID, expectedEmail: env.RESERVATIONS_ADMIN_EMAIL,
            apply: process.argv.includes('--apply'),
            confirm: async required => {
                const readline = require('node:readline/promises').createInterface({ input: process.stdin, output: process.stdout });
                try { return await readline.question('Type exactly to assign the live role:\n' + required + '\n> '); }
                finally { readline.close(); }
            }
        });
    } finally { await deleteApp(app); }
}
module.exports = { TARGET_PROJECT, verifyEnvironment, prepareAdminClaim };
if (require.main === module) main().catch(error => {
    // SDK/JSON error messages can contain credential details: never print them.
    console.error('Stopped:', error.code || 'validation-or-sdk-error', 'Check project, UID/email and the private local credential.');
    if (process.argv.includes('--apply')) console.error('If an update was attempted, inspect claims before retrying.');
    process.exitCode = 1;
});
