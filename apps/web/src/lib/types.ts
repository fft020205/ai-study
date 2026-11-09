import type {Language} from '@/i18n';

export type Consent = { support: boolean; camera: boolean };
export type Task = { id: string; title: string; subtitle: string; icon: 'code'|'chart'|'link'; steps: number; content_version: string };
export type Message = { id: string; request_id?:string; role: 'user'|'assistant'|'system'; text: string; code: string; source: 'course'|'hint'|'answer'|'ai'|'submitted'|'control'|'correction'|'command'; node_id: string; created_at: number };
export type CameraAlert = {kind:'fatigue'|'high_load';source:'self_report'|'correction'|'visual_heuristic';evidence_quote:string;evidence_note?:string;captured_at:number;expires_at:number};
export type LearningSession = {
  id: string; title: string; title_version: number; language?: Language; task_id: string; content_version: string; dialogue_version: string; version: number;
  status: 'active'|'ended'; support_mode: 'on'|'off'|'paused'; consent: Consent;
  created_at: number; updated_at: number; node_index: number; total_steps: number;
  messages: Message[]; records: {node_id: string; status: string; hints:number}[];
  current_node: {id:string;title:string;kind:'question'|'feeling';prompt:string;code:string};
  camera_alerts?:CameraAlert[]; pending: boolean; hint_level: number; ready: boolean; exposed: boolean; protected: boolean;
  episode: null|{id:string;question_key:string;reason:string;kind?:'waiting'|'difficulty'|'cognitive_load'|'fatigue'|'general';title?:string|null;created_at:number;expires_at:number|null;text:string|null};
};
export type Bootstrap = {tasks: Task[]; sessions: LearningSession[]; capabilities: {ai_configured:boolean;camera:boolean;visual_signals:boolean;visual_analysis:boolean;acoustic_emotion:boolean;voice_input:boolean;research:boolean}};
export type AIConnection = {provider:'none'|'openai'|'deeptutor';base_url:string;model:string;has_api_key:boolean;timeout_seconds:number;configured:boolean;load_error:boolean};
export type AIConnectionInput = {provider:'none'|'openai';base_url:string;model:string;api_key?:string;timeout_seconds:number;clear_api_key?:boolean};
export type AIConnectionTest = {ok:boolean;latency_ms:number;message:string};
export type DialogueEvent = 'message'|'open'|'hint'|'answer'|'continue'|'skip';
export type Action = 'open'|'hint'|'answer'|'continue'|'skip'|'think'|'reject'|'pause'|'resume'|'end'|'correct'|'consent'|'suspend';

export type SessionTitle = {id:string;title:string;title_version:number};

export type StreamEvent=DialogueEvent|'correct';
