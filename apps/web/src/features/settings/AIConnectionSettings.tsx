"use client";
import {useEffect, useState, type FormEvent} from 'react';
import {Button, Notice} from '@/components/ui';
import {api} from '@/lib/api';
import type {AIConnection, AIConnectionInput} from '@/lib/types';

type Feedback = {kind:'success'|'error'; text:string};
export function AIConnectionSettings({onBack,onConfigured}:{onBack?:()=>void;onConfigured?:()=>void}) {
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
      if(value.load_error)setFeedback({kind:'error',text:'之前保存的配置无法读取，请重新填写并保存。'});
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
        setFeedback({kind:'success',text:result.configured?'已保存并生效。你可以返回学习页发送回答。':'已保存，AI 连接已停用。'});
      }else{
        const result=await api.testAIConnection(input());
        setFeedback({kind:'success',text:`${result.message} 用时 ${(result.latency_ms/1000).toFixed(1)} 秒。测试不会保存配置，请再点击“保存并生效”。`});
      }
    }catch(e){showError(e);}finally{setWorking(null);}
  };
  const disabled=loading||working!==null||!saved;
  return <section className="content-page ai-settings-page"><div className="readable stack-20">
    <p className="eyebrow">连接你选择的模型</p><h1>AI 接口设置</h1>
    <p className="muted small">填写服务商提供的地址、密钥和模型名。保存后立即生效。</p>
    <div className="connection-note" role="status"><strong>{loading?'正在读取配置…':saved?.configured?'当前已配置 AI 服务':'当前尚未启用 AI 服务'}</strong>
      <p>{saved?.configured?`当前服务：${saved.provider==='deeptutor'?'DeepTutor':saved.model}。配置齐全不代表连接测试已通过。`:'连接后，课程开场、解释与提示都由模型生成。'}</p></div>
    <form className="ai-connection-form" onSubmit={e=>void act('save',e)} autoComplete="off">
      <fieldset disabled={disabled} className="ai-settings-fields">
        <label className="ai-field"><span>接口类型</span><select value={provider} onChange={e=>setProvider(e.target.value as 'openai'|'none')}>
          <option value="openai">OpenAI 兼容接口</option><option value="none">暂不启用</option></select></label>
        <label className="ai-field"><span>API 地址</span><input type="url" aria-describedby="base-url-help" value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} required maxLength={2048} placeholder="https://服务商地址/v1" spellCheck={false}/>
          <small id="base-url-help">填写服务商的 Base URL；也可粘贴以 /chat/completions 结尾的完整地址。</small></label>
        <label className="ai-field"><span>API 密钥</span><input type="password" value={key} onChange={e=>setKey(e.target.value)} autoComplete="new-password" maxLength={4096} spellCheck={false} placeholder={saved?.has_api_key?'已保存密钥；留空继续使用':'粘贴服务商提供的 API Key'}/>
          <small>密钥只保存在本机后端，不回显。更换 API 地址时需重新填写。</small></label>
        <label className="ai-field"><span>模型名</span><input value={model} onChange={e=>setModel(e.target.value)} required={provider==='openai'} maxLength={200} placeholder="填写服务商控制台中的模型标识" spellCheck={false}/></label>
        <label className="ai-field ai-timeout"><span>请求超时（秒）</span><input type="number" min={1} max={120} step={1} required value={timeout} onChange={e=>setTimeoutValue(e.target.value)}/></label>
      </fieldset>
      <p className="caption muted">“测试连接”会向填写的服务发送一次简短请求，可能产生少量调用费用。测试不发送你的学习记录。</p>
      {feedback&&<div className={`ai-feedback ${feedback.kind}`} role={feedback.kind==='error'?'alert':'status'}><Notice>{feedback.text}</Notice></div>}
      <div className="actions"><Button type="submit" variant="primary" disabled={disabled}>{working==='save'?'正在保存…':'保存并生效'}</Button>
        <Button type="button" disabled={disabled||provider==='none'} onClick={()=>void act('test')}>{working==='test'?'正在测试…':'测试连接'}</Button>
        {onBack?<Button type="button" variant="ghost" disabled={working!==null} onClick={onBack}>返回学习</Button>:<a className="button ghost" href="/">返回学习</a>}</div>
    </form>
  </div></section>;
}
