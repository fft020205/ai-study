import type {ActiveTurn} from './activeTurn';
import type {LearningSession} from '@/lib/types';
import type {CameraAnalysisState} from '@/features/vision/visualAnalysis';

export function needsLessonCalibration(session:LearningSession|null,camera:CameraAnalysisState|null,previouslyReady=false){
 if(!session||session.status!=='active'||!session.consent.camera)return false;
 if(camera?.sessionId===session.id&&typeof camera.observation?.lesson_ready==='boolean')return !camera.observation.lesson_ready;
 if(previouslyReady)return false;
 return !(camera?.sessionId===session.id&&camera.live&&!camera.issue&&camera.connection==='connected'
  &&camera.observation?.calibrated&&camera.observation.baseline_quality==='adequate');
}

export function suspendTurnForCalibration(turn:ActiveTurn|null,sessionId:string|undefined):ActiveTurn|null{
 if(!turn||turn.sessionId!==sessionId)return null;
 if(turn.phase==='failed')return turn;
 return {...turn,phase:'failed',reply:'',error:'摄像头需要重新校准，完成后可重试这条回复。'};
}
