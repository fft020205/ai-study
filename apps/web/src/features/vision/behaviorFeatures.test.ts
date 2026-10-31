import {describe,it,expect} from 'vitest';
import {BehaviorFeatureExtractor,type Landmark} from './behaviorFeatures';
import {visualObservationCurrent,type VisualObservation} from './visualAnalysis';
function points(closed=false):Landmark[]{
  const p=Array.from({length:478},()=>({x:0.5,y:0.5}));
  p[33]={x:.3,y:.4};p[133]={x:.4,y:.4};
  const dy=closed?.002:.02;
  p[160]={x:.325,y:.4-dy};p[158]={x:.375,y:.4-dy};p[153]={x:.375,y:.4+dy};p[144]={x:.325,y:.4+dy};
  for(const i of [468,469,470,471,472])p[i]={x:.355,y:.4};
  return p;
}
describe('upstream-derived visual geometry',()=>{
  it('tracks blink hysteresis, gaze ratio and real head movement',()=>{
    const e=new BehaviorFeatureExtractor();
    const normal=e.extract(points(),0,640,480)!;expect(normal.blink_rate).toBe(0);expect(normal.gaze_deviation).toBeCloseTo(.05);expect(normal.head_jitter).toBe(0);
    expect(e.extract(points(true),100,640,480)!.blink_rate).toBe(1);
    expect(e.extract(points(true),150,640,480)!.blink_rate).toBe(1);
    e.extract(points(),200,640,480);
    expect(e.extract(points(true),300,640,480)!.blink_rate).toBe(2);
    const moved=points();moved[1]={x:.51,y:.5};expect(e.extract(moved,400,640,480)!.head_jitter).toBeCloseTo(.01);
  });
  it('expires old blink events and resets motion after invalid frames',()=>{
    const e=new BehaviorFeatureExtractor();e.extract(points(true),100,640,480);
    e.invalidate();expect(e.extract(points(),61000,640,480)!.blink_rate).toBe(0);
    expect(e.extract([],62000,640,480)).toBeNull();
    const moved=points();moved[1]={x:.9,y:.5};expect(e.extract(moved,63000,640,480)!.head_jitter).toBe(0);
  });
  it('does not use uncalibrated, stale or invalid observations for a warning',()=>{
    const o:VisualObservation={available:true,valid:true,calibrated:true,status:'analyzing',sampled_at:100};
    expect(visualObservationCurrent(o,102)).toBe(true);
    expect(visualObservationCurrent(o,104)).toBe(false);
    expect(visualObservationCurrent({...o,calibrated:false},102)).toBe(false);
    expect(visualObservationCurrent({...o,valid:false},102)).toBe(false);
  });
});
