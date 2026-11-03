export type Quality = 'valid'|'no_face'|'multiple_faces'|'low_light'|'out_of_frame'|'stale';
export function qualityGate(count:number,luminance:number,inFrame:boolean,ageMs:number):Quality{
  if(ageMs>2000)return 'stale';
  if(count===0)return 'no_face';
  if(count>1)return 'multiple_faces';
  if(luminance<35)return 'low_light';
  if(!inFrame)return 'out_of_frame';
  return 'valid';
}
