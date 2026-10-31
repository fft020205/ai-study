import {describe,it,expect} from 'vitest';
import {clampCameraPosition} from './cameraPosition';

describe('floating camera stays reachable',()=>{
  const desktop={x:0,y:0,width:1176,height:827};
  it('allows any position inside the viewport, including over the conversation',()=>{
    expect(clampCameraPosition({x:410,y:300},{width:192,height:192},desktop)).toEqual({x:410,y:300});
  });
  it('keeps all edges inside the page when dragged beyond it',()=>{
    expect(clampCameraPosition({x:-100,y:900},{width:192,height:192},desktop)).toEqual({x:8,y:627});
    expect(clampCameraPosition({x:9000,y:-100},{width:192,height:192},desktop)).toEqual({x:976,y:8});
  });
  it('preserves the closed-card position and adjusts only if expansion needs space',()=>{
    const position={x:950,y:750};
    expect(clampCameraPosition(position,{width:192,height:44},desktop)).toEqual(position);
    expect(clampCameraPosition(position,{width:192,height:192},desktop)).toEqual({x:950,y:627});
  });
  it('adapts to a small screen and the visible viewport above a keyboard',()=>{
    expect(clampCameraPosition({x:900,y:700},{width:128,height:44},{x:0,y:120,width:360,height:320})).toEqual({x:224,y:388});
    expect(clampCameraPosition({x:900,y:700},{width:224,height:220},{x:0,y:0,width:360,height:800})).toEqual({x:128,y:572});
  });
  it('keeps the top drag handle reachable even in a viewport shorter than the preview',()=>{
    expect(clampCameraPosition({x:30,y:100},{width:128,height:180},{x:0,y:0,width:160,height:100})).toEqual({x:24,y:8});
  });
});
