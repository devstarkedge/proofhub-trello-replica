// Actual Home and Attendance components with controlled HTTP/Socket.IO events.
// Transactional business flow is exercised separately against MongoDB.
import {createServer,transformWithEsbuild} from '../../../frontend/node_modules/vite/dist/node/index.js';
import {pathToFileURL} from 'node:url';
import {writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const {chromium}=await import(pathToFileURL(process.env.FLOWTASK_PLAYWRIGHT_MODULE).href);
const root=path.resolve(import.meta.dirname,'../../..'),tree=process.env.FLOWTASK_RENDERER||'frontend';
const workspaceId='a'.repeat(24),userId='b'.repeat(24);
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';
import Auth from '/src/context/AuthContext.jsx';import Workspace from '/src/context/WorkspaceContext.jsx';
import Home from '/src/components/Attendance/AttendanceQuickControl.jsx';import Attendance from '/src/pages/Attendance/MyAttendancePage.jsx';
localStorage.setItem('token','synthetic-token');localStorage.setItem('workspaceId','${workspaceId}');
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><Auth.Provider value={{token:'synthetic-token',user:{_id:'${userId}',role:'employee'}}}><Workspace.Provider value={{currentWorkspace:{_id:'${workspaceId}'}}}><section aria-label="Home fixture"><Home/></section><section aria-label="Attendance fixture"><Attendance/></section></Workspace.Provider></Auth.Provider></QueryClientProvider>);`;
const server=await createServer({root:path.join(root,tree),configFile:false,logLevel:'error',esbuild:{jsx:'automatic'},define:{'import.meta.env.VITE_BACKEND_URL':JSON.stringify('http://fixture.local')},plugins:[{name:'regularization-fixture',enforce:'pre',resolveId(id){if(id.includes('context/AuthContext'))return '\0auth';if(id.includes('context/WorkspaceContext'))return '\0workspace';if(id==='virtual:regularization')return '\0fixture';},async load(id){if(['\0auth','\0workspace'].includes(id))return "import {createContext} from 'react';export default createContext({});";if(id==='\0fixture')return(await transformWithEsbuild(fixture,'fixture.jsx',{jsx:'automatic'})).code;},configureServer(s){s.middlewares.use('/__regularization',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<div id="root"></div><script type="module" src="/@id/virtual:regularization"></script>');});}}],server:{host:'127.0.0.1',port:0}});
await server.listen();const browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
let approved=false,reads=0;
await page.addInitScript(()=>{window.flowtaskDesktop={isDesktop:true};});
await page.route('http://fixture.local/api/**',async route=>{
 const url=new URL(route.request().url()),accepted=approved;let data=[];
 if(url.pathname.endsWith('/me/today')){reads++;data={workspaceId,userId,attendanceApplicable:true,workDateKey:'2026-10-19',canCheckIn:true,canCheckOut:false,activeSession:null,completed:false,allowedWorkModes:['OFFICE'],defaultWorkMode:'OFFICE',workedMinutes:0,presenceState:'NOT_STARTED',leaveState:'NONE',serverNow:new Date().toISOString(),unresolvedMissedCheckout:accepted?null:{sessionId:'old-session',workDateKey:'2026-10-17'}};await new Promise(r=>setTimeout(r,300));}
 else if(url.pathname.endsWith('/tracking/me'))data={workspaceId,userId,policy:{enabled:false},canTrack:false,session:null,devices:[],serverNow:new Date().toISOString()};
 else if(url.pathname.endsWith('/tracking/reports'))data={sessions:[],nextCursor:null,timezone:'Asia/Kolkata'};
 else if(url.pathname.endsWith('/regularizations/mine'))data=[{_id:'request',workDateKey:'2026-10-17',type:'MISSED_CHECK_OUT',status:accepted?'APPROVED':'PENDING_APPROVAL'}];
 await route.fulfill({json:{success:true,data}}).catch(()=>{});
});
const event=async(type,payload)=>page.evaluate(({type,payload})=>window.dispatchEvent(new CustomEvent('flowtask:realtime',{detail:{type,payload}})),{type,payload});
try{
 await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__regularization`);
 const home=page.getByRole('region',{name:'Home fixture'}),attendance=page.getByRole('region',{name:'Attendance fixture'});
 const homeWarning=home.getByText('Missed checkout on 2026-10-17',{exact:false}),attendanceWarning=attendance.getByText('Missed Check-Out Detected',{exact:true});
 await homeWarning.waitFor();await attendanceWarning.waitFor();assert.equal(reads,1,'both components share one own-status request');
 const before=reads;await event('attendance:updated',{workspaceId:'different',userId});await page.waitForTimeout(250);assert.equal(reads,before);
 await event('attendance:regularization-requested',{workspaceId,userId});await page.waitForFunction(()=>document.body.textContent.includes('Missed Check-Out Detected'));await page.waitForTimeout(180);assert.equal(await homeWarning.isVisible(),true);assert.equal(await attendanceWarning.isVisible(),true);
 // An old pending response is in flight when final approval arrives. It must
 // not overwrite the following authoritative resolved status.
 approved=true;const start=Date.now();await event('attendance:regularization-decided',{workspaceId,userId,finalOutcome:'APPROVED'});await event('attendance:updated',{workspaceId,userId,workDateKey:'2026-10-17'});
 await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('socket-attendance-regularization-decided'));window.dispatchEvent(new CustomEvent('socket-attendance-updated'));});
 await homeWarning.waitFor({state:'detached'});await attendanceWarning.waitFor({state:'detached'});const resolutionLatencyMs=Date.now()-start;
 await attendance.getByText('Approved',{exact:true}).waitFor();await page.waitForTimeout(350);assert.equal(await homeWarning.count(),0);assert.equal(await attendanceWarning.count(),0);assert.deepEqual(errors,[]);
 const result={tree,sharedInitialReads:before,reads,resolutionLatencyMs,bothWarningsRemoved:true,pendingWarningPreserved:true,otherWorkspaceIgnored:true,staleResponseRejected:true,approvalBadgeUpdated:true,actualReactComponents:true,transport:'controlled HTTP and existing Socket.IO window events'};
 await mkdir(path.join(root,'work/regularization-2026-10-19'),{recursive:true});await writeFile(path.join(root,`work/regularization-2026-10-19/browser-${tree}.json`),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await server.close();}
