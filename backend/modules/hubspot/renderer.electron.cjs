const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
app.setPath('userData', path.resolve(__dirname, `../../node_modules/.cache/hubspot-electron-profile-${process.pid}`));
let window;
const errors = [];
const evaluate = code => window.webContents.executeJavaScript(code);
async function until(code, message, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(code).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${message}\n${await evaluate('document.body.innerText.slice(0,2500)')}`);
}
const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === ${JSON.stringify(text)})?.click()`);
const fill = (id, expression) => evaluate(`{ const input = document.getElementById(${JSON.stringify(id)}); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, ${expression}); input.dispatchEvent(new Event('input', {bubbles:true})); }`);
async function verify(button) {
  await click(button);
  await until('document.getElementById("hubspot-password")', 'Password dialog missing');
  await fill('hubspot-password', 'window.hubspotFixture.password');
  await evaluate('document.getElementById("hubspot-password").closest("form").requestSubmit()');
}
async function run() {
  window = new BrowserWindow({ width: 1280, height: 960, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
  window.webContents.on('console-message', event => { if (event.level === 'error' && !event.message.includes('favicon')) errors.push(event.message); });
  await window.loadURL(process.argv[2]);
  await until('document.body.innerText.includes("Configure HubSpot")', 'Configs page did not load');
  if (await evaluate('Array.from(document.querySelectorAll("button")).some(button => /^(Manual Sync|Sync Now|Retry|Force Sync)$/.test(button.textContent.trim()))')) throw new Error('Forbidden manual controls');
  await verify('Configure HubSpot');
  await until('document.getElementById("hubspot-key")', 'Credential editor missing');
  if (!(await evaluate('document.body.innerText.includes("securely encrypted before being stored")'))) throw new Error('Encryption notice missing');
  await fill('hubspot-name', '"Browser test CRM"'); await fill('hubspot-key', 'window.hubspotFixture.key');
  await evaluate('Array.from(document.querySelectorAll("[role=dialog] input[type=checkbox]")).at(-1).click()');
  await click('Validate connection');
  await until('document.body.innerText.includes("Portal 111: Contacts read verified")', 'Connection validation did not complete');
  await click('Validate and save securely');
  await until('document.body.innerText.includes("Configured · Disabled") && !document.querySelector("[role=dialog]")', 'Configuration was not saved');
  if (await evaluate('document.body.innerText.includes(window.hubspotFixture.key)')) throw new Error('Saved key is exposed');
  await verify('Enable automatic sync');
  await until('document.body.innerText.includes("Field Mapping") && !document.querySelector("[role=dialog]")', 'Enabling did not show fixed mappings');
  const source = await evaluate('window.hubspotFixture.source({name:"Browser client", projectType:"Hired Client"})');
  await until('(async()=>{const state=await window.hubspotFixture.state();return state.synced===1 && state.contacts===1 && state.mappingId;})()', 'Automatic contact synchronization failed');
  const original = await evaluate('window.hubspotFixture.state()');
  await evaluate(`window.hubspotFixture.source({id:${JSON.stringify(source.id)}, email:"updated@example.com", clientName:"John Michael Doe"})`);
  await until('(async()=>{const state=await window.hubspotFixture.state();return state.email==="updated@example.com" && state.synced===1;})()', 'Mapped contact update failed');
  const updated = await evaluate('window.hubspotFixture.state()');
  if (updated.contacts !== 1 || updated.mappingId !== original.mappingId) throw new Error('Contact duplication or ID replacement');
  const screenshots = process.env.FLOWTASK_TEST_SCREENSHOT_DIR;
  if (screenshots) await fs.writeFile(path.join(screenshots, 'hubspot-configs-desktop.png'), (await window.webContents.capturePage()).toPNG());
  window.setContentSize(390, 844);
  await until('window.innerWidth===390', 'Mobile viewport did not resize');
  if (await evaluate('document.documentElement.scrollWidth > window.innerWidth + 2')) throw new Error('Configs page overflows the mobile viewport');
  if (screenshots) await fs.writeFile(path.join(screenshots, 'hubspot-configs-mobile.png'), (await window.webContents.capturePage()).toPNG());
  await evaluate('window.hubspotFixture.source({name:"Internal",projectType:"Inhouse"})');
  await verify('Disable automatic sync');
  await until('document.body.innerText.includes("Configured · Disabled") && !document.querySelector("[role=dialog]")', 'Disable failed');
  await verify('Enable automatic sync');
  await until('document.body.innerText.includes("Field Mapping") && !document.querySelector("[role=dialog]")', 'Re-enable failed');
  if ((await evaluate('window.hubspotFixture.state()')).contacts !== 1) throw new Error('Re-enable duplicated contacts');
  await evaluate('window.hubspotFixture.member()');
  await until('document.body.innerText.includes("General workspace settings")', 'Unauthorized Configs route did not redirect');
  if (await evaluate('Array.from(document.querySelectorAll("nav a")).some(node=>node.textContent==="Configs")')) throw new Error('Unauthorized Configs tab visible');
  if (errors.length) throw new Error('Renderer errors: ' + errors.join('; '));
  console.log('FLOWTASK_HUBSPOT_RENDERER_RESULT ' + JSON.stringify({ configuration: true, encryptionNotice: true, passwordVerification: true, validation: true, automaticCreate: true, mappedUpdate: true, duplicatePrevention: true, enableDisable: true, fieldMapping: true, mobileLayout: true, unauthorizedRoute: true, rendererErrors: errors }));
}
app.whenReady().then(run).then(() => app.exit(0)).catch(error => { console.error(error.stack); app.exit(1); });
