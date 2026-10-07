import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("older unreported catalog entries render and export as unknown outcomes",async()=>{
  const html=await readFile(new URL("../archive.html",import.meta.url),"utf8");
  const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const context=vm.createContext({document:{querySelector:()=>({})}});
  // Evaluate actual rendering/export functions, omitting browser startup bindings.
  vm.runInContext(script.slice(0,script.indexOf('$("#unlock").onclick')),context);
  const oldArchive={month:"2026-09",days:{"2026-09-01":{totalReports:1,reports:[{tour:"Penguin",status:"APON"}],unreported:["Shark"],overrides:[]}}};
  context.record=oldArchive;
  const rendered=vm.runInContext('view="all";renderDay("2026-09-01",record.days["2026-09-01"])',context);
  assert.match(rendered,/outcome unknown/);assert.match(rendered,/not reported/);assert.doesNotMatch(rendered,/assumed/);
  const csv=vm.runInContext('toCsv(record)',context);assert.match(csv,/"Shark","NOT REPORTED"/);assert.match(csv,/"Penguin","APON"/);assert.doesNotMatch(csv,/APON \(assumed\)/);
  assert.equal(vm.runInContext('stats(record).reports',context),1);
});
