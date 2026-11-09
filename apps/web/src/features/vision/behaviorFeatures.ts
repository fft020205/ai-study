/** Geometry/feature pipeline adapted from upstream web/app.js at 0c938e4.
 * The real Python CognitiveEngine remains unchanged; raw landmarks stay here.
 */
export type Landmark={x:number;y:number;z?:number};
export type BehavioralFeatures={blink_rate:number;gaze_deviation:number;head_jitter:number};
const distance=(a:Landmark,b:Landmark)=>Math.hypot(a.x-b.x,a.y-b.y);
const center=(points:Landmark[])=>({x:points.reduce((v,p)=>v+p.x,0)/points.length,y:points.reduce((v,p)=>v+p.y,0)/points.length});
export class BehaviorFeatureExtractor{
  private closed=false;
  private blinkTimes:number[]=[];
  private previousNose:Landmark|null=null;
  private previousSample:number|null=null;
  private observedSegments:[number,number][]=[];
  private observedMillis=0;
  get observedSeconds(){return this.observedMillis/1000;}
  invalidate(){this.closed=false;this.previousNose=null;this.previousSample=null;}
  private observe(timestamp:number){
    if(this.previousSample!==null&&timestamp>this.previousSample&&timestamp-this.previousSample<=1500)
      this.observedSegments.push([this.previousSample,timestamp]);
    this.previousSample=timestamp;
    const cutoff=timestamp-60000;
    this.observedSegments=this.observedSegments.filter(([,end])=>end>cutoff);
    this.observedMillis=Math.min(60000,this.observedSegments.reduce((sum,[start,end])=>sum+end-Math.max(start,cutoff),0));
  }
  extract(points:Landmark[],timestamp:number,width:number,height:number):BehavioralFeatures|null{
    if(!Number.isFinite(timestamp)||points.length<473||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))){this.invalidate();return null;}
    const eye=[33,160,158,133,153,144].map(i=>({x:points[i].x*width,y:points[i].y*height}));
    const eyeWidth=distance(eye[0],eye[3]);if(eyeWidth<1){this.invalidate();return null;}
    this.observe(timestamp);
    const ear=(distance(eye[1],eye[5])+distance(eye[2],eye[4]))/(2*eyeWidth);
    if(ear<0.22&&!this.closed){this.blinkTimes.push(timestamp);this.closed=true;}
    if(ear>0.25)this.closed=false;
    this.blinkTimes=this.blinkTimes.filter(t=>timestamp-t<60000);
    const iris=center([468,469,470,471,472].map(i=>({x:points[i].x*width,y:points[i].y*height})));
    const eyeCenter=center(eye);
    const nose=points[1],head=this.previousNose?distance(nose,this.previousNose):0;
    this.previousNose={x:nose.x,y:nose.y};
    return {blink_rate:Math.min(240,this.blinkTimes.length*60000/Math.max(1000,this.observedMillis)),gaze_deviation:Math.abs(iris.x-eyeCenter.x)/eyeWidth,head_jitter:head};
  }
}
