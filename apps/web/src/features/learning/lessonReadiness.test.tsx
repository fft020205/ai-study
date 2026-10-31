import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import type {LearningSession} from '@/lib/types';
import type {CameraAnalysisState} from '@/features/vision/visualAnalysis';
import {needsLessonCalibration,suspendTurnForCalibration} from './lessonReadiness';
import type {ActiveTurn} from './activeTurn';
import {LessonPreparation} from './LessonPreparation';
const session={id:'s',status:'active',consent:{support:true,camera:true}} as LearningSession;
const camera={sessionId:'s',live:true,device:'live',deviceMessage:'',issue:false,connection:'connected',observation:{available:true,status:'analyzing',valid:true,calibrated:true,baseline_quality:'adequate',valid_seconds:60}} as CameraAnalysisState;
it('waits for this session and an adequate real baseline before entering dialogue',()=>{
 expect(needsLessonCalibration(session,null)).toBe(true);
 expect(needsLessonCalibration(session,camera)).toBe(false);
 expect(needsLessonCalibration(session,{...camera,sessionId:'other'})).toBe(true);
 for(const update of [{live:false},{connection:'error' as const},{issue:true},{observation:{...camera.observation!,calibrated:false}},{observation:{...camera.observation!,baseline_quality:'insufficient' as const}}]){
  expect(needsLessonCalibration(session,{...camera,...update})).toBe(true);
 }
});
it('allows text-only learning and does not restart a completed baseline on bad frames',()=>{
 expect(needsLessonCalibration({...session,consent:{support:true,camera:false}},null)).toBe(false);
 expect(needsLessonCalibration(null,null)).toBe(false);
 expect(needsLessonCalibration(session,{...camera,observation:{...camera.observation!,valid:false,status:'waiting_quality'}})).toBe(false);
});
it('renders actual effective progress and recovery without a question or composer',()=>{
 const markup=renderToStaticMarkup(createElement(LessonPreparation,{title:'平均数01',camera:{...camera,observation:{...camera.observation!,calibrated:false,valid:false,valid_seconds:24}},busy:false,onRetry:()=>{},onDisableCamera:()=>{}}));
 expect(markup).toContain('value="24"');expect(markup).toContain('校准期间 AI 不会出题');
 expect(markup).toContain('等待有效画面');expect(markup).toContain('关闭摄像头，继续学习');
 expect(markup).not.toContain('textarea');
 const error=renderToStaticMarkup(createElement(LessonPreparation,{title:'平均数01',camera:{...camera,issue:true},busy:false,onRetry:()=>{},onDisableCamera:()=>{}}));
 expect(error).toContain('重新开启并校准');
});

it('retains sent text and retry identity when camera loss interrupts a streamed turn',()=>{
 const turn={sessionId:'s',requestId:'same-request',text:'我的回答',event:'message',phase:'streaming',reply:'临时片段',acceptedId:'saved-message',error:''} as ActiveTurn;
 const paused=suspendTurnForCalibration(turn,'s');
 expect(paused).toMatchObject({phase:'failed',reply:'',text:'我的回答',requestId:'same-request',acceptedId:'saved-message'});
 expect(suspendTurnForCalibration(turn,'other')).toBeNull();
 expect(suspendTurnForCalibration(paused,'s')).toBe(paused);
});
