import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {CameraPreview} from './CameraPreview';

const {send,analysis}=vi.hoisted(()=>({send:vi.fn(),analysis:vi.fn()}));
vi.mock('./useVisualAnalysis',()=>({useVisualAnalysis:(...args:unknown[])=>{analysis(...args);return {connection:'off',observation:null,send,reconnect:()=>{}};}}));
vi.mock('./cameraDeviceKey',()=>({cameraDeviceKey:async()=> 'a'.repeat(64)}));

describe('camera visibility recovery',()=>{
  let hidden=false;
  beforeEach(()=>{
    hidden=false;analysis.mockClear();
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});
    vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
    vi.stubGlobal('Worker',class{postMessage(){} terminate(){} onmessage=null;onerror=null;});
    vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined);
  });
  afterEach(()=>{cleanup();Reflect.deleteProperty(document,'hidden');vi.unstubAllGlobals();vi.restoreAllMocks();});

  it('stops collection in the background and resumes without submitting new consent',async()=>{
    const stop=vi.fn(),track={stop,onended:null};
    const getUserMedia=vi.fn(async()=>({getTracks:()=>[track]}));
    Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
    const onOpen=vi.fn(),onClose=vi.fn(),onLive=vi.fn();
    render(<CameraPreview allowed sessionId="session" collapseSignal={0} onOpen={onOpen} onClose={onClose} onLive={onLive}/>);
    await waitFor(()=>expect(onLive).toHaveBeenCalledWith(true));
    hidden=true;fireEvent(document,new Event('visibilitychange'));
    await waitFor(()=>expect(stop).toHaveBeenCalled());
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    hidden=false;fireEvent(document,new Event('visibilitychange'));
    await waitFor(()=>expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(onOpen).not.toHaveBeenCalled();expect(onClose).not.toHaveBeenCalled();
  });
});


it('separates reconnect from explicit recalibration signals',async()=>{
 const track={stop:vi.fn(),onended:null};
 Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:vi.fn(async()=>({getTracks:()=>[track]}))}});
 Object.defineProperty(document,'hidden',{configurable:true,value:false});
 vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
 vi.stubGlobal('Worker',class{postMessage(){} terminate(){} onmessage=null;onerror=null;});
 vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined);
 const props={allowed:true,sessionId:'lesson',collapseSignal:0,onOpen:vi.fn(),onClose:vi.fn(),onLive:vi.fn()};
 const {rerender,unmount}=render(<CameraPreview {...props} retrySignal={0} recalibrateSignal={0}/>);
 await waitFor(()=>expect(props.onLive).toHaveBeenCalledWith(true));
 rerender(<CameraPreview {...props} retrySignal={1} recalibrateSignal={0}/>);
 await waitFor(()=>expect(analysis.mock.calls.at(-1)?.[2]).toBe(1));
 expect(analysis.mock.calls.at(-1)?.[4]).toBe(0);
 rerender(<CameraPreview {...props} retrySignal={1} recalibrateSignal={1}/>);
 await waitFor(()=>expect(analysis.mock.calls.at(-1)?.[4]).toBe(1));
 unmount();Reflect.deleteProperty(document,'hidden');vi.unstubAllGlobals();vi.restoreAllMocks();
});
