import type {LearningSession} from '@/lib/types';
import {Button} from '@/components/ui';
export function SessionSummary({session,onHome,onPrivacy}:{session:LearningSession;onHome:()=>void;onPrivacy:()=>void}){
  const completed=session.records.filter(r=>r.status.startsWith('completed'));
  return <section className="content-page summary-page" data-design-node="5:68"><div className="readable stack-20"><p className="eyebrow">本次学习已结束</p><h1>今天，向前走了一小步</h1><p className="muted small">{session.title} · 摄像头与主动支持已停止。</p><div className="summary-card"><strong>你练习了什么</strong><p>本次围绕「{session.title}」展开交流，最近讨论「{session.current_node.title}」。</p><p>{completed.length?`完成了 ${completed.length} 道有作答证据的练习，其中 ${completed.filter(r=>r.status==='completed_independently').length} 道未使用解题提示。`:'本次暂无已核对完成的练习；你仍可从历史记录回看交流内容。'}</p><p className="caption muted">这次完成情况只反映本次练习，不代表已经完全掌握。</p></div><div className="actions"><Button variant="primary" onClick={onHome}>返回任务</Button><a className="button ghost" href={`/api/sessions/${session.id}/export`} download={`study-${session.id}.json`}>导出本次记录</a></div><button className="text-button muted" onClick={onPrivacy}>查看本次数据与删除方式</button></div></section>;
}
