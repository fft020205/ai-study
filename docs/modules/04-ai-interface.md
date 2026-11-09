# 04 · 第三方 AI 与 DeepTutor 适配

## 模块入口

`study/ai.py` 定义 Provider、OpenAIProvider、DeepTutorProvider 和 TeachingService。`contracts.py` 定义严格的内部结构；`dialogue.py` 负责可读上下文与证据策略。页面只调用产品 API，不接触密钥。

```python
class Provider(Protocol):
    configured: bool
    async def complete_json(self, system: str, payload: dict) -> dict: ...
```

OpenAI 兼容接口：`POST {base_url}/chat/completions`，服务端 Bearer key，messages 为 system 规则和 user JSON 数据，response_format 为 json_object。模型需要按 payload.output_schema 输出结构；并非只返回一个 reply 字符串。地址、密钥和模型名通过页面 `/settings/ai` 配置，见模块11。

## 每轮调用

可见回复的系统角色是“AI 学习智能伴侣”，统一配置在 `REPLY_SYSTEM`，OpenAI 与 DeepTutor 的普通/流式生成共用此定义；内部评价器保持独立。角色与语气的修改入口及验证边界见模块12。

- 开场、按钮提示/示范/继续/换例子：1次生成。
- 提交文字或纠正：先1次内部评估，再1次生成；明确结束/暂停/拒绝意图执行控制，不再生成追问。
- 经授权且通过门控的主动支持：每次初次生成或有效状态更新各1次；稳定窗口与刷新间隔见模块05。
- 保存设置不调用模型；连接测试会调用1次模型。

TeachingService.respond(session, text, event, visual_snapshot=None, on_delta=None, before_request=None) 返回 `(assessment, reply, state)`；明确控制意图的 reply 为 None，由产品层执行实际控制。成本与延迟取决于模型。页面SSE调用使用真实Provider.stream_json增量，内部评估仍是一次JSON调用；旧HTTP JSON入口保留。

## 输入与输出隔离

评估器读取当前私有 exercise、课程范围、近期可见对话和本轮文字。输出 TurnAssessment：evaluation、intent/intent_quote、correction_quote、cognition/valence/pressure、fatigue/cognitive_load自述及逐字证据。没有可评价练习或证据不能给可靠对错结论。

生成器读取课程事实、最近24条且不超过20000字符的完整消息、当前公开问题、核对结果、有效状态和响应策略。普通生成不读取旧题库、未来题、当前参考答案和 rubric。只有用户明确请求完整示范时才投影当前 reference。

输出 DialogueReply：reply、focus_id、move、exercise_action、exercise、assistance、可选 visual_judgment 和 support_title（最多40字符，可为空）。新 exercise 的参考答案和判据由模型生成并只存服务器；前端与公共导出不含这些字段。参考格式以 contracts.py 的 JSON schema 为准。

## 无可用模型与错误

默认 none；无配置503，超时/上游错误/无效JSON/结构越界502。没有固定回复、备用台词或本地假模型。旧JSON手动失败保留草稿；新SSE保留已发送消息并提供同ID重试，不追加失败的助手回复；纠正先保存再生成，因此即使失败也保留纠正。初次主动支持失败撤销未显示占位；状态重写失败保留原卡，尝试受刷新间隔控制。

模型返回的请求正文、密钥和原始服务商错误不回显。前端按版本提交，结束/暂停/撤权可取消，迟到结果不入库。

## DeepTutor

保留 v2.0 WebSocket 适配：每次操作独立会话，capability=chat、空 tools/knowledge_bases/memory、persist_user_message=false；取消发送 cancel_turn，内容按 seq 去重。内部部署必须限制工具和访问范围。本项目没有运行 DeepTutor 本体，在线认证、LLM和工具隔离未验证。

## 修改与验证

换服务商只实现 Provider；改教学和语气读模块12，不修改网络适配。运行 `npm run test:api`：HTTP合同、错误脱敏、WebSocket请求、JSON校验、证据校验、取消与可见投影均有测试替身。

课程语义边界、引文含义、题目正确性和不泄题行为还依赖真实模型。schema/focus_id/引文子串检查不能证明语义正确；正式试用前必须人工评测离题、注入、矛盾自述及错误题目，不承诺绝对约束。

## 当前视觉状态供模型判断

视觉链路保持独立：原版CognitiveEngine每约0.5秒接收浏览器派生特征；TeachingService在每次Provider调用前通过visual_snapshot回调读取最新摘要。内部评估和可见回复都收到visual_observation，第二次调用不会沿用评分前的旧画面。无效、未校准、过期、未授权时明确标为不可用；去掉先前llm_judgment，防止把模型解释回灌成观测证据。

回复可以给出visual_judgment={state,reason}，state=possible_fatigue/possible_overload/no_concern/uncertain；不可用时强制null。它结合当前课题、历史和自述，而不是复制视觉阶段；不得声称看到表情或诊断心理状态。有效结果按run/phase/observation_epoch检查后在视觉内存流显示，最多60秒。LLM每次对话或符合门控的主动支持才调用，不逐帧请求；费用仍按真实调用计。详细合同与测试见模块13。

OpenAI适配器实际发送stream=true并读取delta.content，DeepTutor复用实际content帧；reply JSON只解码顶层可见字符串，私有练习字段和reasoning_content不下发。完整协议、大小上限、失败和服务商兼容要求见模块15，不使用假逐字定时器。

内部Evaluation新增可选reference_applicable。对server标记reference_alignment=unverified的练习，评价器比较实际可见问题和辅助资料的语义；明确适用才能给可靠判分，否则unknown。该字段不影响回复显示、不新增调用。exercise元数据缺失/多余时可降级为普通说明；不再出现“AI练习与可见问题不一致”的字面匹配拒绝，详见模块02。

## 支持卡的模型合同

event=support 时额外输入 proactive_context={kind,signals} 与 previous_support={title,text}|null，使用本轮刷新后的视觉和有效自述。模型按当前状态自然回应、表达支持并提出一个具体建议；support_title 为模型生成的标题，reply 为正文。视觉候选使用可能/迹象的含义，自述优先；waiting 不解释成疲劳，general 不沿用旧判断。支持卡允许 assistance=hint 的单步引导并记入 hint_level，完整答案和新题仍被拒绝。重写保留原卡，完成前再检查状态签名和版本。网络适配不改变，原卡正文和私有刷新证据不进入普通 SSE delta。详见模块05。

用户可见状态表达已统一精简到一句自然、暂定的疲劳/负荷/卡点描述，再接具体情感支持和建议；普通回复与支持卡共用 REPLY_SYSTEM。默认不主动列出眨眼、视线偏移、基线、阈值、CLI 等判断过程，也不重复一段方法说明。用户明确询问依据时才简洁解释；内部 visual_judgment.reason、实时输入和证据校验继续保留。只改表达，不删解决方案、不改变状态来源或视觉通信。该改动影响下一次生成，不改写已保存历史消息；真实模型是否始终遵循需实际评估。

摄像头模式的校准前置条件：API 在新模型请求开始前要求当前授权 run 已完成且基线充分，before_request 在内部评价和回复生成前再次检查。准备不足返回409，不提前出题或发起模型请求；中途失去 run 时清理 pending 并保留已接受文字供重试。camera=false 的文字学习不等待。后台支持同样门控，详见模块16。

## 模型回复语言（2026-11-04）

评估与生成payload新增 `response_language`，来自本轮服务端会话快照。评估器支持中英文并保留原文证据；共享REPLY_SYSTEM要求reply、support_title、练习自然语言和visual_judgment.reason遵循en/zh-CN偏好，课程和枚举不变。适用于普通、流式及后台支持，兼容旧记录中文回退；不额外调用翻译模型。并发与完整接口见[模块17](17-dialogue-language.md)。

## 视觉短窗数据（2026-11-09）

恢复后的有效视觉数据附带feature_window_seconds和blink_rate_estimated，不额外等一分钟才进入模型上下文。REPLY_SYSTEM明确短窗眨眼频率属于估计，结合其他当前线索及对话保持不确定，不能单凭此断言疲劳或过载；可见回复仍不展开技术过程。原逐次snapshot刷新、校准与过期检查保留。
