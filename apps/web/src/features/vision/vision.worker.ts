import {FaceLandmarker,FilesetResolver} from '@mediapipe/tasks-vision';
import {BehaviorFeatureExtractor} from './behaviorFeatures';
import {qualityGate} from './quality';
let model:FaceLandmarker|undefined;
let extractor=new BehaviorFeatureExtractor();
const worker=self as unknown as {onmessage:((e:MessageEvent)=>void)|null;postMessage:(data:unknown)=>void};
worker.onmessage=async(e:MessageEvent)=>{
  try{
    if(e.data.type==='init'){
      extractor=new BehaviorFeatureExtractor();
      const fileset=await FilesetResolver.forVisionTasks(e.data.base+'/vision/wasm');
      worker.postMessage({type:'preparation',stage:'runtime_loaded'});
      model=await FaceLandmarker.createFromOptions(fileset,{baseOptions:{modelAssetPath:e.data.base+'/vision/face_landmarker.task',delegate:'CPU'},runningMode:'VIDEO',numFaces:2,outputFaceBlendshapes:false,outputFacialTransformationMatrixes:false});
      worker.postMessage({type:'ready'});return;
    }
    if(e.data.type==='frame'){
      const bitmap=e.data.bitmap as ImageBitmap;
      try{
        if(!model)throw new Error('not ready');
        const results=model.detectForVideo(bitmap,e.data.timestamp);
        const canvas=new OffscreenCanvas(24,24),ctx=canvas.getContext('2d')!;
        ctx.drawImage(bitmap,0,0,24,24);const px=ctx.getImageData(0,0,24,24).data;let sum=0;
        for(let i=0;i<px.length;i+=4)sum+=(px[i]+px[i+1]+px[i+2])/3;
        const points=results.faceLandmarks[0]||[];
        const inFrame=points.length>0&&points.every(p=>p.x>0.015&&p.x<0.985&&p.y>0.015&&p.y<0.985);
        let quality=qualityGate(results.faceLandmarks.length,sum/(px.length/4),inFrame,Date.now()-e.data.sampledAt);
        let features=quality==='valid'?extractor.extract(points,e.data.timestamp,bitmap.width,bitmap.height):null;
        if(quality==='valid'&&!features)quality='out_of_frame';
        if(quality!=='valid')extractor.invalidate();
        worker.postMessage({type:'quality',quality,features,sampledAt:e.data.sampledAt});
      }finally{bitmap.close();}
    }
  }catch{worker.postMessage({type:'error'});}
};
