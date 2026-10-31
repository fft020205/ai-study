import {useState} from 'react';
import type {Consent} from '@/lib/types';
import {Button,Icon,Toggle} from '@/components/ui';
export function ConsentPanel({title,initial={support:false,camera:false},settings=false,aiConfigured,onSubmit,onBack,onAISettings,busy}:{title:string;initial?:Consent;settings?:boolean;aiConfigured:boolean;onSubmit:(c:Consent)=>void;onBack:()=>void;onAISettings:()=>void;busy:boolean}){
  const [value,setValue]=useState(initial);
  return <section className="content-page consent-page" data-design-node={settings?'10:815':'5:64'}><div className="readable stack-20">
    <p className="eyebrow">{settings?'随时可更改':'开始前 · 约 1 分钟'}</p><h1>{settings?'学习设置':'监测方式与 API'}</h1>
    <p className="muted small">{settings?'关闭任一项，也可以继续学习。':`已选：${title} · 约 8–10 分钟。首次均为关闭，可随时更改。`}</p>
    <div className="consent-box"><div className="consent-row"><Icon name="mutedSpark"/><div><strong>主动支持</strong><p>在你可能卡住时，先确认，再给一点帮助。</p></div><Toggle label="主动支持" value={value.support} onChange={support=>setValue({support,camera:support&&value.camera})}/></div>
      <div className="consent-row"><Icon name="camera"/><div><strong>摄像头与自览</strong><p>显示自己的画面，分析眨眼、视线偏移和头部运动。</p><span className="caption">需先开启主动支持；开启后先完成约1分钟校准，再开始 AI 对话。</span></div><Toggle label="摄像头与自览" value={value.camera} disabled={!value.support} onChange={camera=>setValue({...value,camera})}/></div>
    </div>
    {!aiConfigured&&<div className="connection-note"><strong>AI 服务尚未连接</strong><p>配置 API 后，AI 会围绕所选课题生成开场、解释和提示，并根据交流调整节奏。</p><Button className="connection-action" onClick={onAISettings}>配置 AI 接口</Button></div>}
    <div className="actions"><Button variant="primary" disabled={busy} onClick={()=>onSubmit(value)}>{settings?'保存并继续':'确认开始'}</Button><Button variant="ghost" onClick={onBack}>返回</Button></div>
  </div></section>;
}
