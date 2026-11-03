import type {Quality} from './quality';

export type PreparationStage = 'off'|'loading_runtime'|'loading_model'|'checking_frame'|'ready'|'error';
export type VisionPreparation = {stage:PreparationStage;startedAt:number|null};
export type PreparationEvent = {type:'start';at:number}|{type:'runtime_loaded'|'model_ready'|'error'|'stop'}|{type:'quality';quality:Quality};
export const initialPreparation:VisionPreparation={stage:'off',startedAt:null};
export const isPreparing=(state:VisionPreparation)=>['loading_runtime','loading_model','checking_frame'].includes(state.stage);

export function preparationTransition(state:VisionPreparation,event:PreparationEvent):VisionPreparation{
  if(event.type==='stop')return initialPreparation;
  if(event.type==='start')return {stage:'loading_runtime',startedAt:event.at};
  if(state.stage==='off'||state.stage==='error')return state;
  if(event.type==='error')return {...state,stage:'error'};
  if(event.type==='runtime_loaded'&&state.stage==='loading_runtime')return {...state,stage:'loading_model'};
  if(event.type==='model_ready'&&['loading_runtime','loading_model'].includes(state.stage))return {...state,stage:'checking_frame'};
  if(event.type==='quality'&&event.quality==='valid'&&state.stage==='checking_frame')return {...state,stage:'ready'};
  return state;
}

export function preparationSeconds(state:VisionPreparation,now:number):number{
  return state.startedAt===null?0:Math.max(0,Math.floor((now-state.startedAt)/1000));
}
