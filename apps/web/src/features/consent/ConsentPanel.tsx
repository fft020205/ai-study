import {useState} from 'react';
import {useTranslation} from 'react-i18next';
import type {Consent} from '@/lib/types';
import {Button,Icon,Toggle} from '@/components/ui';
export function ConsentPanel({title,initial={support:false,camera:false},settings=false,aiConfigured,onSubmit,onBack,onAISettings,busy}:{title:string;initial?:Consent;settings?:boolean;aiConfigured:boolean;onSubmit:(c:Consent)=>void;onBack:()=>void;onAISettings:()=>void;busy:boolean}){
  const {t}=useTranslation();
  const [value,setValue]=useState(initial);
  return <section className="content-page consent-page" data-design-node={settings?'10:815':'5:64'}><div className="readable stack-20">
    <p className="eyebrow">{t(settings?'consent.editable':'consent.beforeStart')}</p><h1>{t(settings?'consent.settingsTitle':'consent.startTitle')}</h1>
    <p className="muted small">{settings?t('consent.settingsDescription'):t('consent.selected',{title})}</p>
    <div className="consent-box"><div className="consent-row"><Icon name="mutedSpark"/><div><strong>{t('consent.support')}</strong><p>{t('consent.supportDescription')}</p></div><Toggle label={t('consent.support')} value={value.support} onChange={support=>setValue({support,camera:support&&value.camera})}/></div>
      <div className="consent-row"><Icon name="camera"/><div><strong>{t('consent.camera')}</strong><p>{t('consent.cameraDescription')}</p><span className="caption">{t('consent.cameraRequirement')}</span></div><Toggle label={t('consent.camera')} value={value.camera} disabled={!value.support} onChange={camera=>setValue({...value,camera})}/></div>
    </div>
    {!aiConfigured&&<div className="connection-note"><strong>{t('consent.notConnected')}</strong><p>{t('consent.notConnectedDescription')}</p><Button className="connection-action" onClick={onAISettings}>{t('common.configureAI')}</Button></div>}
    <div className="actions"><Button variant="primary" disabled={busy} onClick={()=>onSubmit(value)}>{t(settings?'consent.save':'consent.start')}</Button><Button variant="ghost" onClick={onBack}>{t('common.back')}</Button></div>
  </div></section>;
}
