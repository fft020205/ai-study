export type Quality = 'valid'|'no_face'|'multiple_faces'|'low_light'|'out_of_frame'|'stale';
export function qualityGate(count:number,luminance:number,inFrame:boolean,ageMs:number):Quality{
  if(ageMs>2000)return 'stale';
  if(count===0)return 'no_face';
  if(count>1)return 'multiple_faces';
  if(luminance<35)return 'low_light';
  if(!inFrame)return 'out_of_frame';
  return 'valid';
}
export const qualityLabels:Record<Quality,string>={valid:'检测到 1 张人脸 · 仅本机处理',no_face:'未检测到人脸',multiple_faces:'多人画面 · 不用于判断',low_light:'光线较暗 · 不用于判断',out_of_frame:'面部不完整 · 不用于判断',stale:'画面已过期'};
