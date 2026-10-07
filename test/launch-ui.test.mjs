import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { JSDOM } from "jsdom";
import { DayEditor } from "../assets/day-editor.mjs";

test("leadership script parses and the daily workspace is locked initially",async()=>{
  const html=await readFile(new URL("../shift.html",import.meta.url),"utf8");
  const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
  new vm.Script(source.replace(/^import .*;$/m,""));
  assert.match(html,/class="dateCard card private" id="dayControls" hidden/);
  assert.match(html,/class="private" id="dayWorkspace" hidden/);
});

async function page() {
  const html=await readFile(new URL("../shift.html",import.meta.url),"utf8");
  const dom=new JSDOM(html,{url:"https://example.test/shift",runScripts:"outside-only"});
  const context=dom.getInternalVMContext(), requests=[], records=new Map();let version=0,fail=false,prints=0;
  context.DayEditor=DayEditor;context.structuredClone=structuredClone;
  context.setInterval=()=>0;context.print=()=>prints++;
  context.fetch=async(url,options={})=>{
    requests.push({url,...options});
    if(String(url).includes("/tours"))return Response.json({ok:true,tours:[{id:"tour",label:"Penguin 2:45",active:true,reportable:true}]});
    const date=new URL(url,"https://example.test").searchParams.get("date");
    if(options.method==="PUT"){
      if(fail)return Response.json({error:"offline"},{status:500});
      const input=JSON.parse(options.body),record={...input,version:`v${++version}`,slots:input.overrides,submissions:[]};records.set(input.date,record);return Response.json({day:record});
    }
    return Response.json(records.get(date)||{date,narrative:{},slots:{},submissions:[],version:null});
  };
  const source=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/^import .*;$/m,"");
  vm.runInContext(source,context);
  return {dom,document:dom.window.document,requests,records,run:s=>vm.runInContext(s,context),setFail:v=>fail=v,getPrints:()=>prints};
}
test("page makes no daily read until unlock, then sends credentials on saves",async()=>{
  const p=await page();try{
    assert.equal(p.requests.length,0);assert.equal(p.document.querySelector("#dayWorkspace").hidden,true);
    p.document.querySelector("#pw").value="fictional-test-value";await p.run("unlock()");
    assert.equal(p.document.querySelector("#dayWorkspace").hidden,false);
    assert.equal(p.document.querySelectorAll("[data-n]").length,12);
    const field=p.document.querySelector('[data-n="1"]');field.value="End of day summary";field.oninput();await p.run("push()");
    const write=p.requests.find(r=>r.method==="PUT");assert.equal(write.headers["x-admin-password"],"fictional-test-value");assert.equal(JSON.parse(write.body).narrative[1],"End of day summary");
    assert.equal(p.document.querySelector("#saved").textContent,"Saved");
  }finally{p.dom.window.close();}
});
test("PDF export stops on save failure and retries with all saved questions",async()=>{
  const p=await page();try{
    p.document.querySelector("#pw").value="fictional-test-value";await p.run("unlock()");
    const field=p.document.querySelector('[data-n="1"]');field.value="Line one\nLine two";field.oninput();p.setFail(true);
    await p.document.querySelector("#print").onclick();assert.equal(p.getPrints(),0);assert.equal(field.value,"Line one\nLine two");
    assert.match(p.document.querySelector("#saved").textContent,/Not saved/);
    p.setFail(false);await p.document.querySelector("#print").onclick();assert.equal(p.getPrints(),1);
    assert.match(p.document.querySelector("#sheet").textContent,/Line one\nLine two/);assert.match(p.document.querySelector("#sheet").textContent,/Miscellaneous notes/);
  }finally{p.dom.window.close();}
});
test("typed report entries survive refresh and block switching date until applied",async()=>{
  const p=await page();try{
    p.document.querySelector("#pw").value="fictional-test-value";await p.run("unlock()");p.run('reportView="all";renderReports()');
    const input=p.document.querySelector(".dayEdit input");input.value="Follow up needed";input.oninput();await p.run("pull()");
    assert.equal(p.document.querySelector(".dayEdit input").value,"Follow up needed");
    const oldDate=p.document.querySelector("#date").value;p.document.querySelector("#date").value="2026-10-08";await p.document.querySelector("#date").onchange({target:p.document.querySelector("#date")});
    assert.equal(p.document.querySelector("#date").value,oldDate);assert.match(p.document.querySelector("#saved").textContent,/Apply the correction or report entry/);
  }finally{p.dom.window.close();}
});
