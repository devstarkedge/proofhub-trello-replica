// Actual dialog, work selection cache and HTTP client, controlled HTTP replies.
import { createServer, transformWithEsbuild } from '../../../frontend/node_modules/vite/dist/node/index.js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const { chromium } = await import(pathToFileURL(process.env.FLOWTASK_PLAYWRIGHT_MODULE).href);
const root = path.resolve(import.meta.dirname, '../../..'), tree = process.env.FLOWTASK_RENDERER || 'frontend';
const workspaceId = 'a'.repeat(24), userId = 'b'.repeat(24), projectId = 'c'.repeat(24), otherProjectId = 'd'.repeat(24), listId = 'e'.repeat(24), taskId = 'f'.repeat(24);
const fixture = `import React from'react';import{createRoot}from'react-dom/client';import Dialog from'/src/components/Tracking/WorkSelectionDialog.jsx';
localStorage.setItem('workspaceId','${workspaceId}');localStorage.setItem('token','fixture-token');window.confirmed=[];
function Fixture(){const[open,setOpen]=React.useState(true);return open?<Dialog checkingIn onConfirm={async selection=>{window.confirmed.push(selection);return true;}} onClose={()=>setOpen(false)}/>:<p>Dialog closed</p>;}
createRoot(document.getElementById('root')).render(<Fixture/>);`;
const server = await createServer({ root: path.join(root, tree), configFile: false, logLevel: 'error', optimizeDeps: { entries: [] }, esbuild: { jsx: 'automatic' }, define: { 'import.meta.env.VITE_BACKEND_URL': JSON.stringify('http://fixture.local') }, server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } }, plugins: [{
  name: 'create-task-fixture', enforce: 'pre',
  resolveId(id) { if (/useSessionSynchronization(?:\.js)?$/.test(id)) return '\0sync'; if (id === 'virtual:create-task') return '\0fixture'; },
  async load(id) { if (id === '\0sync') return `export default function(){return {scope:'${workspaceId}:${userId}'};}`; if (id === '\0fixture') return (await transformWithEsbuild(fixture, 'fixture.jsx', { jsx: 'automatic' })).code; },
  configureServer(s) { s.middlewares.use('/__create-task', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<div id="root"></div><script type="module" src="/@id/virtual:create-task"></script>'); }); }
}] });
await server.listen(); const browser = await chromium.launch({ channel: 'msedge', headless: true }), results = [];
try {
  for (const scenario of ['delayed-create', 'retry-create', 'cancel']) {
    const page = await browser.newPage({ viewport: { width: scenario === 'retry-create' ? 480 : 1280, height: 900 } });
    page.setDefaultTimeout(60000);
    const errors = [], calls = [], creations = [], traffic = [], failed = [];
    let failCreate = scenario === 'retry-create', releaseCreate;
    const gate = new Promise(resolve => { releaseCreate = resolve; });
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/')) traffic.push(request.url()); });
    page.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure() }));
    if (scenario === 'retry-create') await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.documentElement.classList.add('dark')));
    await page.route('http://fixture.local/api/tracking/**', async route => {
      const url = new URL(route.request().url()); let data;
      if (url.pathname.endsWith('/options')) {
        calls.push(Object.fromEntries(url.searchParams));
        if (url.searchParams.get('mode') === 'CREATE') {
          if (scenario === 'delayed-create') await gate;
          if (failCreate) { await route.fulfill({ status: 503, json: { message: 'Options temporarily unavailable' } }); return; }
        }
        const selected = url.searchParams.get('projectId') || projectId;
        const projects = [{ _id: projectId, name: 'Assigned project', hasAssignedTasks: true, canCreate: true }, ...(url.searchParams.get('mode') === 'CREATE' ? [{ _id: otherProjectId, name: 'Other accessible project', canCreate: true, hasAssignedTasks: false }] : [])];
        data = { workspaceId, userId, canTrack: true, canCreateTasks: true, projectId: selected, projects, tasks: [{ _id: taskId, title: 'Assigned task', assigned: true }], lists: [{ _id: listId, title: 'To Do' }] };
      } else if (url.pathname.endsWith('/agendas')) data = [{ _id: 'agenda', title: 'Learning' }];
      else if (url.pathname.endsWith('/tasks')) { creations.push(route.request().postDataJSON()); data = { _id: taskId }; }
      else throw new Error(`Unexpected request ${url.pathname}`);
      await route.fulfill({ json: { success: true, data } });
    });
    try {
      await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__create-task`, { waitUntil: 'commit' });
      const create = page.getByRole('button', { name: 'Create Task', exact: true }); await create.waitFor();
      const requested = page.waitForRequest(request => new URL(request.url()).searchParams.get('mode') === 'CREATE');
      await create.click(); await requested;
      assert.equal(await create.isVisible(), true, 'Create Task must stay visible during its options read');
      if (scenario === 'delayed-create') { assert.equal(await page.getByRole('button', { name: 'Check In and Start Tracking', exact: true }).isDisabled(), true); releaseCreate(); }
      if (scenario === 'retry-create') {
        await page.getByText('Options temporarily unavailable', { exact: false }).waitFor();
        assert.equal(await create.isVisible(), true);
        failCreate = false; await page.getByRole('button', { name: 'Retry selections', exact: true }).click();
      }
      await page.getByRole('option', { name: 'Other accessible project', exact: true }).waitFor({ state: 'attached' });
      await page.getByRole('combobox', { name: 'Project', exact: true }).selectOption(otherProjectId);
      await page.getByPlaceholder('e.g. Implement user authentication').fill('Manager created task');
      const submit = page.getByRole('button', { name: 'Check In and Start Tracking', exact: true });
      await page.waitForFunction(() => ![...document.querySelectorAll('button')].find(button => button.textContent.includes('Check In and Start Tracking'))?.disabled);
      if (scenario === 'cancel') await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      else await submit.evaluate(button => { button.click(); button.click(); });
      await page.getByText('Dialog closed', { exact: true }).waitFor();
      const confirmed = await page.evaluate(() => window.confirmed);
      if (scenario === 'cancel') { assert.equal(creations.length, 0); assert.deepEqual(confirmed, []); }
      else { assert.equal(creations.length, 1); assert.equal(creations[0].projectId, otherProjectId); assert.equal(creations[0].listId, listId); assert.equal(confirmed.length, 1); assert.equal(confirmed[0].taskId, taskId); }
      assert.equal(calls.every(call => !call.projectId || /^[a-f0-9]{24}$/.test(call.projectId)), true);
      assert.deepEqual(errors, []);
      results.push({ scenario, creations: creations.length, confirmed: confirmed.length, createTabStable: true, pageErrors: errors });
    } catch (error) { console.error(JSON.stringify({ scenario, errors, calls, traffic, failed, body: await page.locator('body').innerText() }, null, 2)); throw error; }
    finally { releaseCreate(); await page.close(); }
  }
  if (process.env.FLOWTASK_DASHBOARD_EVIDENCE) { await fs.mkdir(process.env.FLOWTASK_DASHBOARD_EVIDENCE, { recursive: true }); await fs.writeFile(path.join(process.env.FLOWTASK_DASHBOARD_EVIDENCE, `create-task-${tree}.json`), JSON.stringify(results, null, 2)); }
  console.log(JSON.stringify({ tree, results }, null, 2));
} finally { await browser.close(); await server.close(); }
