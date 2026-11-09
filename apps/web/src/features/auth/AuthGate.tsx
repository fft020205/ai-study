'use client';

import {createContext,useContext,useEffect,useState,type FormEvent,type ReactNode} from 'react';
import {useTranslation} from 'react-i18next';
import {request} from '@/lib/api';
import {Button,Icon} from '@/components/ui';
import {LanguageSwitcher} from '@/components/LanguageSwitcher';

type User={id:string;username:string};
type Config={required:boolean;registration_enabled:boolean;ai_settings_enabled:boolean};
type Auth={user:User|null;required:boolean;aiSettingsEnabled:boolean;logout:()=>Promise<void>};
const AuthContext=createContext<Auth>({user:null,required:false,aiSettingsEnabled:true,logout:async()=>{}});
export const useAuth=()=>useContext(AuthContext);

export function AuthGate({children}:{children:ReactNode}){
  const {i18n}=useTranslation();const en=i18n.language.startsWith('en');
  const [config,setConfig]=useState<Config|null>(null),[user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [register,setRegister]=useState(false),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
  const load=async()=>{
    setLoading(true);setError('');
    try{const cfg=await request<Config>('/auth/config');setConfig(cfg);
      if(cfg.required)setUser((await request<{user:User|null}>('/auth/me')).user);
    }catch{setError(en?'Unable to connect. Please try again.':'暂时无法连接，请重试。');}
    finally{setLoading(false);}
  };
  useEffect(()=>{void load();const expired=()=>{setUser(null);setError('');};window.addEventListener('study-auth-required',expired);return()=>window.removeEventListener('study-auth-required',expired);},[]);
  const logout=async()=>{
    await request('/auth/logout',{method:'POST'});
    // Reload also releases camera resources, local drafts, and another user's UI.
    window.location.assign('/');
  };
  const submit=async(e:FormEvent)=>{
    e.preventDefault();if(busy)return;setError('');
    if(register&&password!==confirm){setError(en?'Passwords do not match.':'两次输入的密码不一致。');return;}
    setBusy(true);
    try{const result=await request<{user:User}>(register?'/auth/register':'/auth/login',{method:'POST',body:JSON.stringify({username,password})});
      setPassword('');setConfirm('');setUser(result.user);
    }catch(e){setError(e instanceof Error?e.message:(en?'Please try again.':'请重试。'));}
    finally{setBusy(false);}
  };
  if(loading||!config)return <main className="auth-page"><section className="auth-card stack-20" aria-live="polite"><h1>{en?'AI Study Companion':'AI 学习智能伴侣'}</h1><p>{error||(en?'Connecting…':'正在连接…')}</p>{error&&<Button onClick={()=>void load()}>{en?'Try again':'重试'}</Button>}</section></main>;
  if(config.required&&!user)return <main className="auth-page"><div className="auth-language"><LanguageSwitcher/></div><section className="auth-card">
    <div className="auth-brand"><Icon name="spark"/><span>{en?'AI Study Companion':'AI 学习智能伴侣'}</span></div>
    <h1>{register?(en?'Start learning':'开启你的学习之旅'):(en?'Welcome back':'欢迎回来')}</h1>
    <p className="muted">{en?'Sign in to talk with AI and continue your learning.':'登录后，即可与 AI 对话，继续你的学习。'}</p>
    <form className="auth-form" onSubmit={submit}>
      <label htmlFor="account-name">{en?'Username':'用户名'}<input id="account-name" value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required minLength={3} maxLength={64} pattern="[a-zA-Z0-9][a-zA-Z0-9_.\-]{2,63}" placeholder={en?'Letters, numbers, dots, dashes, underscores':'英文、数字、点、横线或下划线'}/></label>
      <label htmlFor="account-password">{en?'Password':'密码'}<input id="account-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={register?'new-password':'current-password'} required minLength={12} maxLength={128} placeholder={en?'At least 12 characters':'至少 12 位'}/></label>
      {register&&<label htmlFor="account-confirm">{en?'Confirm password':'确认密码'}<input id="account-confirm" type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={128}/></label>}
      {error&&<p role="alert" className="history-error">{error}</p>}
      <Button variant="primary" type="submit" disabled={busy}>{busy?(en?'Please wait…':'请稍候…'):register?(en?'Create account':'注册并开始学习'):(en?'Sign in':'登录')}</Button>
    </form>
    {config.registration_enabled&&<button className="text-button" disabled={busy} onClick={()=>{setRegister(!register);setError('');setPassword('');setConfirm('');}}>{register?(en?'Already have an account? Sign in':'已有账号？前往登录'):(en?'New here? Create an account':'还没有账号？注册账号')}</button>}
    <p className="caption muted">{en?'Your learning history is saved to your account. Keep your password safe.':'学习记录将保存在你的账号中，请妥善保存密码。'}</p>
  </section></main>;
  return <AuthContext.Provider value={{user,required:config.required,aiSettingsEnabled:config.ai_settings_enabled,logout}}>{children}</AuthContext.Provider>;
}
