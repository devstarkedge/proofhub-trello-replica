const {test}=require('node:test');
const assert=require('node:assert/strict');
const {CaptureSchedule,INACTIVITY_MS}=require('../capture-schedule.cjs');

test('every capture gets an independent random delay in the workspace ±3 minute range',()=>{
  let now=0,index=0;const fractions=[0,0.5,0.999999];
  const schedule=new CaptureSchedule({now:()=>now,random:(min,max)=>min+Math.floor(fractions[index++%fractions.length]*(max-min))});
  schedule.start(600,'workspace:user:session');assert.equal(schedule.nextAt,420000);
  const activeUntil=target=>{while(now+240000<target){now+=240000;schedule.input();}now=target;schedule.input();};
  activeUntil(420000);assert.equal(schedule.due(),true);schedule.completed();assert.equal(schedule.nextAt-now,600000);
  activeUntil(schedule.nextAt);schedule.completed();assert.equal(schedule.nextAt-now,780000);
  schedule.start(300,'other');assert.equal(schedule.nextAt-now,120000);
});
test('short configurations have a one minute floor and a 60 minute setting still allows 63 minutes',()=>{
  const low=new CaptureSchedule({now:()=>0,random:min=>min});low.start(60,'a');assert.equal(low.nextAt,60000);
  const high=new CaptureSchedule({now:()=>0,random:(_min,max)=>max-1});high.start(3600,'a');assert.equal(high.nextAt,3780000);
});
test('exactly five minutes without clicks suppresses a due capture, then input starts a fresh delay',()=>{
  let now=0;const schedule=new CaptureSchedule({now:()=>now,random:min=>min});schedule.start(300,'a');
  now=INACTIVITY_MS-1;assert.equal(schedule.inactive(),false);
  now++;assert.equal(schedule.due(),false);assert.equal(schedule.updateInactivity(),true);assert.equal(schedule.nextAt,null);
  now=3600000;assert.equal(schedule.input(),true);assert.equal(schedule.nextAt,now+120000);assert.equal(schedule.due(),false);
  now+=60000;assert.equal(schedule.input(),false);assert.equal(schedule.nextAt,3720000,'ordinary input must not continually postpone capture');
});
test('policy/anchor restarts preserve inactivity in the same session, while another identity gets independent state',()=>{
  let now=0;const schedule=new CaptureSchedule({now:()=>now,random:min=>min});schedule.start(600,'a');
  now=INACTIVITY_MS;schedule.updateInactivity();schedule.stop();schedule.start(300,'a');
  assert.equal(schedule.inactive(),true);assert.equal(schedule.nextAt,null);
  schedule.start(300,'b');assert.equal(schedule.inactive(),false);assert.equal(schedule.nextAt,now+120000);
  const other=new CaptureSchedule({now:()=>now,random:min=>min});other.start(300,'c');
  now+=INACTIVITY_MS;schedule.input();assert.equal(schedule.inactive(),false);assert.equal(other.inactive(),true);
});
test('stopping a schedule cancels a due capture and input cannot restart stopped monitoring',()=>{
  let now=0;const schedule=new CaptureSchedule({now:()=>now,random:min=>min});schedule.start(300,'a');schedule.stop();
  now=120000;assert.equal(schedule.input(),false);assert.equal(schedule.due(),false);assert.equal(schedule.nextAt,null);
});
