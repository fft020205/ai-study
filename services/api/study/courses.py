"""Topic boundaries and learning goals, not dialogue scripts or ordered lessons."""
DIALOGUE_VERSION = 'course-dialogue-v1'
COURSES = {
 'variable': {
  'title':'编程变量', 'scope':'Python 中数值变量的赋值、复制、更新、旧值保存和交换；使用简单顺序代码。',
  'objectives':[
   {'id':'copy','title':'赋值与复制','knowledge':'赋值先计算右侧再写入左侧；数值复制后分别更新，不会自动同步。'},
   {'id':'overwrite','title':'追踪旧值','knowledge':'顺序赋值读取执行时的当前值；覆盖且未保存的旧值无法从新值恢复。'},
   {'id':'swap','title':'暂存与迁移','knowledge':'交换可在覆盖前暂存旧值；可用库存等情境检验迁移，不把看过示范当独立完成。'}],
  'misconceptions':['copy_link','overwritten_old_value','save_too_late']},
 'mean': {
  'title':'平均数','scope':'算术平均数、按人数加权、均值与中位数的代表性、汇总信息的边界；允许计算器。',
  'objectives':[
   {'id':'weighted','title':'按人数加权','knowledge':'总均值=各组人数乘组均值的总和/总人数；人数相同时才能直接平均组均值。'},
   {'id':'typical','title':'理解代表性','knowledge':'极端值影响均值；中位数可能更贴近多数，但不同指标回答不同问题，不能随意删数据。'},
   {'id':'limits','title':'汇总信息的边界','knowledge':'仅有各组人数和均值一般不能唯一还原逐人记录或中位数。'}],
  'misconceptions':['unweighted_group_mean','median_always_better','aggregate_reconstructs_individuals']},
 'causality': {
  'title':'相关与因果','scope':'观察性相关、共同原因与反向因果、比较方案、随机分配及因果结论的边界。',
  'objectives':[
   {'id':'alternatives','title':'寻找替代解释','knowledge':'相关不能单独证明因果；原有差异、共同原因和反向因果都可能产生相关。'},
   {'id':'comparison','title':'改进比较','knowledge':'随机分配有助于控制混杂；匹配已知条件仍可能遗漏混杂，不能承诺消除一切偏差。'},
   {'id':'limits','title':'限定结论','knowledge':'结论应限于研究对象、干预和观测结果；补充证据后再调整因果判断。'}],
  'misconceptions':['correlation_is_causation','reverse_direction','matching_proves_causation']}
}

def course_for(s): return COURSES[s['task_id']]
def focus_for(s):
    c=course_for(s)
    return next((o for o in c['objectives'] if o['id']==s.get('focus_id')), c['objectives'][0])
