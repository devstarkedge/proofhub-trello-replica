const { app, BrowserWindow, Notification } = require('electron');
const path = require('node:path');
const { installDesktopNotifications } = require('../../desktopApp/electron/notifications.cjs');
app.setPath('userData', path.resolve(__dirname, '../../desktopApp/artifacts/realtime-electron-profile'));
let window;
const native = [], errors = [];
const originalShow = Notification.prototype.show;
Notification.prototype.show = function () { native.push(this); return originalShow.call(this); };
const evaluate = code => window.webContents.executeJavaScript(code);
async function until(code, message, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(code).catch(() => false)) return;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(message + '\n' + JSON.stringify(await evaluate('({state: window.flowtaskTest?.state(), body: document.body.innerText.slice(0, 2000)})')));
}
async function run() {
  const origin = new URL(process.argv[2]).origin;
  installDesktopNotifications(() => window, () => origin);
  window = new BrowserWindow({ width: 1200, height: 800, show: true, webPreferences: {
    preload: path.resolve(__dirname, '../../desktopApp/electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false,
  } });
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  await window.loadURL(process.argv[2]); window.focus();
  await until('window.flowtaskTest?.state().socket === true', 'Renderer/socket did not initialize');
  await until('document.querySelector("button[aria-label=Notifications]")', 'Actual header did not mount');
  const baseline = await evaluate('window.flowtaskTest.state().unread');
  const create = async mode => {
    const response = await fetch(origin + '/test/publish?mode=' + mode, { method: 'POST' });
    if (!response.ok) throw new Error('Fixture publication failed');
    return response.json();
  };
  const assigned = await create('assigned');
  await until(`window.flowtaskTest.state().ids.includes('${assigned._id}') && window.flowtaskTest.state().unread > ${baseline}`, 'Live inbox and badge did not update');
  await evaluate('document.querySelector("button[aria-label=Notifications]").click()');
  await until('document.getElementById("flowtask-notifications")', 'Actual dropdown did not open');
  await evaluate(`Array.from(document.querySelectorAll('#flowtask-notifications [role=button]')).find(node => node.textContent.includes('Homepage Design')).click()`);
  await until(`!window.flowtaskTest.state().open && window.flowtaskTest.state().modal.some(item => item.type === 'task' && item.id === '${assigned.taskId}')`, 'Dropdown did not close or exact task modal did not open');
  await until(`Array.from(document.querySelectorAll('input')).some(input => input.value === 'Homepage Design')`, 'Actual task modal did not render its title');
  await evaluate(`{ const input=Array.from(document.querySelectorAll('input')).find(input=>input.value==='Homepage Design'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(input,'Unsaved local draft'); input.dispatchEvent(new Event('input',{bubbles:true})); }`);
  await create('update');
  await until(`window.flowtaskTest.state().titles.includes('Server title update')`, 'Board did not synchronize automatically');
  await until(`Array.from(document.querySelectorAll('input')).some(input=>input.value==='Unsaved local draft')`, 'Background update overwrote unsaved task input');
  await evaluate('window.flowtaskTest.navigate("/")');
  await until('window.flowtaskTest.state().route === "/" && document.body.innerText.includes("Integration home")', 'Home navigation did not settle');
  await evaluate('document.querySelector("button[aria-label=Notifications]").click()');
  await until('document.getElementById("flowtask-notifications")', 'Dropdown reopen failed');
  const before = await evaluate('getComputedStyle(document.querySelector(".notification-header")).backgroundImage');
  await evaluate('window.flowtaskTest.changeTheme("rgb(0, 128, 0)")');
  const after = await evaluate('getComputedStyle(document.querySelector(".notification-header")).backgroundImage');
  if (before === after || !after.includes('0, 128, 0')) throw new Error('Theme did not update live');
  await evaluate('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');
  await until('!window.flowtaskTest.state().open', 'Escape did not close the dropdown');
  window.minimize();
  const background = await create('assigned');
  await until(`window.flowtaskTest.state().ids.includes('${background._id}')`, 'Minimized renderer missed notification');
  const notification = native.find(item => item.title === background.title);
  if (Notification.isSupported() && !notification) throw new Error('Native notification API was not invoked');
  if (notification) {
    notification.emit('click'); // Exercise real main/preload/navigation handlers; OS mouse click is not automated.
    await until(`window.flowtaskTest.state().route.endsWith('/${background.taskId}') && window.flowtaskTest.state().modal.length === 1 && window.flowtaskTest.state().modal.some(item=>item.id==='${background.taskId}') && !window.flowtaskTest.state().open`, 'Native click handler did not activate exact task');
    if (window.isMinimized()) throw new Error('Native click did not restore window');
  }
  await evaluate('window.flowtaskTest.disconnect()');
  const missed = await create('offline');
  await until(`window.flowtaskTest.state().socket && window.flowtaskTest.state().ids.includes('${missed._id}')`, 'Reconnect did not reconcile missed inbox state');
  const result = { liveInbox: true, badge: true, dropdownClosed: true, exactTaskModal: true, boardUpdated: true, draftPreserved: true, liveTheme: true, escape: true, minimizedDelivery: true, nativeAPIInvocations: native.length, nativeClickHandler: Boolean(notification), reconnectRecovery: true, rendererErrors: errors };
  console.log('FLOWTASK_RENDERER_RESULT ' + JSON.stringify(result));
  if (errors.length) throw new Error('Renderer reported errors: ' + errors.slice(0, 3).join('; '));
}
app.whenReady().then(run).then(() => app.exit(0)).catch(error => { console.error(error.stack); console.error(JSON.stringify(errors)); app.exit(1); });
