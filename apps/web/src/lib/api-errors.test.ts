import {afterEach,describe,expect,it,vi} from 'vitest';
import i18n from '@/i18n';
import {localizeError} from '@/i18n/errors';
import {en} from '@/i18n/en';
import {api,responseError} from './api';
import {readTurnStream} from './turnStream';
import type {LearningSession} from './types';

const oldServer={detail:[{type:'extra_forbidden',loc:['body','language'],msg:'Extra inputs are not permitted',input:'en'}]};
const response=(body:unknown)=>new Response(JSON.stringify(body),{status:422,headers:{'content-type':'application/json'}});
afterEach(async()=>{vi.unstubAllGlobals();await i18n.changeLanguage('zh-CN');});

describe('API validation feedback',()=>{
  it('explains old-server errors for both JSON and SSE and localizes them',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>response(oldServer)));
    await expect(api.create('mean',{support:false,camera:false})).rejects.toThrow('学习服务版本较旧');
    await expect(readTurnStream({id:'test',version:0} as LearningSession,'','open','test-request',new AbortController().signal,()=>{})).rejects.toThrow('学习服务版本较旧');
    const error=await responseError(response(oldServer));
    expect(error.status).toBe(422);
    await i18n.changeLanguage('en');
    expect(localizeError(error)).toBe(en.errors.serverVersionOutdated);
  });

  it('does not expose submitted inputs in other validation failures',async()=>{
    const error=await responseError(response({detail:[{type:'literal_error',loc:['body','language'],input:'PRIVATE_USER_CONTENT'}]}));
    expect(error.message).toBe('请求参数无效，请检查后重试。');
    expect(error.message).not.toContain('PRIVATE_USER_CONTENT');
    const other=await responseError(response({detail:[{type:'extra_forbidden',loc:['body','other'],input:'PRIVATE'}]}));
    expect(other.message).toBe(error.message);
  });

  it('keeps explicit server messages and safely falls back for non-JSON failures',async()=>{
    expect((await responseError(new Response(JSON.stringify({detail:'这次学习已经结束。'}),{status:409}))).message).toBe('这次学习已经结束。');
    const error=await responseError(new Response('<html>unavailable</html>',{status:502}));
    expect(error.message).toBe('请求未完成，请稍后重试。');
  });
});
