import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import Home from './page';
import {request} from '@/lib/api';
import {readTurnStream} from '@/lib/turnStream';
import i18n from '@/i18n';
import {zhCN} from '@/i18n/zh-CN';
import type {LearningSession} from '@/lib/types';

const state=vi.hoisted(()=>({session:null as unknown as LearningSession,leases:0,sockets:[] as TestSocket[],release:null as (()=>void)|null,signal:null as AbortSignal|null}));
vi.mock('@/lib/api',()=>({
  request:vi.fn(async()=>({run_id:`run-${++state.leases}`,ticket:'test-only-ticket',websocket_path:'/api/sessions/lesson/vision/ws',calibration_seconds:5})),
  api:{
    bootstrap:vi.fn(async()=>({tasks:[],sessions:[state.session],capabilities:{ai_configured:true}})),
    get:vi.fn(async()=>state.session),
    activity:vi.fn(async()=>state.session),
    control:vi.fn(async()=>state.session)
  }
}));
vi.mock('@/lib/turnStream',()=>({readTurnStream:vi.fn()}));
vi.mock('@/features/vision/cameraDeviceKey',()=>({cameraDeviceKey:async()=> 'a'.repeat(64)}));

class TestSocket{
  static OPEN=1;
  readyState=1;bufferedAmount=0;
  onopen:(()=>void)|null=null;onclose:(()=>void)|null=null;onerror:(()=>void)|null=null;
  onmessage:((event:{data:string})=>void)|null=null;
  send=vi.fn();
  constructor(){
    state.sockets.push(this);const run=state.leases;
    queueMicrotask(()=>{
      this.onopen?.();
      this.onmessage?.({data:JSON.stringify({type:'connected',data:{available:true,run_id:`run-${run}`,status:run===1?'analyzing':'revalidating',lesson_ready:true,calibrated:run===1,baseline_quality:run===1?'adequate':'pending',valid:run===1,required_seconds:5,valid_seconds:0}})});
    });
  }
  close(){if(this.readyState===3)return;this.readyState=3;queueMicrotask(()=>this.onclose?.());}
}

beforeEach(async()=>{
  await i18n.changeLanguage('zh-CN');vi.clearAllMocks();state.leases=0;state.sockets=[];state.release=null;state.signal=null;
  state.session={id:'lesson',title:'平均数01',title_version:0,task_id:'mean',content_version:'course-dialogue-v1',dialogue_version:'course-dialogue-v1',version:0,
    status:'active',milestone_reached:false,support_mode:'on',consent:{support:true,camera:true},created_at:1,updated_at:1,node_index:0,total_steps:3,
    messages:[{id:'opening',role:'assistant',text:'测试课程中的已存在问题',code:'',source:'ai',node_id:'q',created_at:1}],records:[],
    current_node:{id:'q',title:'按人数加权',kind:'question',prompt:'',code:''},episode:null,pending:false,hint_level:0,ready:false,exposed:false,protected:false};
  Object.defineProperty(document,'hidden',{configurable:true,value:false});
  vi.stubGlobal('WebSocket',TestSocket);
  vi.stubGlobal('ResizeObserver',class{observe(){} disconnect(){}});
  vi.stubGlobal('Worker',class{
    onmessage:((event:{data:unknown})=>void)|null=null;onerror=null;terminate(){}
    postMessage(message:{type:string}){if(message.type==='init')queueMicrotask(()=>{
      this.onmessage?.({data:{type:'ready'}});
      this.onmessage?.({data:{type:'quality',quality:'valid',sampledAt:Date.now(),features:{blink_rate:10,gaze_deviation:.1,head_jitter:.001}}});
    });}
  });
  vi.spyOn(HTMLMediaElement.prototype,'play').mockResolvedValue(undefined);
});
afterEach(()=>{state.release?.();cleanup();Reflect.deleteProperty(document,'hidden');vi.unstubAllGlobals();vi.restoreAllMocks();});

it('keeps the actual answer UI, draft and media alive while the vision socket reconnects',async()=>{
  const track={stop:vi.fn(),onended:null};
  const getUserMedia=vi.fn(async()=>({getTracks:()=>[track]}));
  Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
  vi.mocked(readTurnStream).mockImplementation(async(session,text,_event,requestId,signal,onFrame)=>{
    state.signal=signal;
    state.session={...session,version:1,pending:true,messages:[...session.messages,{id:'answer',request_id:requestId,role:'user',text,code:'',source:'submitted',node_id:'q',created_at:2}]};
    onFrame({event:'accepted',data:{session:state.session,message_id:'answer',request_id:requestId}});
    await new Promise<void>(resolve=>{state.release=resolve;});
    state.session={...state.session,version:2,pending:false,messages:[...state.session.messages,{id:'reply',role:'assistant',text:'测试 Provider 的回复',code:'',source:'ai',node_id:'q',created_at:3}]};
    onFrame({event:'complete',data:{session:state.session,request_id:requestId}});
  });
  render(<Home/>);
  fireEvent.click(await screen.findByRole('button',{name:/打开学习记录/}));
  const input=await screen.findByRole('textbox',{name:zhCN.composer.label});
  fireEvent.change(input,{target:{value:'这是我的回答'}});
  fireEvent.click(screen.getByRole('button',{name:zhCN.composer.send}));
  await waitFor(()=>expect(state.signal).not.toBeNull());
  fireEvent.change(input,{target:{value:'还没发送的新草稿'}});
  state.sockets[0].close();
  await waitFor(()=>expect(state.sockets).toHaveLength(2),{timeout:3000});
  expect(screen.getByRole('textbox',{name:zhCN.composer.label})).toBe(input);
  expect((input as HTMLTextAreaElement).value).toBe('还没发送的新草稿');
  expect(screen.queryByText(zhCN.lessonPreparation.title)).toBeNull();
  expect(state.signal!.aborted).toBe(false);
  expect(getUserMedia).toHaveBeenCalledTimes(1);expect(track.stop).not.toHaveBeenCalled();
  for(const [,options] of vi.mocked(request).mock.calls)expect(JSON.parse(options!.body as string).reset).toBe(false);
  state.release!();
  expect(await screen.findByText('测试 Provider 的回复')).toBeTruthy();
  expect((input as HTMLTextAreaElement).value).toBe('还没发送的新草稿');
  expect(getUserMedia).toHaveBeenCalledTimes(1);
});

it('flushes streamed deltas once and lets the complete snapshot discard a pending buffer',async()=>{
  state.session={...state.session,consent:{support:true,camera:false},ready:true};
  vi.mocked(readTurnStream).mockImplementation(async(session,text,_event,requestId,signal,onFrame)=>{
    state.signal=signal;
    state.session={...session,version:1,pending:true,messages:[...session.messages,{id:'answer',request_id:requestId,role:'user',text,code:'',source:'submitted',node_id:'q',created_at:2}]};
    onFrame({event:'accepted',data:{session:state.session,message_id:'answer',request_id:requestId}});
    onFrame({event:'delta',data:{text:'流式第一段',request_id:requestId}});
    onFrame({event:'delta',data:{text:'与第二段',request_id:requestId}});
    await new Promise<void>(resolve=>{state.release=resolve;});
    onFrame({event:'delta',data:{text:'不应迟到的片段',request_id:requestId}});
    state.session={...state.session,version:2,pending:false,messages:[...state.session.messages,{id:'reply',role:'assistant',text:'服务端完整回复',code:'',source:'ai',node_id:'q',created_at:3}]};
    onFrame({event:'complete',data:{session:state.session,request_id:requestId}});
  });
  render(<Home/>);
  fireEvent.click(await screen.findByRole('button',{name:/打开学习记录/}));
  const input=await screen.findByRole('textbox',{name:zhCN.composer.label});
  fireEvent.change(input,{target:{value:'这是我的回答'}});
  fireEvent.click(screen.getByRole('button',{name:zhCN.composer.send}));
  expect(await screen.findByText('流式第一段与第二段')).toBeTruthy();
  fireEvent.change(input,{target:{value:'流式期间的新草稿'}});
  state.release!();
  expect(await screen.findByText('服务端完整回复')).toBeTruthy();
  expect(screen.queryByText('流式第一段与第二段')).toBeNull();
  await new Promise(resolve=>setTimeout(resolve,80));
  expect(screen.queryByText('不应迟到的片段')).toBeNull();
  expect((input as HTMLTextAreaElement).value).toBe('流式期间的新草稿');
});

it('shows the milestone summary without restarting learning resources',async()=>{
  state.session={...state.session,status:'ended',milestone_reached:true,support_mode:'off',consent:{support:true,camera:false},ready:false};
  render(<Home/>);
  fireEvent.click(await screen.findByRole('button',{name:'打开学习记录：平均数01'}));
  expect(await screen.findByText(zhCN.summary.milestoneTitle)).toBeTruthy();
  expect(screen.getByText('你已完成平均数01的全部学习目标，这段学习记录已保存在历史中。')).toBeTruthy();
  expect(screen.getByText(zhCN.summary.caveat)).toBeTruthy();
  expect(screen.queryByRole('textbox',{name:zhCN.composer.label})).toBeNull();
  expect(screen.queryByText(zhCN.summary.eyebrow)).toBeNull();
});
