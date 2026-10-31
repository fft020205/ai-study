import {describe,it,expect} from 'vitest';
import type {LearningSession} from '@/lib/types';
import {applySessionTitle,mergeSession} from './sessionMetadata';
const session=(version:number,title_version:number,title:string)=>({id:'a',version,title_version,title,messages:[{text:`轮次${version}`}]} as LearningSession);
describe('independent history titles',()=>{
 it('keeps a renamed title when a previously generated reply arrives',()=>{
  const result=mergeSession(session(3,2,'新名字'),session(4,0,'课程名'));
  expect(result.title).toBe('新名字');expect(result.version).toBe(4);expect(result.messages[0].text).toBe('轮次4');
 });
 it('accepts newer metadata without rolling lesson content back',()=>{
  const result=mergeSession(session(5,0,'课程名'),session(3,1,'重命名'));
  expect(result.title).toBe('重命名');expect(result.version).toBe(5);expect(result.messages[0].text).toBe('轮次5');
 });
 it('ignores another record or an older title response',()=>{
  const current=session(5,2,'最新');
  expect(applySessionTitle(current,{id:'other',title:'别的记录',title_version:3})).toBe(current);
  expect(applySessionTitle(current,{id:'a',title:'迟到名称',title_version:1})).toBe(current);
 });
});
