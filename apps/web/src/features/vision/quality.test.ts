import {describe,it,expect} from 'vitest';
import {qualityGate} from './quality';
describe('vision quality is never a psychological score',()=>{
  it('invalidates stale, absent, multiple and poor frames',()=>{
    expect(qualityGate(1,90,true,2500)).toBe('stale');
    expect(qualityGate(0,90,true,0)).toBe('no_face');
    expect(qualityGate(2,90,true,0)).toBe('multiple_faces');
    expect(qualityGate(1,20,true,0)).toBe('low_light');
    expect(qualityGate(1,90,false,0)).toBe('out_of_frame');
    expect(qualityGate(1,90,true,0)).toBe('valid');
  });
});
