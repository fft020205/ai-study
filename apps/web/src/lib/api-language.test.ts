import {afterEach,describe,expect,it,vi} from 'vitest';
import i18n from '@/i18n';
import {api} from './api';
import {readTurnStream} from './turnStream';
import type {LearningSession} from './types';

const session={id:'test-session',version:3} as LearningSession;
afterEach(async()=>{vi.unstubAllGlobals();await i18n.changeLanguage('zh-CN');});

describe('language preference transport',()=>{
  it('reads the current language for creation, controls, JSON turns and activity',async()=>{
    const fetch=vi.fn(async()=>new Response('{}',{headers:{'content-type':'application/json'}}));
    vi.stubGlobal('fetch',fetch);
    await i18n.changeLanguage('en');
    await api.create('mean',{support:true,camera:false});
    await api.control(session,'hint');
    await api.answer(session,'My idea','request-id',new AbortController().signal);
    await api.activity(session,{foreground:true,has_draft:false,composing:false,busy:false,reading:false});
    expect(fetch.mock.calls).toHaveLength(4);
    for(const call of fetch.mock.calls as unknown as [string,RequestInit][]){
      expect(JSON.parse(call[1].body as string).language).toBe('en');
    }
    await i18n.changeLanguage('zh-CN');
    await api.create('mean',{support:false,camera:false});
    const call=fetch.mock.calls.at(-1) as unknown as [string,RequestInit];
    expect(JSON.parse(call[1].body as string).language).toBe('zh-CN');
  });

  it('includes the language when opening, sending and correcting over SSE',async()=>{
    const fetch=vi.fn(async()=>new Response(`event: complete\ndata: ${JSON.stringify({request_id:'test-request',session})}\n\n`,{headers:{'content-type':'text/event-stream'}}));
    vi.stubGlobal('fetch',fetch);
    await i18n.changeLanguage('en');
    for(const event of ['open','message','correct'] as const){
      await readTurnStream(session,'My idea',event,'test-request',new AbortController().signal,()=>{});
    }
    for(const call of fetch.mock.calls as unknown as [string,RequestInit][]){
      expect(JSON.parse(call[1].body as string).language).toBe('en');
    }
  });
});
