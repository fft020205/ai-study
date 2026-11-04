# 15 · 即时发送、流式回复与按需支持

## 当前行为

点击发送后，输入立即清空、用户消息先显示在对话内，服务器确认接收后显示思考动画。模型正文随着真实上游数据到达逐步展示；完整结构和课程约束通过后，正式保存助手消息。期间输入的新草稿不会在旧回复完成时清除。用户短消息按内容宽度收缩，长消息沿用桌面68%/手机90%最大宽度及自动换行。

普通回复不附带固定提示动作或旧的继续/示范/换例子按钮组。经过门控的自适应支持卡保留“我还在思考 / 需要一点帮助 / 暂时不用”；“纠正我的理解”卡片按钮已删除。输入栏的手动“给我一点提示”入口仍保留，用户也可直接用文字要求提示、示范或换例子。

## 文件与职责

| 文件 | 职责 |
|---|---|
| study/main.py | 接收、保存、幂等、SSE事件、提交前版本与取消检查 |
| study/stream_protocol.py | SSE上游帧、JSON顶层reply增量解码；不下发私有字段 |
| study/stream_response.py | ASGI响应关闭时可靠取消任务并清理pending |
| study/ai.py | OpenAI/DeepTutor真实流式适配，内部评估与最终结构校验 |
| study/learning.py | 已接收的用户消息不再次追加；正式提交教学结果 |
| lib/turnStream.ts | fetch流、UTF-8/CRLF分包、事件校验、截断识别 |
| features/learning/activeTurn.ts | 本地发送/接收状态、用户消息去重 |
| app/page.tsx | 立即清空草稿、临时回复、重试、切换与取消 |
| Conversation.tsx / styles.css | 思考点动画、增量Markdown、提示卡与气泡宽度 |
| study/support.py / policy.py | 有效理解困难、负荷、疲劳或30秒等待的门控与状态稳定刷新 |

## HTTP / SSE合同

POST /api/sessions/{sid}/turns/stream，使用现有Cookie归属和X-Study-Client: web-v1，允许的Origin。请求JSON与旧turns基本相同：

```json
{"event":"message","text":"你好","version":3,"request_id":"客户端稳定UUID"}
```

event允许message/open/hint/answer/continue/skip/correct，correct需要text。Content-Type: application/json，Accept: text/event-stream。响应为UTF-8 SSE，事件名在event行，data为JSON：

| 事件 | data字段与意义 |
|---|---|
| accepted | request_id、session、message_id；用户文字已保存在后端，pending=true |
| status | request_id、phase=thinking；正在内部评估/等待生成 |
| delta | request_id、text；仅用户可见正文的真实增量 |
| complete | request_id、session；整轮验证与提交完成，替换临时正文 |
| error | request_id、detail、status；回复失败或取消，不能当成功消息保存 |

每个事件以空行结束；约10秒无事件发送keep-alive注释。前置校验失败仍是普通JSON HTTP错误：未配置503、越权404、版本/正在生成409、格式422、来源403。流开始后失败以error结束。断流但没有complete不是成功，客户端必须提示重试。

旧POST /turns与教学controls保留完整JSON返回，供既有调用者使用。页面的开场、普通文字、手动提示等生成动作以及纠正改走流式入口。重复成功request_id只回complete，不再次调用模型。

## 接收、幂等与数据

普通文字先写入messages，再开始模型评估，不再等待AI完成才保存。每条新消息有request_id；submitted_requests保存最近100个请求的指纹与message_id，失败后用同ID重试不会重复追加用户消息。相同ID不同内容409；讨论已继续后不能重试旧的未完成问题。当前手动生成期间拒绝另一普通并发发送，主动支持可被新文字抢占。

该轮已接收文字从本次模型history里去掉，只通过student_text提供一次。commit_dialogue(record_user=false)避免完成时二次追加。新的请求元数据在JSON状态中惰性新增，无数据库表迁移；旧消息没有request_id仍能读取。

模型失败时已接收用户消息保留，partial助手正文撤下；用原request_id重新生成。消息尚未被接收时显示“消息未发送”和重试入口，文字仍保存在当前对话的本地发送状态中。刷新会清除未接收的本地状态，不承诺离线发件箱。新的输入草稿不会被重试或旧回复完成覆盖。

纠正先写入真实用户纠正与保护状态再生成；没有AI时仍可保存纠正并完成控制，不产生假回复。文字中的暂停/结束等意图仍需内部评估识别，页面控制按钮可直接取消。

## 真实上游流与字段隔离

Provider.complete_json继续用于内部评估；支持流的Provider增加stream_json(system,payload)异步迭代器。OpenAI兼容POST /chat/completions带stream=true和response_format=json_object，按SSE delta.content读取，忽略reasoning_content/usage等非正文信息；完成标志或有效finish_reason必需，长度截断和上游错误明确失败。流式调用受AI_TIMEOUT_SECONDS总时长约束。DeepTutor沿用实际content帧和seq去重，保留取消协议。

TeachingService.respond(...,visual_snapshot,on_delta)刷新评估前与生成前的视觉快照，再将top-level reply字符串的可解码增量交给on_delta。原始JSON、exercise.reference/rubric、视觉解释的内部JSON及推理字段不发给页面。中文、换行、引号、跨包Unicode和代理对正确解码；重复reply字段、超长正文与无效结构失败。提示要求reply在前，但服务商仍可能较晚开始输出该字段。

最终完整DialogueReply仍检查课程focus、示范许可、支持邀请范围等；练习的自然改写不再被字面校验拒绝，可选练习元数据缺失可降级为普通说明；流中的文字属于临时显示，不能提前写成正式助手消息。结构校验不能保证语义绝对准确，真实模型效果仍需评估。

缺少stream_json的自定义Provider只能在整轮完成后一次返回正文，不用定时器伪造逐字输出；当前两个正式适配器均支持实际流。若服务商忽略stream参数返回普通JSON，会明确报兼容性错误，不伪装成流。密钥、上游错误正文不进入事件或浏览器。

## 取消与资源生命周期

每次delta发送仍检查owner/session教学版本或本轮已提交版本，暂停、结束、撤权、删除与新请求优先；迟到结果不能覆盖状态。浏览器切换视图会abort流并清空临时正文；已接收用户消息由后端保留。消息完成时用最终session去重替换临时消息。

SSE生成器与ManagedStreamResponse共同清理：HTTP响应开始迭代才启动模型；连接关闭、ASGI中间件提前结束或控制取消均停止后台任务并清除本轮pending，保留其他新版本。队列有32帧上限，错误/取消时丢弃未发送旧增量。不能只依靠React卸载或按钮disabled来取消模型。

视觉WS与流式对话并行，原有run、校准、有效性和LLM独立判断链路保留。流式显示不会逐帧额外调用LLM，也不改变视觉特征的隐私边界。

## 主动提示条件

必须active、support已授权且开启，已至少有一次完成的助手回复，无pending、保护或已有提示，当前版本一致、前台、无草稿/输入法组合/生成/阅读。满足以下任一才考虑支持：

1. 有效明确自述 cognitive_load=high / fatigue=present，当前有依据的 cognition=difficulty，或完成校准且当前有效的 visual support_hint=possible_overload/possible_fatigue。
2. 连续30秒有效等待；最长心跳间隔8秒，输入、阅读、后台或断线重置。

重复答错、压力、未知/过期状态或任意普通回复不直接触发。整次学习不设总次数，首次生成/重写共享每轮最多3次不同状态额度，同状态去重；用户拒绝/思考保护仍先执行；等待不代表认知负荷被测出。无待作答练习的课内自由对话也可在等待后支持。历史support_error_threshold环境项保留兼容但不再控制触发。

浏览器每2秒上报布尔心跳，回复完成、编辑和用户主动滚动有5秒阅读缓冲，程序自动跟随不会重置等待，所以提示不会精确卡在30秒墙钟时刻。尚未显示的支持生成仍可被输入、阅读、后台或普通消息抢占。已显示卡片的 expires_at=null，不再因输入/输入法、阅读、后台、busy、普通发送或回复成功/失败而隐藏，也没有30秒自动期限；旧数字期限兼容为保留。用户操作卡片、显式教学动作、暂停、结束和同意设置控制才清除。卡片未处理时不重复触发支持；保留邀请不等于旧状态仍有效，详见模块05。满足条件后仍需真实模型生成邀请，失败不插入备用文案。

## 运行、验证与限制

不需要新增密钥、环境变量或依赖安装。运行npm test、npm run build。反向代理需支持SSE、关闭缓冲/缓存及压缩等待，保留text/event-stream；产品返回X-Accel-Buffering:no和Cache-Control:no-store,no-transform。Next rewrite已用于实际本地流式联调；部署环境需分别检查首字节与增量到达时间。

test_streaming.py覆盖实际上游SSE读取、私有字段/推理隔离、Unicode、截断、已接收消息、幂等重试、取消、浏览器断开、最终无效结构不入库与纠正。前端测试覆盖UTF-8/CRLF跨包、无complete报错、请求/会话匹配和乐观消息去重。policy测试覆盖负荷/疲劳、30秒连续等待和所有阻断；test_support_retention.py 与 Conversation.test.tsx 覆盖输入和生成期间的卡片保留、旧期限兼容与明确操作清除。

浏览器联调仅用独立临时数据库和明确标注的测试Provider，不能将其截图当作真实教学质量验证。真实第三方API的SSE格式兼容、延迟、计费与模型语义尚需按实际服务商验收。当前不提供token级断点续传、离线消息队列或多worker部署。

支持卡更新仍通过 activity 后台通道完成，不改普通消息SSE。新状态稳定6秒后可重写，没有90秒冷却或新状态30秒间隔；首次生成/重写共同遵守每轮3次不同状态额度。正常回复提交后以dialogue_turn进入新轮；自动卡片不推进轮次。输入取消未完成重写但保留已显示卡片，失败重试只对同状态保留30秒退避。完整表达、去重、计分与配置见模块05。

摄像头模式需先完成准备再请求开场或新消息，校准前SSE入口409且不接受普通文字。已开始的流若因视觉 run 丢失而被准备页接管，会终止暂存正文、保留用户文字/request_id/acceptedId，完成准备后提供同ID重试；不会删除已接收消息或重复写入。前端不在准备页渲染输入栏，后台支持也不计等待时间。详见模块16。

## 流式语言偏好（2026-11-04）

SSE请求新增可选language，UI总是发送当前en/zh-CN偏好；服务端固定本轮语言，两阶段调用一致。流进行时UI切换不会通过心跳提升版本或打断正文，下一次请求采用新语言；已完成request_id仍回放原结果，不因语言变化重复调用模型。详情见[模块17](17-dialogue-language.md)。
