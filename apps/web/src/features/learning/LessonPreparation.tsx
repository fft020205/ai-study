import {useTranslation} from 'react-i18next';
import {Button,Icon} from '@/components/ui';
import type {CameraAnalysisState} from '@/features/vision/visualAnalysis';
export function LessonPreparation({title,camera,busy,onRetry,onDisableCamera}:{title:string;camera:CameraAnalysisState|null;busy:boolean;onRetry:()=>void;onDisableCamera:()=>void}){
 const {t}=useTranslation();
 const observation=camera?.observation,seconds=Math.max(0,Math.min(60,Math.floor(observation?.valid_seconds??0)));
 const failed=camera?.issue,stopped=camera?.device==='stopped';
 const status=failed?(observation?.status==='baseline_insufficient'?'baselineInsufficient':camera?.device==='error'?'cameraError':'recognitionInterrupted')
  :stopped?'stopped':!camera?.live?'preparingCamera':camera.connection!=='connected'?'connecting':!observation?.valid?'waiting':'calibrating';
 return <section className="content-page lesson-preparation" aria-label={t('lessonPreparation.label')}><div className="readable stack-20">
  <p className="eyebrow">{t('lessonPreparation.eyebrow',{title})}</p><h1>{t('lessonPreparation.title')}</h1>
  <p className="muted">{t('lessonPreparation.description')}</p>
  <div className="lesson-preparation-progress"><div className="lesson-preparation-status"><Icon name="camera"/><strong role="status">{t(`lessonPreparation.${status}`)}</strong><span>{t('lessonPreparation.seconds',{seconds})}</span></div>
   <progress max={60} value={seconds} aria-label={t('lessonPreparation.progress')} aria-valuetext={t('lessonPreparation.progressValue',{seconds})}/>
   <p className="caption muted">{t('lessonPreparation.progressHelp')}</p></div>
  <div className="actions">{(failed||stopped)&&<Button disabled={busy} onClick={onRetry}>{t('lessonPreparation.retry')}</Button>}<Button variant="ghost" disabled={busy} onClick={onDisableCamera}>{t('lessonPreparation.disable')}</Button></div>
 </div></section>;
}
