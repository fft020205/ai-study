"use client";
import {useEffect, useState, type FormEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {Button, Notice} from '@/components/ui';
import {localizeError} from '@/i18n/errors';
import {api} from '@/lib/api';
import type {AIConnection, AIConnectionInput} from '@/lib/types';

type Feedback = {kind:'success'|'error';text?:string;key?:string;values?:Record<string,string>};
export function AIConnectionSettings({onBack,onConfigured}:{onBack?:()=>void;onConfigured?:()=>void}) {
  const {t}=useTranslation();
  const [saved,setSaved]=useState<AIConnection|null>(null);
  const [provider,setProvider]=useState<'openai'|'none'>('openai');
  const [baseUrl,setBaseUrl]=useState('https://api.openai.com/v1');
  const [model,setModel]=useState(''),[key,setKey]=useState('');
  const [timeout,setTimeoutValue]=useState('45');
  const [loading,setLoading]=useState(true),[working,setWorking]=useState<'save'|'test'|null>(null);
  const [feedback,setFeedback]=useState<Feedback|null>(null);
  const showError=(e:unknown)=>setFeedback({kind:'error',text:e instanceof Error?e.message:'操作未完成，请重试。'});
  useEffect(()=>{
    let active=true;
    api.aiConnection().then(value=>{
      if(!active)return;
      setSaved(value);setProvider(value.provider==='none'?'openai':value.provider==='openai'?'openai':'none');
      setBaseUrl(value.base_url);setModel(value.model);setTimeoutValue(String(value.timeout_seconds));
      if(value.load_error)setFeedback({kind:'error',key:'aiSettings.feedback.loadError'});
    }).catch(e=>{if(active)showError(e);}).finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[]);
  const input=():AIConnectionInput=>({provider,base_url:baseUrl.trim(),model:model.trim(),
    ...(key.trim()?{api_key:key.trim()}:{}),timeout_seconds:Number(timeout)});
  const act=async(kind:'save'|'test',event?:FormEvent)=>{
    event?.preventDefault();setFeedback(null);setWorking(kind);
    try{
      if(kind==='save'){
        const result=await api.saveAIConnection(input());
        setSaved(result);setBaseUrl(result.base_url);setKey('');onConfigured?.();
        setFeedback({kind:'success',key:result.configured?'aiSettings.feedback.saved':'aiSettings.feedback.disabled'});
      }else{
        const result=await api.testAIConnection(input());
        setFeedback({kind:'success',key:'aiSettings.feedback.testSuccess',values:{latency:(result.latency_ms/1000).toFixed(1)}});
      }
    }catch(e){showError(e);}finally{setWorking(null);}
  };
  const disabled=loading||working!==null||!saved;
  return <section className="content-page ai-settings-page"><div className="readable stack-20">
    <p className="eyebrow">{t('aiSettings.eyebrow')}</p><h1>{t('aiSettings.title')}</h1>
    <p className="muted small">{t('aiSettings.description')}</p>
    <div className="connection-note" role="status"><strong>{t(loading?'aiSettings.loading':saved?.configured?'aiSettings.configured':'aiSettings.notConfigured')}</strong>
      <p>{saved?.configured?t('aiSettings.currentService',{service:saved.provider==='deeptutor'?'DeepTutor':saved.model}):t('aiSettings.disconnectedDescription')}</p></div>
    <form className="ai-connection-form" onSubmit={e=>void act('save',e)} autoComplete="off">
      <fieldset disabled={disabled} className="ai-settings-fields">
        <label className="ai-field"><span>{t('aiSettings.provider')}</span><select value={provider} onChange={e=>setProvider(e.target.value as 'openai'|'none')}>
          <option value="openai">{t('aiSettings.openAICompatible')}</option><option value="none">{t('aiSettings.disabled')}</option></select></label>
        <label className="ai-field"><span>{t('aiSettings.baseUrl')}</span><input type="url" aria-describedby="base-url-help" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} required maxLength={2048} placeholder={t('aiSettings.baseUrlPlaceholder')} spellCheck={false}/>
          <small id="base-url-help">{t('aiSettings.baseUrlHelp')}</small></label>
        <label className="ai-field"><span>{t('aiSettings.apiKey')}</span><input type="password" value={key} onChange={e=>setKey(e.target.value)} autoComplete="new-password" maxLength={4096} spellCheck={false} placeholder={t(saved?.has_api_key?'aiSettings.savedKeyPlaceholder':'aiSettings.apiKeyPlaceholder')}/>
          <small>{t('aiSettings.apiKeyHelp')}</small></label>
        <label className="ai-field"><span>{t('aiSettings.model')}</span><input value={model} onChange={e=>setModel(e.target.value)} required={provider==='openai'} maxLength={200} placeholder={t('aiSettings.modelPlaceholder')} spellCheck={false}/></label>
        <label className="ai-field ai-timeout"><span>{t('aiSettings.timeout')}</span><input type="number" min={1} max={120} step={1} required value={timeout} onChange={e=>setTimeoutValue(e.target.value)}/></label>
      </fieldset>
      <p className="caption muted">{t('aiSettings.testNotice')}</p>
      {feedback&&<div className={`ai-feedback ${feedback.kind}`} role={feedback.kind==='error'?'alert':'status'}><Notice>{feedback.key?t(feedback.key,feedback.values):localizeError(feedback.text,'errors.operationIncomplete')}</Notice></div>}
      <div className="actions"><Button type="submit" variant="primary" disabled={disabled}>{t(working==='save'?'aiSettings.saving':'aiSettings.save')}</Button>
        <Button type="button" disabled={disabled||provider==='none'} onClick={()=>void act('test')}>{t(working==='test'?'aiSettings.testing':'aiSettings.test')}</Button>
        {onBack?<Button type="button" variant="ghost" disabled={working!==null} onClick={onBack}>{t('aiSettings.back')}</Button>:<a className="button ghost" href="/">{t('aiSettings.back')}</a>}</div>
    </form>
  </div></section>;
}
