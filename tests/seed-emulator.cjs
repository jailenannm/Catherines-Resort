const project = 'demo-catherines-reservations';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
if (!['127.0.0.1:9099', '127.0.0.1:19099', '127.0.0.1:29099'].includes(authHost)) throw Error('Local demo Auth emulator required.');
const authBase = 'http://' + authHost;
const password = 'TestPass123!';
async function authRequest(method, body, admin = false) {
    const response = await fetch(authBase + '/identitytoolkit.googleapis.com/v1/' + method + '?key=demo-reservations-key', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(admin ? { Authorization: 'Bearer owner' } : {}) }, body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data;
}
async function seed() {
    const accounts = {};
    for (const name of ['guest-a', 'guest-b', 'administrator']) {
        const email = name + '@example.test';
        let account;
        try { account = await authRequest('accounts:signUp', { email, password, returnSecureToken: true }); }
        catch (error) {
            if (!error.message.includes('EMAIL_EXISTS')) throw error;
            account = await authRequest('accounts:signInWithPassword', { email, password, returnSecureToken: true });
        }
        if (name === 'administrator') {
            await authRequest('accounts:update', { localId: account.localId, customAttributes: JSON.stringify({ admin: true }) }, true);
            account = await authRequest('accounts:signInWithPassword', { email, password, returnSecureToken: true });
        }
        accounts[name] = { ...account, email, password };
    }
    return accounts;
}
module.exports = { seed, project };
if (require.main === module) seed().then(accounts => {
    console.log('Created emulator-only email/password accounts:');
    for (const account of Object.values(accounts)) console.log(account.email + ' / ' + password);
}).catch(error => { console.error(error); process.exitCode = 1; });
