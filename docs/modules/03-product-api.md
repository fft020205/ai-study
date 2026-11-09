# 03 · 产品 API

## 文件与入口

FastAPI：`services/api/study/main.py`，输入模型：`contracts.py`。页面经 Next rewrite 访问同域 `/api`；默认 Python 端口18000，仅本机可访问。

交互合同：<http://127.0.0.1:18000/docs>；静态快照 `docs/api/openapi.json`。调用方需携带 Cookie，所有修改请求需 `X-Study-Client: web-v1`。允许 Origin 由 ALLOWED_ORIGINS 明确配置。

| 方法与路径 | 用途 |
|---|---|
| GET /api/bootstrap | 题目目录、当前访客历史、能力开关 |
| POST /api/sessions | task_id 与 consent 创建新会话 |
| GET /api/sessions/{id} | 当前可见状态 |
| PATCH /api/sessions/{id} | title重命名，返回id/title/title_version；不修改教学版本 |
| POST /api/sessions/{id}/turns/stream | 即时接收与SSE增量，支持纠正；详见模块15 |
| POST /api/sessions/{id}/turns | event、text、version、request_id；等待真实 AI 完整结果 |
| POST /api/sessions/{id}/controls | 提示、继续、略过、思考、拒绝、暂停、恢复、结束、纠正、授权 |
| POST /api/sessions/{id}/activity | 只有活动布尔值，无草稿内容 |
| GET /api/sessions/{id}/export | 导出当前访客自己的学习与授权记录 |
| DELETE /api/sessions/{id} | 删除记录并取消当前生成 |
| GET /api/settings/ai | 读取本机 AI 配置；密钥只返回 has_api_key |
| PUT /api/settings/ai | 保存并立即更新连接配置；不会调用模型 |
| POST /api/settings/ai/test | 一次模型 JSON 连接测试，不保存配置 |
| GET /api/health | 进程与AI配置状态；不保证第三方在线 |

回答示例：

```json
{"event":"message","text":"b=4，因为最后只改了a","version":0,"request_id":"客户生成的唯一UUID"}
```

成功返回完整 `LearningSession`；无AI配置503，服务商故障/格式错误502，旧版本409，越权与不存在均404，非法字段422。不要把502/503转成一段假回答。

## 并发与幂等

每次变更按版本 CAS 写入。AI 开始时保存 pending request_id 并提升版本；等待期间不持有数据库事务。完成时再次检查版本、pending与active状态，再追加可见消息。结束/暂停/撤权接受旧版本并取消进行中的生成；迟到结果不得落库。

同一 request_id 完成后重复请求返回当前状态，不重复调用AI；同一ID不同内容409。最近100个成功请求保存去重摘要。进程内运行任务表用于取消，因此当前只运行一个 API worker。进程重启后读到不再运行的 pending 会清除。

## 修改方式与验证

改合同需要同时更新 Pydantic、`lib/types.ts`/api.ts、OpenAPI快照与对应测试。只增控制动作时同时定义状态前置条件、取消行为和旧版本处理方式。

运行 `npm run test:api`。重点测试跨访客访问、格式拒绝、重复请求、并发结束和暂停后正常问答。旧turns保留完整JSON返回；页面已改用turns/stream的真实SSE增量。断线回放、限速和计费尚未实现，提交前版本门控与取消继续保留。


## 本机配置接口

`/api/settings/ai` 还要求回环来源、回环 Host、允许的本机 Origin、`X-Study-Client: web-v1`，拒绝转发链中的远程地址。可用 `AI_SETTINGS_ENABLED=false` 关闭这组接口；不是远程管理员鉴权。配置错误与请求验证错误统一脱敏，不回显请求体。完整合同见模块11。

## 自适应对话合同（v0.2）

`turns.event` 支持 message（默认）、open、hint、answer、continue、skip；非message动作可省略text。创建会话不生成题目，UI随后提交open；已有消息时open幂等返回，不重新开课。所有生成动作都要真实Provider。

controls保留兼容的教学动作，但新UI通过turns取得request_id幂等保护；correct先保存纠正，再生成承接。明确文字控制由模型评估后执行真实pause/end/reject，不生成额外题目。控制按钮依然无需等待模型。

activity在通过门控时启动后台支持并立即返回；episode.text为空表示尚未生成，成功后由后续心跳取回。新回答可抢占自动版本，手动并发依然检查CAS。pending_base_version保证纠正后的第二阶段也能被思考/拒绝等控制打断。生成流程固定使用开始时的Provider快照，热切换不会混用一轮的两次调用。

已显示 episode 的 expires_at 允许 null，表示等待用户明确处理，旧记录的数字期限投影为 null。活动心跳不再删除它；普通/流式消息、生成失败和 pending 恢复均保留已显示的卡片，用户选择、暂停/结束或同意设置控制清除。草稿/阅读/后台等仍可取消尚未显示的生成。新增可选 kind（difficulty/cognitive_load/fatigue/waiting/general）和可空 title，当前类别/标题可随状态更新；reason 保留初次触发原因。同一 id 在稳定变化后由模型重写，期间保留旧文，失败不清空；内部签名、pending_context 和刷新证据不公开。完整生命周期见模块05。

新增dialogue_version；current_node现在只描述当前焦点和问题ID，不暴露私有exercise。内部模型输出schema见contracts.py，公共请求OpenAPI仍位于docs/api/openapi.json。

## 有来源的摄像头状态提醒

public session新增camera_alerts数组，兼容旧会话默认空：kind=fatigue/high_load，source=self_report/correction，evidence_quote为用户原话，captured_at/expires_at为Unix秒。输入接口不接受前端上传判断标签；服务端从当前有效自述状态生成，仅在active且support已开启时投影。完整learner_state仍不公开，暂停、纠正和过期会撤销提醒。

## 实时视觉协议

新增POST /api/sessions/{sid}/vision/start、GET /api/sessions/{sid}/vision及WebSocket /api/sessions/{sid}/vision/ws。HTTP沿用身份、归属和写请求校验；WS额外验证Origin、当前camera/support授权、一次性短期ticket。原引擎输出经时效、基线与质量门控后返回，不接收浏览器直接上传的状态标签。帧协议、错误码、字段与代理要求完整见[模块13](13-visual-analysis.md)；WebSocket不列入OpenAPI快照。

camera_alerts公共会话字段仍只保存自述投影；视觉提醒来自独立WS摘要，不混入持久化learner_state。前端CameraAlert展示类型新增visual_heuristic与evidence_note。生成时上下文使用临时visual_observation，模型调用前刷新；可选visual_judgment按run/epoch/时效检查后回到视觉流，不保存原始视觉摘要。

历史名称接口与独立title_version见模块14。重命名采用单独元数据事务，不进入教学控制或取消流程；DELETE同时清理元数据。公共session新增title_version，旧记录为0。

即时接收、accepted/status/delta/complete/error帧、submitted_requests幂等与断开清理见[15-streaming-dialogue.md](15-streaming-dialogue.md)。流式文字先保存用户消息，完整AI结构通过后才保存助手消息；公共Message可含request_id。

## 对话前校准门控

camera=true 时生成入口要求当前 owner/session/consent 的视觉 run 已完成实际60秒有效采样且 baseline_quality=adequate；否则409，detail 为摄像头尚未完成校准。HTTP、SSE、AI教学 controls 和主动支持均执行，不新增可由客户端提交的完成标记。优先控制照常可用，纠正可保存但准备期间不调用模型。SSE 已 accepted 文字在中途断线时保留；每次模型调用、delta 和最终提交再次检查。详情见模块16。

主动支持额度现为每轮最多3次不同状态内容，首次生成与原卡重写共享，整次会话不限总量、无90秒全局冷却。轮次由服务端正常回复完成后的dialogue_turn决定，自动支持不推进；客户端不能上传额度/状态标记。调用前及提交前检查额度和语义状态去重，失败只对同状态退避30秒，见模块05。公开episode合同不变。

## 语言偏好（2026-11-04）

创建请求新增 `language`，缺省 `zh-CN`；turns/stream、turns、controls、activity新增可选语言，省略或null继承会话值，白名单为 `zh-CN` / `en`。public session返回language，旧记录缺省中文；OpenAPI已同步。活动同步按版本处理，生成开始后固定本轮偏好，完整行为见[模块17](17-dialogue-language.md)。

## 请求校验错误显示（2026-11-04）

`lib/api.ts` 的responseError由普通JSON与SSE入口共享。服务端detail字符串按原合同显示；422校验数组不再统一回落为模糊失败：body.language的extra_forbidden说明API进程未更新，提示重启项目并刷新；其他422给出参数无效提示。仅检查错误类型及字段位置，不显示校验对象中的input或原始请求。界面通过现有错误翻译映射显示中英文。


## 独立云端部署副本

托管副本启用AUTH_REQUIRED时，服务端账号替代浏览器访客owner；新增auth接口，HTTP与WS均检查登录，详情见19-hosted-deployment.md。

## 暂时离开与校准恢复（2026-11-09）

controls.action新增suspend：接受优先取消，停视觉、保留consent/support_mode/当前学习位置与已显示卡片，供站内导航使用；原pause仍表示明确暂停支持。vision/start新增可选VisionStart(device_key,reset)，新run可以复用服务端短期参考但仍须有效复核。OpenAPI同步，详细时效和字段见[模块18](18-calibration-reuse.md)。

## 课程准备与视觉可用性

vision/start响应及VisualObservation新增服务端lesson_ready布尔值。它只代表当前owner/session/consent是否已满足课程准备，不能当作视觉valid；断线期间可true而available/valid=false。客户端不能提交完成标记。参考附带consent_key，修改授权/设备或reset不能继承旧放行；请求/流式提交的权限与版本门控保持。
