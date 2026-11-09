import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,expect,it} from 'vitest';
import i18n from '@/i18n';
import {VisualAnalysisStatus} from './VisualAnalysisStatus';
import type {VisualObservation} from './visualAnalysis';

afterEach(async()=>{await i18n.changeLanguage('zh-CN');});
it('shows current monitoring after quick verification and prioritizes stale footage',async()=>{
 await i18n.changeLanguage('zh-CN');
 const current:VisualObservation={available:true,status:'analyzing',calibrated:true,valid:true,baseline_quality:'adequate',feature_window_seconds:5,blink_rate_estimated:true,sampled_at:Date.now()/1000};
 const render=(observation:VisualObservation)=>renderToStaticMarkup(createElement(VisualAnalysisStatus,{connection:'connected',observation,onRetry:()=>{}}));
 expect(render(current)).toContain('监测中');
 const stale=render({...current,status:'warming_up',valid:false,sampled_at:Date.now()/1000-10});
 expect(stale).toContain('等待有效画面');expect(stale).not.toContain('监测恢复中');
});
