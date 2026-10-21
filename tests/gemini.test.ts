import test from 'node:test';
import assert from 'node:assert/strict';
import {runAgent,transcribeImage} from '../lib/server/gemini.ts';
import {chunkDocuments} from '../lib/retrieval.ts';
import {sampleDocuments} from '../lib/samples.ts';
const chunks=chunkDocuments(sampleDocuments);
test('Gemini contract: real tool dispatch, citation mapping and thought signatures (mock HTTP)',async()=>{
  const original=globalThis.fetch;const bodies:Record<string,any>[]=[];let turn=0;
  globalThis.fetch=async(_url,init)=>{
    bodies.push(JSON.parse(String(init?.body)));
    turn++;
    return Response.json({candidates:[{content:turn===1?{role:'model',parts:[{thoughtSignature:'preserved-signature',functionCall:{name:'search_materials',args:{query:'React 状态快照'}}}]}:{role:'model',parts:[{text:'状态是渲染时的快照。[1]'}]}}]});
  };
  try{
    const events:Record<string,unknown>[]=[];
    const answer=await runAgent('React 状态快照',chunks,{key:'test-placeholder',model:'test-model'},e=>events.push(e));
    assert.equal(answer.evidence[0].section,'状态快照');assert.ok(answer.text.includes('[1]'));assert.equal(answer.trace[0].tool,'search_materials');
    assert.equal(bodies[1].contents[1].parts[0].thoughtSignature,'preserved-signature');
    assert.equal(bodies[1].contents[2].parts[0].functionResponse.response.result[0].citation,1);
    assert.ok(events.some(e=>e.type==='trace'));
  }finally{globalThis.fetch=original;}
});
test('Gemini rate limits surface as explicit failures, not successful answers (mock HTTP)',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:429});
  try{await assert.rejects(()=>runAgent('问题',chunks,{key:'test-placeholder',model:'test-model'},()=>{}),/MODEL_RATE_LIMIT/);}finally{globalThis.fetch=original;}
});
test('Gemini tool allowlist blocks arbitrary tool names (mock HTTP)',async()=>{
  const original=globalThis.fetch;let turn=0;let error;
  globalThis.fetch=async(_url,init)=>{
    turn++;const body=JSON.parse(String(init?.body));
    if(turn===2)error=body.contents[2].parts[0].functionResponse.response.result.error;
    return Response.json({candidates:[{content:{role:'model',parts:turn===1?[{functionCall:{name:'execute_shell',args:{}}}]:[{text:'资料不足'}]}}]});
  };
  try{await runAgent('问题',chunks,{key:'test-placeholder',model:'test-model'},()=>{});assert.equal(error,'工具不在允许列表中');}finally{globalThis.fetch=original;}
});
