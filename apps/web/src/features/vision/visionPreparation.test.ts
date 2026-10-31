import {describe,it,expect} from 'vitest';
import {initialPreparation,preparationTransition as transition,preparationSeconds,isPreparing} from './visionPreparation';

describe('vision preparation follows real worker evidence',()=>{
  it('waits for runtime, model and a valid frame before reporting readiness',()=>{
    let s=transition(initialPreparation,{type:'start',at:1000});
    expect(s.stage).toBe('loading_runtime');
    s=transition(s,{type:'runtime_loaded'});expect(s.stage).toBe('loading_model');
    s=transition(s,{type:'model_ready'});expect(s.stage).toBe('checking_frame');
    for(const quality of ['no_face','multiple_faces','low_light','out_of_frame','stale'] as const){
      s=transition(s,{type:'quality',quality});expect(s.stage).toBe('checking_frame');
    }
    s=transition(s,{type:'quality',quality:'valid'});expect(s.stage).toBe('ready');expect(isPreparing(s)).toBe(false);
  });
  it('does not report success merely because one minute elapsed',()=>{
    const s=transition(initialPreparation,{type:'start',at:1000});
    expect(preparationSeconds(s,61000)).toBe(60);expect(isPreparing(s)).toBe(true);
    expect(preparationSeconds(s,100)).toBe(0);expect(s.stage).toBe('loading_runtime');
  });
  it('ignores early frames and out-of-order stage messages',()=>{
    let s=transition(initialPreparation,{type:'start',at:1000});
    expect(transition(s,{type:'quality',quality:'valid'}).stage).toBe('loading_runtime');
    s=transition(s,{type:'model_ready'});
    expect(transition(s,{type:'runtime_loaded'}).stage).toBe('checking_frame');
  });
  it('keeps errors explicit until a deliberate retry',()=>{
    let s=transition(initialPreparation,{type:'start',at:1000});s=transition(s,{type:'error'});
    expect(s.stage).toBe('error');expect(isPreparing(s)).toBe(false);
    expect(transition(s,{type:'model_ready'}).stage).toBe('error');
    expect(transition(s,{type:'quality',quality:'valid'}).stage).toBe('error');
    s=transition(s,{type:'start',at:10000});expect(s.stage).toBe('loading_runtime');expect(s.startedAt).toBe(10000);
  });
  it('closing clears elapsed time and discards late messages',()=>{
    const s=transition(transition(initialPreparation,{type:'start',at:1000}),{type:'stop'});
    expect(s).toEqual(initialPreparation);expect(preparationSeconds(s,999999)).toBe(0);
    expect(transition(s,{type:'model_ready'})).toEqual(initialPreparation);
    expect(transition(s,{type:'error'})).toEqual(initialPreparation);
  });
  it('a later poor frame does not restart the completed initial preparation',()=>{
    let s=transition(initialPreparation,{type:'start',at:1000});s=transition(s,{type:'model_ready'});s=transition(s,{type:'quality',quality:'valid'});
    expect(transition(s,{type:'quality',quality:'no_face'}).stage).toBe('ready');
    expect(transition(s,{type:'error'}).stage).toBe('error');
  });
});
