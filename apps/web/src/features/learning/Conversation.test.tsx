import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {Conversation} from './Conversation';
import type {LearningSession} from '@/lib/types';

function render(reason='waiting',busy=false,override:Partial<LearningSession>={}){
 const session={id:'s',title:'变量',status:'active',support_mode:'on',consent:{support:true,camera:false},messages:[],
  current_node:{id:'q',title:'复制与赋值'},episode:{id:'e',question_key:'q',reason,created_at:1,expires_at:2,text:'保留这条支持邀请'},...override} as LearningSession;
 return renderToStaticMarkup(createElement(Conversation,{session,busy,configured:true,turn:null,
  onAction:()=>{},onReading:()=>{},onAISettings:()=>{},onRetry:()=>{}}));
}
it.each(['waiting','difficulty','cognitive_load','fatigue','visual_signal'])('keeps %s support visible past its legacy expiry and during a reply',reason=>{
 expect(render(reason)).toContain('aria-label="主动支持"');
 expect(render(reason,true)).toContain('保留这条支持邀请');
});
it('supports invitations with no expiry',()=>{
 expect(render('waiting',false,{episode:{id:'e',question_key:'q',reason:'waiting',created_at:1,expires_at:null,text:'保留这条支持邀请'}})).toContain('保留这条支持邀请');
});
it('honours dismissal and disabled or ended learning',()=>{
 for(const override of [{episode:null},{status:'ended' as const},{support_mode:'paused' as const},{consent:{support:false,camera:false}}]){
  expect(render('waiting',false,override)).not.toContain('aria-label="主动支持"');
 }
});

it('shows model-generated support titles and guidance without the removed correction button',()=>{
 const markup=render('fatigue',false,{episode:{id:'e',question_key:'q',reason:'fatigue',kind:'fatigue',title:'先照顾一下精力',created_at:1,expires_at:null,text:'检测到一些可能的疲劳迹象。\n\n**可以先停一小会儿**，再一起看当前这一步。'}});
 expect(markup).toContain('先照顾一下精力');
 expect(markup).toContain('<strong>可以先停一小会儿</strong>');
 expect(markup).not.toContain('纠正我的理解');
 expect(markup).toContain('我还在思考');
 expect(markup).toContain('需要一点帮助');
 expect(markup).toContain('暂时不用');
});

it('keeps Markdown tables in a labelled, keyboard-focusable scroll region',()=>{
 const markup=render('waiting',false,{messages:[{id:'m',role:'assistant',text:'| Capability | Status |\n|---|---|\n| Reasoning | Verified |',code:'',source:'ai',node_id:'q',created_at:1}]});
 expect(markup).toContain('<div class="table-scroll" role="region" aria-label="表格，可横向滚动" tabindex="0"><table>');
 expect(markup).toContain('<th>Capability</th>');
 expect(markup).toContain('<td>Reasoning</td>');
});


it('shows preparation only after a real support request has been triggered',()=>{
 const episode={id:'e',question_key:'q',reason:'fatigue',kind:'fatigue' as const,created_at:1,expires_at:null,text:null};
 const pending=render('fatigue',false,{pending:true,episode});
 expect(pending).toContain('正在准备适合你的支持建议');
 expect(pending).not.toContain('aria-label="主动支持"');
 expect(render('fatigue',false,{pending:false,episode})).not.toContain('正在准备适合你的支持建议');
 expect(render('fatigue',false,{pending:true,episode,consent:{support:false,camera:false}})).not.toContain('正在准备适合你的支持建议');
});
