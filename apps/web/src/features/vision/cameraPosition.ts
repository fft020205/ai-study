export type CameraPoint = {x:number;y:number};
export type CameraSize = {width:number;height:number};
export type CameraViewport = CameraSize & CameraPoint;

// Keep the drag handle reachable after resizing, expanding or opening the keyboard.
export function clampCameraPosition(position:CameraPoint,size:CameraSize,viewport:CameraViewport):CameraPoint{
  const margin=8;
  const minX=viewport.x+margin,minY=viewport.y+margin;
  return {
    x:Math.max(minX,Math.min(position.x,Math.max(minX,viewport.x+viewport.width-size.width-margin))),
    y:Math.max(minY,Math.min(position.y,Math.max(minY,viewport.y+viewport.height-size.height-margin)))
  };
}
