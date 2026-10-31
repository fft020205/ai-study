import {Button,Icon} from '@/components/ui';
import type {CameraAnalysisState} from '@/features/vision/visualAnalysis';
export function LessonPreparation({title,camera,busy,onRetry,onDisableCamera}:{title:string;camera:CameraAnalysisState|null;busy:boolean;onRetry:()=>void;onDisableCamera:()=>void}){
 const observation=camera?.observation,seconds=Math.max(0,Math.min(60,Math.floor(observation?.valid_seconds??0)));
 const failed=camera?.issue,stopped=camera?.device==='stopped';
 const status=failed?(observation?.status==='baseline_insufficient'?'画面基线不足，请重新校准':camera?.device==='error'?'摄像头暂时无法开启，请检查权限或设备':'识别暂时中断，请重试')
  :stopped?'摄像头已停止，请重新开启':!camera?.live?'正在准备摄像头':camera.connection!=='connected'?'正在连接识别服务':!observation?.valid?'等待有效画面，校准进度已保留':'正在校准';
 return <section className="content-page lesson-preparation" aria-label="学习前摄像头校准"><div className="readable stack-20">
  <p className="eyebrow">正式学习前 · {title}</p><h1>先准备好，再开始</h1>
  <p className="muted">请保持面部在画面中，自然眨眼。累计约 60 秒有效画面后，会自动进入 AI 对话。</p>
  <div className="lesson-preparation-progress"><div className="lesson-preparation-status"><Icon name="camera"/><strong role="status">{status}</strong><span>{seconds} / 60 秒</span></div>
   <progress max={60} value={seconds} aria-label="学习前校准进度" aria-valuetext={`已完成${seconds}秒有效采样，共60秒`}/>
   <p className="caption muted">画面不清晰或未检测到人脸时，进度会暂停；校准期间 AI 不会出题。</p></div>
  <div className="actions">{(failed||stopped)&&<Button disabled={busy} onClick={onRetry}>重新开启并校准</Button>}<Button variant="ghost" disabled={busy} onClick={onDisableCamera}>关闭摄像头，继续学习</Button></div>
 </div></section>;
}
