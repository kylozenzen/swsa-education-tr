import test from "node:test";
import assert from "node:assert/strict";
import { createDayHandler } from "../netlify/functions/day.mjs";
import { getDay, saveDay, validDate } from "../netlify/functions/_store.mjs";

function memoryStore() {
  const data = new Map(); let serial = 0;
  return {
    data,
    async getWithMetadata(key) { return structuredClone(data.get(key) || null); },
    async get(key) { return structuredClone(data.get(key)?.data || null); },
    async list({prefix}) { return {blobs:[...data.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}; },
    async setJSON(key, value, options = {}) {
      const existing = data.get(key);
      if ((options.onlyIfNew && existing) || (options.onlyIfMatch && options.onlyIfMatch !== existing?.etag)) return {modified:false};
      const etag = `"version-${++serial}"`; data.set(key, {data:structuredClone(value),etag}); return {modified:true,etag};
    }
  };
}
function fixture() {
  const db = memoryStore(), submissions = [];
  const handler = createDayHandler({
    adminPasswordConfigured:()=>true, validAdminPassword:v=>v==="test-only-password", chicagoToday:()=>"2026-10-07", validDate,
    getDay:date=>getDay(date, db), saveDay:(date,input)=>saveDay(date,input,db),
    getTourConfig:async()=>({tours:[{id:"tour-1",active:true,reportable:true}]}),
    addSubmission:async input=>{submissions.push(input);return {submission:input};}
  });
  const request = (method, body, password, date = "2026-10-07") => handler(new Request(`https://example.test/api/day?date=${date}`, {
    method, headers:{"content-type":"application/json",...(password?{"x-admin-password":password}:{})},
    ...(body && method !== "GET" ? {body:JSON.stringify(body)} : {})
  }));
  return {db,request,submissions};
}
for (const method of ["GET", "PUT"]) {
  for (const password of [undefined, "incorrect"]) {
    test(`${method} denies ${password ? "incorrect" : "missing"} supervisor credentials`,async()=>{
      const {db,request}=fixture();assert.equal((await request(method,{date:"2026-10-07",version:null},password)).status,401);assert.equal(db.data.size,0);
    });
  }
}
test("missing supervisor configuration fails closed",async()=>{
  const handler=createDayHandler({adminPasswordConfigured:()=>false,validAdminPassword:()=>false});
  assert.equal((await handler(new Request("https://example.test/api/day"))).status,503);
});
test("staff can submit today but cannot backdate or claim supervisor source",async()=>{
  const {request,submissions}=fixture();
  assert.equal((await request("POST",{slotId:"tour-1",status:"APON",source:"shift-manual"})).status,201);
  assert.equal(submissions[0].source,"web");assert.equal(submissions[0].date,"2026-10-07");
  assert.equal((await request("POST",{slotId:"tour-1",status:"APON",date:"2026-10-06"})).status,403);
  assert.equal(submissions.length,1);
});
test("supervisor can backdate a report",async()=>{
  const {request,submissions}=fixture();
  assert.equal((await request("POST",{slotId:"tour-1",status:"NS",date:"2026-10-06"},"test-only-password")).status,201);
  assert.equal(submissions[0].source,"shift-manual");assert.equal(submissions[0].date,"2026-10-06");
});
test("save requires a loaded version and returns an ETag for subsequent saves",async()=>{
  const {request}=fixture();
  assert.equal((await request("PUT",{date:"2026-10-07"},"test-only-password")).status,428);
  const day=await (await request("GET",null,"test-only-password")).json();assert.equal(day.version,null);
  const r=await request("PUT",{date:day.date,version:day.version,narrative:{0:"Guide"}},"test-only-password");
  assert.equal(r.status,200);const saved=(await r.json()).day;assert.ok(saved.version);
  const fresh=await (await request("GET",null,"test-only-password")).json();assert.equal(fresh.narrative[0],"Guide");assert.equal(fresh.version,saved.version);
});
test("simultaneous first saves allow only one write and return a conflict",async()=>{
  const {request}=fixture();
  const responses=await Promise.all(["A","B"].map(value=>request("PUT",{date:"2026-10-07",version:null,narrative:{0:value}},"test-only-password")));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
});
test("stale writes cannot erase saved narratives or correction attribution",async()=>{
  const db=memoryStore();
  const initial=await saveDay("2026-10-07",{version:null,narrative:{0:"initial"},overrides:{tour:{text:"NS"}},who:"Supervisor A"},db);
  const next=await saveDay("2026-10-07",{version:initial.version,narrative:{0:"new"},overrides:initial.overrides,who:"Supervisor B"},db);
  assert.equal(next.overrides.tour.who,"Supervisor A");
  await assert.rejects(saveDay("2026-10-07",{version:initial.version,narrative:{},overrides:{}},db),{code:"DAY_CONFLICT"});
  assert.equal((await getDay("2026-10-07",db)).narrative[0],"new");
});
