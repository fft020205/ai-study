import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {CameraPreview} from './CameraPreview';

const {send}=vi.hoisted(()=>({send:vi.fn()}));
vi.mock('./useVisualAnalysis',()=>({useVisualAnalysis:()=>({connection:'off',observation:null,send})}));
vi.mock('./cameraDeviceKey',()=>({cameraDeviceKey:async()=> 'a'.repeat(64)}));

describe('camera visibility recovery',()=>{
  let hidden=false;
  beforeEach(()=>{
    hidden=false;
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
