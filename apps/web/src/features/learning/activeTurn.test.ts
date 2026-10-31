import {it,expect} from 'vitest';
import {pendingUserMessage,type ActiveTurn} from './activeTurn';
import type {LearningSession} from '@/lib/types';
it('shows user text immediately and removes the optimistic duplicate after acceptance or recovery',()=>{
 const session={id:'s',messages:[],current_node:{id:'q'}} as unknown as LearningSession;
 const turn:ActiveTurn={sessionId:'s',requestId:'r',text:'你好',event:'message',phase:'sending',reply:'',acceptedId:null,error:''};
 const message=pendingUserMessage(session,turn);expect(message?.text).toBe('你好');
 expect(pendingUserMessage({...session,messages:[{...message!,id:'server-id'}]},turn)).toBeNull();
 expect(pendingUserMessage(session,{...turn,sessionId:'other'})).toBeNull();
});
