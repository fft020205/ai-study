"""Versioned server-only curriculum. Public projections never expose rubrics/answers."""
CONTENT_VERSION = 'prd-v0.3-mvp.1'

def question(id, title, prompt, rubric, hints, answer, *, code='', misconception='', parallel=None):
    return dict(id=id, title=title, kind='question', prompt=prompt, code=code, rubric=rubric,
                hints=hints, answer=answer, misconception=misconception or id, parallel=parallel)

def feeling(id):
    return dict(id=id, title='说说当前感受', kind='feeling', prompt='到这一步，你可以用自己的话说说当前感受，也可以直接继续、要提示或略过。', code='', rubric='', hints=[], answer='', misconception='', parallel=None)

TASKS = {
 'variable': dict(id='variable', title='编程变量', subtitle='追踪旧值，修复交换', icon='code', nodes=[
  question('V1','数值复制','赋值会先计算等号右边，再把结果写进左边。复制一个数，不会让两个变量永久联动。看看下面的程序，最后 b 是多少？请说一句理由。',
   'b=4，复制第二行时 a 的值。仅写4属于理由不足。只有明确认为 b 自动变为7才判 copy_link。',
   ['找最后一次写 b 的那行。','b=a 执行时 a 还是 4，之后只更新 a。'], 'b=4。第二行复制当时 a 的值，第三行只改 a，不会同步修改 b。',
   code='a = 4\nb = a\na = 7', misconception='variable.copy_link',
   parallel=dict(prompt='换一组数，最后 y 是多少？请说明理由。',code='x = 6\ny = x\nx = 2',rubric='y=6，x后续更新不会联动y。',answer='y=6，复制后分别更新。')),
  question('V2','预测结果','有人想让 a 和 b 交换，写了下面的程序。先不修改，请给出结束时两个变量的实际值，并解释最后一行读到哪个 a。',
   'a=7,b=7，最后读到更新后的a。只有明确沿用旧a=4才是 overwritten_old_value。',
   ['先停在 a=b 执行后。','这一步后 a 和 b 都是 7，再看最后一行能取到哪个值。'], 'a=7、b=7。第三行覆盖了旧 a=4；最后一行读的是新的 a=7。',
   code='a = 4\nb = 7\na = b\nb = a',misconception='variable.overwritten_old_value',
   parallel=dict(prompt='换成 x 和 y，请预测最终结果并解释。',code='x = 3\ny = 9\nx = y\ny = x',rubric='x=9,y=9，旧x被覆盖，最后读取新x。',answer='x=9、y=9。旧 x=3 已被覆盖。')),
  feeling('V3'),
  question('V4','核对旧值','接下来只看 a=b 执行后，原来的 4 还保存在哪里？如果已经知道问题，可以直接继续修复。',
   '这段程序没有保存旧a，已丢失/覆盖。', ['看看有没有第三个保存位置。','a 被新值覆盖后，只剩下两个相同的新值。'], '原来的 4 没有保存；需要在覆盖前另存旧值。',
   parallel=dict(prompt='如果把一张写着旧数值的纸擦掉，其他位置也没有记录，还能从新数值恢复旧数值吗？',code='',rubric='不能，信息未保存，无法恢复。',answer='不能，旧信息已没有记录。')),
  question('V5','暂存与修复','可以新增 temp 暂存一个数，每次只做一条赋值。你会怎样改写交换部分，让最后 a=7、b=4？请解释保存时点。',
   'temp=a;a=b;b=temp 或等效逐条赋值，解释旧值在覆盖前保存。同时赋值有效但需请按逐条要求解释，insufficient。',
   ['哪一个旧值稍后还要用？','先保存旧 a，再更新 a，最后从保存位置取回旧值。'], 'temp = a\na = b\nb = temp\n先存旧 a，再覆盖 a，最后把暂存值赋给 b。',
   parallel=dict(prompt='将 x=2、y=8 交换，用 hold 暂存。请写出逐条赋值并解释。',code='',rubric='hold=x;x=y;y=hold 或等效，覆盖前保存。',answer='hold=x; x=y; y=hold。覆盖前保存旧 x。')),
  question('V6','库存迁移','请独立判断这段库存程序：最后 stock 和 backup 各是多少？它们会一直相同吗？',
   'stock=5,backup=9，复制后分别更新，不自动同步。', ['分别找出最后一次更新 stock 和 backup 的语句。','backup 保存的是最初的8；两条更新针对不同变量。'], 'stock=5、backup=9。复制后分别更新，不会自动同步。',
   code='stock = 8\nbackup = stock\nstock = stock - 3\nbackup = backup + 1',
   parallel=dict(prompt='请判断最后 current 与 saved 的值，并说明它们是否联动。',code='current = 12\nsaved = current\ncurrent = current - 5\nsaved = saved + 2',rubric='current=7,saved=14，分别更新不联动。',answer='current=7、saved=14，分别更新。'))
 ]),
 'mean': dict(id='mean',title='平均数',subtitle='按人数加权，判断代表性',icon='chart',nodes=[
  question('M1','确定计算对象','平均等待时间是所有人的等待分钟数之和，除以总人数。A 时段 2 人，平均等 10 分钟；B 时段 8 人，平均等 20 分钟。整体能直接算成 (10+20)÷2=15 吗？请说明理由。',
   '不能，两组人数不同，需按人数加权。仅不能理由不足。', ['每一组代表的人数一样吗？','整体平均要让每个人拥有相同权重。'], '不能。两组人数不同，两个时段不能直接等权平均。',misconception='mean.unweighted_group_mean',
   parallel=dict(prompt='甲组1人均值6，乙组3人均值10，能直接平均两个组的均值吗？为什么？',code='',rubric='不能，两组人数不同需要按人数加权。',answer='不能，要按1和3的人数加权。')),
  question('M2','还原总量','A 时段 2 人平均等 10 分钟，B 时段 8 人平均等 20 分钟。请写出全天平均等待的算式和结果，可以用计算器。重点是分子、分母各代表什么。',
   '(2*10+8*20)/(2+8)=18分钟，分子180累计等待分钟数，分母10人数；仅算错不能判权重误区。', ['分母是时段个数，还是顾客人数？','两组总等待分别是20和160分钟，人数共10。'], '(2×10+8×20)÷(2+8)=18 分钟。180 是累计等待分钟数，10 是总人数。',misconception='mean.unweighted_group_mean',
   parallel=dict(prompt='甲组3人平均8分钟，乙组1人平均16分钟。整体平均多少？分母表示什么？',code='',rubric='10分钟，(3*8+1*16)/4，分母总人数4。',answer='10分钟，(24+16)/4，分母是4人。')),
  feeling('M3'),
  question('M4','算法的适用条件','如果两组平均数仍是 10 和 20，什么时候可以直接平均两个均值？',
   '两组人数相同，组权重相同。', ['想一想两个组的权重。','人数一样时，各组对整体的影响相同。'], '两组人数相同时，可以直接平均两个组均值。',
   parallel=dict(prompt='两个班均分分别70和90。什么条件下可以直接得到整体均分80？',code='',rubric='两个班人数相同。',answer='两个班人数相同。')),
  question('M5','典型体验','逐人记录是 8、9、10、11、62 分钟。中位数是排序后居中的数。如果想描述更贴近多数人的典型等待，你会选哪个指标，并怎样解释？',
   '中位数10更贴近多数；均值20受62影响，不能声称中位数永远更好或随意删62。', ['多数记录集中在哪里？','区分居中位置和总量÷人数描述的目标。'], '中位数10更贴近多数记录；均值20受到62影响。若报告总体平均，均值仍有用途，不能随意删除62。',
   parallel=dict(prompt='记录为 4、5、6、7、48。描述多数人的典型等待，你会报告什么，为什么？',code='',rubric='中位数6，多数靠近6，均值14受48影响，不能一概认为均值没用。',answer='中位数6更贴近多数；均值14受48影响。')),
  question('M6','汇总边界迁移','新报告只有 A 组 3 人平均 12 分钟、B 组 1 人平均 36 分钟。有人写“整体均值和中位数都是24”。请改成有依据的表述，可以指出哪些值还不知道。',
   '均值18，仅凭组人数和均值无法唯一确定个体中位数，需要个体记录。', ['先把组均值还原为总量。','中位数依赖逐人的排序，仅有组均值能还原每个人吗？'], '整体均值18；中位数不能由这份汇总唯一确定，需要个体记录。',
   parallel=dict(prompt='甲组2人均值10，乙组2人均值20。整体均值是多少？能唯一确定中位数吗？',code='',rubric='均值15；不能唯一确定中位数，需要逐人数据。',answer='均值15；中位数未知，需要逐人数据。'))
 ]),
 'causality': dict(id='causality',title='相关与因果',subtitle='寻找替代解释，改进比较',icon='link',nodes=[
  question('C1','观察差异','成年人自行选择是否用学习 App，一周后使用者平均80分、未使用者70分。宣传语写“App让学习者提高了10分”。这些信息足以支持宣传语吗？请说明理由。',
   '不足，组间差异非净效果，须具体原有基础/动机/投入路径，仅口号不足。', ['两组本来是否可比？','选择使用 App 的人，还可能在什么方面不同？'], '不足。基础、动机或投入可能同时影响App选择与成绩，观察差异不等于净效果。',misconception='causality.association_as_effect',
   parallel=dict(prompt='常去图书馆的人分数较高，可以直接说去图书馆导致分数提高吗？给一个替代解释。',code='',rubric='不能直接判断；学习动机或投入同时影响去图书馆和分数。',answer='不能；动机可能同时影响去图书馆与学习投入。')),
  question('C2','竞争解释','补充信息是，两组最近一次前测分数接近。仅凭这一点，就能断定后来的差异全由 App 造成吗？请给出一个还没有排除的解释。',
   '仍不足；具体因素同时影响选择和学习结果，如动机→使用App和额外复习→后测。前测证据有价值但不控制所有因素。', ['前测相近是否也代表后来学习时间相同？','选一个因素，讲清它如何影响是否用 App 与最终分数。'], '仍不足。动机可影响是否用App，也影响额外复习和后测；前测接近有帮助但没排除这些路径。',
   parallel=dict(prompt='两组原有成绩相近，自愿参加辅导的一组后来更好。还可能有哪些不同影响结果？',code='',rubric='动机或课外投入同时影响参加和结果，未被前测排除。',answer='动机可能影响自愿参加和额外学习投入。')),
  feeling('C3'),
  question('C4','改进比较','如果能重新组织活动，你会怎样分组，让是否用 App 不由学习者原有动机直接决定？',
   '在同意者中随机/抽签分配，尽量同内容时长测验；合理匹配并说明剩余混杂也接受。随机不保证小样本完全一样。', ['如何避免大家按原有偏好选择组别？','可以考虑抽签，并让其他学习条件尽量一致。'], '在同意参加者中随机分组，并尽量保持学习内容、时长和测验一致。随机分组减少系统性选择差异。',
   parallel=dict(prompt='比较两种练习方式时，怎样安排参与者更公平？请解释作用。',code='',rubric='同意者随机分配，学习材料测验一致，减少选择差异。',answer='随机分配并统一条件，减少系统性的选择差异。')),
  question('C5','限定结论','同意参加者被随机分组，每组20人，前测均值都60，完成同一后测：App组均值76、原方式组72。请用有依据的一句话替换“App让每个人提高4分”。',
   '条件可比下更支持平均收益约4，不保证人人4；不能仅均值人数推显著；16不是净效果。', ['组平均差异能代表每个人吗？','区分平均效果、个体效果与App组自身前后变化。'], '在实施条件可比的前提下，更支持平均收益约4分；不代表每个人都提高4分，也不能仅凭均值判断统计显著性。',
   parallel=dict(prompt='随机比较中，一组均值85另一组82。能说每个人都获益3分吗？怎样更准确表达？',code='',rubric='不能；条件可比下平均收益约3，个体可不同，统计显著性未知。',answer='平均差异3分，不代表每个人都提高3分。')),
  question('C6','求助案例迁移','平台观察到，向 AI 求助次数多的学习者分数更低，想限制求助来提高分数。请给出一个其他解释，并说一种更有说服力的比较办法。',
   '原有困难同时引起求助多和分数低；随机提供额外答疑并保留必要基本支持，或匹配且说明未测量差异局限。', ['什么原因可能同时影响求助次数与分数？','比较时控制基础与材料，保留所有人的必要支持。'], '原有困难可能导致更多求助与较低分数。可随机提供额外答疑并统一材料测验、保留所有人的基本支持；不能直接断定求助有害。',
   parallel=dict(prompt='补课多的人分数偏低，能直接证明补课有害吗？给替代解释和改进比较的方法。',code='',rubric='原有困难影响补课与分数；随机提供额外辅导或匹配说明局限。',answer='原有困难是替代解释；可随机提供额外辅导并保留基本支持。'))
 ])
}

def current_node(s):
    node = dict(TASKS[s['task_id']]['nodes'][s['node_index']])
    if s.get('parallel') and node['parallel']:
        node.update(node['parallel']); node['id'] += '-parallel'; node['title'] += ' · 换题复核'
        # Original hints may contain numbers from the exposed question.
        node['hints'] = ['先独立梳理题目中的已知条件。','把你的推理拆成一个步骤，再写出这一小步。']
    return node

def public_node(s):
    n = current_node(s)
    return {k:n[k] for k in ('id','title','kind','prompt','code')}

def task_catalog():
    from .courses import COURSES, DIALOGUE_VERSION
    return [{k:v for k,v in t.items() if k != 'nodes'} | {'steps':len(COURSES[t['id']]['objectives']), 'content_version':DIALOGUE_VERSION} for t in TASKS.values()]
