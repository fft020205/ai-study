import {afterEach,describe,it,expect,vi} from 'vitest';
import {EventDecoder,readTurnStream} from './turnStream';
import type {LearningSession} from './types';
const session={id:'s1',version:0,messages:[]} as unknown as LearningSession;
const frame=(event:string,data:object)=>`event: ${event}\r\ndata: ${JSON.stringify({request_id:'request-1',...data})}\r\n\r\n`;
afterEach(()=>vi.unstubAllGlobals());
describe('stream transport',()=>{
 it('keeps split CRLF frames and ignores keep-alive comments',()=>{
  const decoder=new EventDecoder();expect(decoder.feed(': keep-alive\n\n'+frame('delta',{text:'你好'}).slice(0,-1))).toEqual([]);
  expect(decoder.feed('\n')).toEqual([{event:'delta',data:JSON.stringify({request_id:'request-1',text:'你好'})}]);
 });
 it('handles split UTF8 and forwards deltas before completion',async()=>{
  const wire=frame('accepted',{session})+frame('delta',{text:'你好😀'})+frame('complete',{session});
  const bytes=new TextEncoder().encode(wire);const observed:string[]=[];
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(new ReadableStream({start(controller){for(const byte of bytes)controller.enqueue(new Uint8Array([byte]));controller.close();}}),{headers:{'content-type':'text/event-stream'}})));
  await readTurnStream(session,'你好','message','request-1',new AbortController().signal,value=>{observed.push(value.event+(value.data.text||''));});
  expect(observed).toEqual(['accepted','delta你好😀','complete']);
 });
 it('rejects a truncated response instead of reporting success',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(frame('delta',{text:'未完成'}),{headers:{'content-type':'text/event-stream'}})));
  await expect(readTurnStream(session,'你好','message','request-1',new AbortController().signal,()=>{})).rejects.toThrow('回复连接中断');
 });
 it('rejects a response for another session or request',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(frame('complete',{session:{...session,id:'other'}}),{headers:{'content-type':'text/event-stream'}})));
  await expect(readTurnStream(session,'你好','message','request-1',new AbortController().signal,()=>{})).rejects.toThrow('回复标识不一致');
 });
});
