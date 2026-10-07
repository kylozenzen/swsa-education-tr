import test from "node:test";
import assert from "node:assert/strict";
import { DayEditor } from "../assets/day-editor.mjs";
const day=(date="2026-10-07")=>({date,narrative:{},slots:{},submissions:[],version:null});
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const change=(editor,key,text)=>{editor.state.narrative[key]=text;editor.changed();};

test("failed save retains edits and blocks date changes until retry succeeds",async()=>{
  let fail=true;const dates=[];const notices=[];
  const editor=new DayEditor({read:async date=>{dates.push(date);return day(date);},write:async input=>{if(fail)throw Error("offline");return {...input,version:"v1"};},notify:s=>notices.push(s)});
  await editor.open("2026-10-07");change(editor,"0","Keep this");
  assert.equal(await editor.open("2026-10-08"),false);assert.equal(editor.state.date,"2026-10-07");assert.equal(editor.state.narrative[0],"Keep this");assert.equal(editor.dirty,true);
  assert.deepEqual(dates,["2026-10-07"]);fail=false;assert.equal(await editor.flush(),true);assert.equal(editor.dirty,false);assert.equal(notices.at(-1),"Saved");
});
test("poll arriving during an edit updates submissions without replacing narrative or version",async()=>{
  const wait=deferred();let reads=0;
  const editor=new DayEditor({read:async()=>++reads===1?day():wait.promise,write:async()=>{}});
  await editor.open("2026-10-07");const poll=editor.refresh();change(editor,"0","Local");
  wait.resolve({...day(),narrative:{0:"Remote"},version:"v2",submissions:[{id:"report"}]});
  assert.equal(await poll,false);assert.equal(editor.state.narrative[0],"Local");assert.equal(editor.state.version,null);assert.equal(editor.state.submissions.length,1);
});
test("edits made during a save are flushed in a second serialized request",async()=>{
  const wait=deferred();const writes=[];
  const editor=new DayEditor({read:async()=>day(),write:async input=>{writes.push(structuredClone(input));if(writes.length===1)await wait.promise;return {...input,version:`v${writes.length}`};}});
  await editor.open("2026-10-07");change(editor,"0","First");const saving=editor.flush();change(editor,"0","Second");wait.resolve();
  assert.equal(await saving,true);assert.equal(writes.length,2);assert.equal(writes[0].narrative[0],"First");assert.equal(writes[1].narrative[0],"Second");assert.equal(writes[1].version,"v1");assert.equal(editor.dirty,false);
});
test("parallel Save now calls serialize without duplicate writes",async()=>{
  const wait=deferred();let writes=0;
  const editor=new DayEditor({read:async()=>day(),write:async input=>{writes++;await wait.promise;return {...input,version:"v1"};}});
  await editor.open("2026-10-07");change(editor,"0","text");const calls=[editor.flush(),editor.flush(),editor.flush()];wait.resolve();await Promise.all(calls);assert.equal(writes,1);
});
test("disjoint supervisor edits merge without overwriting either field",async()=>{
  let reads=0;const writes=[];
  const editor=new DayEditor({read:async()=>++reads===1?day():{...day(),narrative:{1:"Remote"},version:"v2"},write:async input=>{writes.push(input);if(writes.length===1)throw Object.assign(Error(),{status:409});return {...input,version:"v3"};}});
  await editor.open("2026-10-07");change(editor,"0","Local");assert.equal(await editor.flush(),true);assert.deepEqual(writes[1].narrative,{0:"Local",1:"Remote"});assert.equal(writes[1].version,"v2");
});
for (const useMine of [true,false]) test(`overlapping edits stop until choosing ${useMine?"local":"saved"} values`,async()=>{
  let reads=0,writes=0;
  const editor=new DayEditor({read:async()=>++reads===1?day():{...day(),narrative:{0:"Remote",2:"Remote independent"},version:"v2"},write:async input=>{if(++writes===1)throw Object.assign(Error(),{status:409});return {...input,version:"v3"};}});
  await editor.open("2026-10-07");change(editor,"0","Local");change(editor,"1","Local independent");assert.equal(await editor.flush(),false);assert.equal(writes,1);assert.equal(editor.state.narrative[0],"Local");assert.ok(editor.conflict);
  assert.equal(await editor.flush(),false);editor.resolve(useMine);assert.equal(await editor.flush(),true);
  assert.deepEqual(editor.state.narrative,{0:useMine?"Local":"Remote",1:"Local independent",2:"Remote independent"});
});
test("switching date waits for in-flight saves and binds writes to the original day",async()=>{
  const wait=deferred(),written=[];
  const editor=new DayEditor({read:async date=>day(date),write:async input=>{written.push(input);await wait.promise;return {...input,version:"v1"};}});
  await editor.open("2026-10-07");change(editor,"0","Yesterday");const save=editor.flush();const switching=editor.open("2026-10-08");assert.equal(editor.state.date,"2026-10-07");wait.resolve();await save;assert.equal(await switching,true);assert.equal(written[0].date,"2026-10-07");assert.equal(editor.state.date,"2026-10-08");
});
