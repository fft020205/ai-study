# 17 · 界面语言与模型回复语言

## 职责与边界

支持 `zh-CN` 和 `en`。界面语言由 i18next 与浏览器偏好决定；服务端只接收经 Pydantic 白名单验证的语言代码，不接受客户端系统提示词。真实模型依照本轮 `response_language` 生成开场、普通回复、流式正文、提示/示范/继续/换例子、纠正承接与自适应支持标题/正文。课程ID、教学范围、JSON字段、枚举、证据与视觉链路不因语言改变。

已有消息、已显示的支持卡和用户输入保留原文；切换不自动翻译历史、不重开课程，也不产生额外翻译调用。接下来的实际生成使用最新偏好。模型是否准确遵循语言、教学和情感表达约束仍需实际服务商评估。

## 文件与数据流

| 文件 | 修改入口 |
|---|---|
| `src/i18n/index.ts` | `currentLanguage()` 返回归一化后的当前界面语言，不依赖会话缓存 |
| `lib/api.ts`、`lib/turnStream.ts` | 创建、控制、JSON/SSE生成和活动心跳携带 `language` |
| `study/contracts.py` | `Language` 白名单与请求兼容默认值 |
| `study/learning.py` | 新会话持久化偏好、旧记录中文回退、公开投影、按钮命令文本 |
| `study/main.py` | 生成开始时固定本轮语言，活动同步、版本与取消处理 |
| `study/dialogue.py`、`study/ai.py` | 评估与回复上下文携带 `response_language`，共享模型语言约束 |
| `TaskSelector.tsx` | 提示状态保存翻译key，渲染时调用 `t()` |

偏好存入现有会话JSON的 `language`，无需数据库表迁移。公开session返回该字段，前端类型可选以兼容旧数据。浏览器只保存原有界面偏好键，不额外保存消息或模型凭证。

## API合同

- `POST /api/sessions`：`language` 默认为 `zh-CN`。
- `POST /turns`、`/turns/stream`、`/controls`、`/activity`：新增可选 `language: "zh-CN" | "en" | null`；省略或null保留会话偏好，旧会话无字段时按中文处理。
- 不支持的语言返回422。模型上下文的 `response_language` 来自服务端会话快照，不能由用户正文或历史覆盖。
- UI每次请求读取当前界面语言，活动心跳约2秒同步；生成请求直接携带偏好，不必等待心跳。只读请求不修改偏好。

示例：

```json
{"event":"message","text":"Could you explain it with another example?","language":"en","version":3,"request_id":"客户端稳定UUID"}
```

`reply`、`support_title`、练习自然语言和 `visual_judgment.reason` 遵循偏好。评估器支持两种语言，逐字证据保留原话；代码、数学与必要引文不强制翻译。OpenAI与DeepTutor、完整JSON与真实流式生成共用这些约束。

## 并发、支持与摄像头

生成开始时持久化并固定本轮语言。普通回复生成期间，活动心跳不写入语言或提升版本，因此切换UI不会截断流或混合一轮的两次调用；本轮完成后，下一次活动/生成请求使用新偏好。

空闲时仅当前版本心跳可同步语言；该自动变更使用既有 `auto_base_version` 容忍边界，允许恰好同时发出的旧版本手动请求继续通过原有校验。过期心跳不能回滚语言；正常生成开始后恢复原有版本检查。

支持生成期间收到有效的新语言偏好时，取消旧语言的后台生成并丢弃迟到结果；已展示卡片保留，无文案的占位撤销。下一次符合门控的实际生成使用新语言，仍遵守每轮3种状态、去重、稳定窗口与失败退避规则；语言切换本身不增加额度或触发付费重写。

活动同步不调用视觉stop，不更改consent，不重启媒体、视觉WS或60秒校准。暂停/结束/撤权等原有优先控制继续有效。

## 首页提示与验证

`TaskSelector` 的note仅保存 `tasks.fallback` key，避免已经显示的提示在语言切换后停留于旧语言。切换前后的输入与选择状态保留，无新增布局或断点。

`test_dialogue_language.py` 覆盖创建/旧记录、JSON/SSE/控制、持久化、支持、非法语言、已完成请求幂等回放、过期心跳与普通生成/支持取消竞态。`api-language.test.ts` 验证各传输入口携带实时语言；`TaskSelector.test.tsx` 渲染真实组件验证已显示提示双向切换及草稿保留。运行 `npm test`、`npm run build`。使用测试Provider和临时数据库，不调用真实模型、不打开实体摄像头；真实服务商的双语质量与设备表现未验证。
