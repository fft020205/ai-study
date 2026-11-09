import {useTranslation} from 'react-i18next';
import {Button,Icon} from '@/components/ui';
import type {CameraAnalysisState} from '@/features/vision/visualAnalysis';
export function LessonPreparation({title,camera,busy,onRetry,onDisableCamera}:{title:string;camera:CameraAnalysisState|null;busy:boolean;onRetry:()=>void;onDisableCamera:()=>void}){
 const {t}=useTranslation();
 const observation=camera?.observation,required=Math.max(1,Math.min(60,observation?.required_seconds??60));
 const seconds=Math.max(0,Math.min(required,Math.floor(observation?.valid_seconds??0)));
 const resumed=observation?.calibration_mode==='resume',continued=observation?.calibration_mode==='continued';
 const failed=camera?.issue,stopped=camera?.device==='stopped';
 const status=failed?(observation?.status==='baseline_insufficient'?'baselineInsufficient':camera?.device==='error'?'cameraError':'recognitionInterrupted')
  :stopped?'stopped':!camera?.live?'preparingCamera':camera.connection!=='connected'?'connecting':!observation?.valid?'waiting':resumed?'revalidating':'calibrating';
 return <section className="content-page lesson-preparation" aria-label={t('lessonPreparation.label')}><div className="readable stack-20">
  <p className="eyebrow">{t('lessonPreparation.eyebrow',{title})}</p><h1>{t(resumed?'lessonPreparation.resumeTitle':continued?'lessonPreparation.continuedTitle':'lessonPreparation.title')}</h1>
  <p className="muted">{t(resumed?'lessonPreparation.resumeDescription':continued?'lessonPreparation.continuedDescription':'lessonPreparation.description',{required})}</p>
  <div className="lesson-preparation-progress"><div className="lesson-preparation-status"><Icon name="camera"/><strong role="status">{t(`lessonPreparation.${status}`)}</strong><span>{t('lessonPreparation.seconds',{seconds,required})}</span></div>
   <progress max={required} value={seconds} aria-label={t('lessonPreparation.progress')} aria-valuetext={t('lessonPreparation.progressValue',{seconds,required})}/>
   <p className="caption muted">{t('lessonPreparation.progressHelp')}</p></div>
  <div className="actions">{(resumed||continued)&&<Button variant="ghost" disabled={busy} onClick={onRetry}>{t('lessonPreparation.recalibrate')}</Button>}{(failed||stopped)&&<Button disabled={busy} onClick={onRetry}>{t('lessonPreparation.retry')}</Button>}<Button variant="ghost" disabled={busy} onClick={onDisableCamera}>{t('lessonPreparation.disable')}</Button></div>
 </div></section>;
}
