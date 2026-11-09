import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,renderHook,waitFor} from '@testing-library/react';
import {request} from '@/lib/api';
import {useVisualAnalysis} from './useVisualAnalysis';

vi.mock('@/lib/api',()=>({request:vi.fn()}));
beforeEach(()=>{
  vi.mocked(request).mockReset();
  vi.mocked(request).mockResolvedValue({run_id:'test-run',ticket:'test-ticket',websocket_path:'/api/sessions/session/vision/ws',calibration_seconds:5});
  vi.stubGlobal('WebSocket',class{onopen=null;onmessage=null;onclose=null;onerror=null;close=vi.fn();send=vi.fn();});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it('requests reuse for ordinary recovery and a reset only for explicit recalibration',async()=>{
  const {rerender}=renderHook(({active,restart,reset})=>useVisualAnalysis('session',active,restart,'a'.repeat(64),reset),{initialProps:{active:true,restart:0,reset:0}});
  await waitFor(()=>expect(request).toHaveBeenCalledTimes(1));
  await waitFor(()=>expect(vi.mocked(request).mock.results[0].type).toBe('return'));
  const body=(index:number)=>JSON.parse(vi.mocked(request).mock.calls[index][1]?.body as string);
  expect(body(0)).toEqual({device_key:'a'.repeat(64),reset:false});
  rerender({active:false,restart:0,reset:0});
  rerender({active:true,restart:1,reset:0});
  await waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
  expect(body(1).reset).toBe(false);
  rerender({active:true,restart:2,reset:1});
  await waitFor(()=>expect(request).toHaveBeenCalledTimes(3));
  expect(body(2).reset).toBe(true);
});
