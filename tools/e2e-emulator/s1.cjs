const L = require('./lib.cjs');
(async () => {
  // clear emulator
  await fetch('http://127.0.0.1:8085/emulator/v1/projects/demo-sokohai/databases/(default)/documents', { method: 'DELETE' });
  await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-sokohai/accounts', { method: 'DELETE' });
  const { b, p, log } = await L.open();
  await L.step('Signup via UI (seller)', async () => {
    await p.evaluate(() => window.openAuthModal());
    await p.evaluate(() => window.toggleAuth('signup'));
    await p.fill('#signupName', 'Juma Muuzaji'); await p.fill('#signupEmail', 'seller@sokohai.test'); await p.fill('#signupPhone', '0712000001'); await p.fill('#signupPass', 'Passw0rd!x');
    await p.evaluate(() => window.doSignup());
    await p.waitForTimeout(3000);
    const u = await L.admin.auth().getUserByEmail('seller@sokohai.test');
    const d = await L.db.doc('users/' + u.uid).get();
    L.assert(d.exists, 'users doc missing; alerts=' + log.alerts.join(' | '));
    return 'uid ' + u.uid.slice(0, 6) + ', users doc saved under rules';
  });
  await p.screenshot({ path: L.SCR + '/e2e/s1-signup.png' });
  console.log('alerts', log.alerts); console.log(L.realErrs(log).slice(0, 15).join('\n')); console.log('blocked hosts', [...log.hosts]);
  await b.close();
})();
