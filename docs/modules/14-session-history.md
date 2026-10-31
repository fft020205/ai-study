# 14 · 历史记录名称与删除

## 职责与文件

历史管理只修改记录显示元数据，不改变课程task_id、课程事实、练习、视觉校准或AI请求。无额外依赖或环境开关。

- features/history/HistoryList.tsx：每条历史独立的打开按钮与更多菜单；菜单通过portal放在body，避免被侧栏滚动区域裁切。
- SessionHistoryDialog.tsx：重命名/删除弹窗、输入、保存状态与错误；复用现有Dialog/Button。
- sessionMetadata.ts：教学版本和名称版本独立合并，避免迟到的AI/心跳响应把新名字覆盖。
- app/page.tsx：编排当前记录与历史列表；删除成功后标记已删除ID，拒绝迟到结果重新加入列表。
- study/contracts.py、main.py：名称验证与受保护API。
- study/history_names.py：课程名称与自动序号格式，独立于教学提示词。
- study/storage.py：session_titles 名称元数据、history_title_counters 编号与旧记录补齐；learning.py：公共名称投影。

## 接口与存储

PATCH /api/sessions/{sid}，请求JSON为{"title":"我的变量笔记"}；响应为{"id":"…","title":"我的变量笔记","title_version":1}。要求现有Cookie归属、X-Study-Client和允许的Origin。名称去首尾空格，长度1–80，不允许换行和控制字符；额外字段422，越权/不存在404，来源无效403。不会调用模型。

session_titles 保存 id、title、version。新记录自动持久化“平均数01”“平均数02”等显示名，title_version=0；第一次实际改名升到1，之后独立递增，相同名称重复保存不加版本。重命名不提升教学 version、不修改 updated_at、不重排历史，也不取消 pending/视觉 run。create/get/list/public session/export 使用同一名称；课程语义仍来自 task_id。

教学save排除临时合并的custom_title/title_version，因此旧生成结果无法覆盖元数据。前端mergeSession同时比较两种版本，内容可更新但名称不回滚；独立rename响应也不会覆盖对话、草稿或当前选择。

DELETE /api/sessions/{sid}沿用现有归属与取消协议，同一数据库事务删除名称和会话；之后取消AI、视觉run及活动缓存。点击菜单“删除”只打开确认弹窗，确认后才发请求。删除其他历史不影响当前学习；删除当前记录回任务页并清除其草稿。错误保留弹窗并显示，可重试。删除仅覆盖本产品本地记录。

## 自动编号与旧记录兼容

history_title_counters 以 owner、task_id 为复合主键保存已分配序号，SQLite/PostgreSQL 用数据库原子 upsert/returning 递增。每个访客、每门课程独立编号，格式由 history_names.numbered_history_title 维护，至少两位，超过99自然继续到100。自动名称若撞到当前访客手动写过的同名记录，会跳过该序号；用户仍可自主重命名。

首次接入这版时，Repository 初始化在单个事务内按 created_at、id 为已有记录建立编号，给缺少元数据的默认记录补名；已有手动名称及其 title_version 保留。之后启动不会重排或重编号。只增名称表/编号表及相应元数据，不更新旧 learning_sessions.state、教学版本、消息、进度或授权。教学保存仍排除临时名称字段。

删除记录在原事务中删除其名称元数据和学习记录，编号计数不回退；因此删除“平均数02”后，下次继续“平均数03”，已有“平均数01”不变。计数器只保存访客归属、课程和整数，不保存已删除的对话或名称。跨访客序号隔离，不通过编号推测其他访客记录。数据库是已有 SQLite 的原地增表，不清空 data，不需要用户重装。

## 界面与断点

复用Figma侧栏、字体、边框、圆角和中性背景。≥1200完整侧栏中更多按钮在每行右侧；768–1199保留64px图标轨道，更多按钮位于书本图标下方，防止与打开入口重叠；≤767手机抽屉中更多按钮为44px。没有新增断点。

菜单有重命名/删除、外侧点击/滚动关闭、Escape返回触发按钮、方向键/Home/End移动焦点；弹窗沿用焦点约束。标题长时省略，title属性和无障碍名称保留完整名称。菜单坐标夹取到当前视口内，不随记录内容撑宽侧栏。

## 修改与验证

改菜单和断点：HistoryList与styles.css；改输入和错误：SessionHistoryDialog；改元数据持久化：storage与名称合同；不要把名称写进课程scope或教学状态。

npm test 覆盖归属/CSRF、无效名称、重启保留、导出、同名幂等、结束后重命名、删除元数据、生成期间改名不取消、按课程/访客编号、手动名称碰撞、旧记录补号且学习状态不变、并发创建唯一，以及前端迟到响应合并。npm run build验证最终打包。浏览器核对完整/图标侧栏和360px手机：菜单、保存刷新、删除确认/取消、当前/非当前记录、长名称与键盘。自动化只使用临时数据库/测试记录；tests/conftest.py 将导入 main 时的默认 app 指向内存库，避免测试触发真实库的启动补号。正式重启时才对实际旧默认名称执行已授权的补号。

当前单API worker和匿名Cookie归属限制不变。单次新建编号已使用原子 upsert；PostgreSQL 路径及多服务并发启动时的旧记录补齐仍未实测，生产部署应使用正式迁移和初始化锁，不把本地原型当生产账户系统。

## 更多按钮尺寸修订（2026-10-30）

按用户标注，文字“•••”改为16×16 SVG，去掉文字字距和浏览器默认按钮padding造成的溢出。完整侧栏按钮32×32、padding8；768–1199图标栏按钮28×28、padding6，三点始终居中。hover/展开背景使用subtle token，图标与背景之间保留均匀留白。图标栏打开按钮36px高，更多按钮与其纵向区域不重叠，每条总高由72减为64px、条目间距由8减为6px；完整侧栏与手机44px触控区域继续沿用原断点。

该修改仅涉及图标和CSS，无API、名称持久化或删除协议变动。验证使用类型检查、生产构建及1144px/360px浏览器布局，不新增镜像样式的单测。

正式补号前已通过 SQLite backup 保存原库快照（本次位于系统临时目录 ai-study-before-numbered-titles-3nubh158/study.db，权限600）。补号只增表和名称元数据，旧版代码仍能读取现有 session_titles；回退代码无需重建或清空学习数据库。具体正式迁移后的学习状态逐行核对结果见 docs/VERIFICATION.md。
