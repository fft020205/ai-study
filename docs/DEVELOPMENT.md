# 模块开发索引

状态：本分支为 Railway 生产部署版本，包含账号、调用限额和托管运行配置；本地默认仍是匿名 MVP。线上由平台变量配置真实 AI。权威范围以 `README.md` 和本文件为准，原方案中的 PostgreSQL/Redis/研究/声学并不都属于本轮实现。

| 模块 | 代码边界 | 说明 |
|---|---|---|
| 账号与云端部署（生产分支） | `accounts.py`、`features/auth`、`deploy` | [19-hosted-deployment.md](modules/19-hosted-deployment.md) |
| 短时切页与校准复用 | `vision_calibration.py`、`cameraDeviceKey.ts`、`suspend` | [18-calibration-reuse.md](modules/18-calibration-reuse.md) |
| 对话前校准准备 | `lessonReadiness.ts`、`LessonPreparation.tsx`、`VisionService.dialogue_ready` | [16-lesson-preparation.md](modules/16-lesson-preparation.md) |
| 即时消息与流式回复 | `study/stream_protocol.py`、`stream_response.py`、`lib/turnStream.ts` | [15-streaming-dialogue.md](modules/15-streaming-dialogue.md) |
| 历史名称与删除 | `features/history`、`study/storage.py` | [14-session-history.md](modules/14-session-history.md) |
| 模型回复语言与语言同步 | `i18n`、`lib/api.ts`、`study/contracts.py`、`ai.py` | [17-dialogue-language.md](modules/17-dialogue-language.md) |
| 界面、设计与多语言 | `apps/web/src/app`、`components`、`i18n` | [01-ui.md](modules/01-ui.md) |
| 课程与学习流程 | `study/courses.py`、`learning.py`、旧题兼容tasks.py | [02-learning.md](modules/02-learning.md) |
| 产品 API 与协议 | `study/main.py`、`contracts.py`、前端 `lib` | [03-product-api.md](modules/03-product-api.md) |
| AI 接口与 DeepTutor 适配 | `study/ai.py` | [04-ai-interface.md](modules/04-ai-interface.md) |
| 自适应支持策略 | `study/support.py`、`policy.py`、`useActivity.ts` | [05-support-policy.md](modules/05-support-policy.md) |
| 原仓库视觉判定与实时LLM链路 | `study/vision.py`、`useVisualAnalysis.ts` | [13-visual-analysis.md](modules/13-visual-analysis.md) |
| 摄像头与视觉 | `features/vision`（含FloatingCamera和边界函数）、`vision-assets.mjs` | [06-vision.md](modules/06-vision.md) |
| 同意与用户控制 | `features/consent`、`learning.py` | [07-consent-controls.md](modules/07-consent-controls.md) |
| 持久化与归属 | `study/storage.py`、`main.py` middleware | [08-storage.md](modules/08-storage.md) |
| 开发运行与部署 | `scripts`、环境配置、锁文件 | [09-runtime.md](modules/09-runtime.md) |
| AI 接口设置页面与配置管理 | `features/settings`、`study/ai_connection.py` | [11-ai-settings.md](modules/11-ai-settings.md) |
| 课程内自适应对话 | `study/dialogue.py`、`ai.py`、`contracts.py` | [12-adaptive-dialogue.md](modules/12-adaptive-dialogue.md) |
| 测试与质量 | `services/api/tests`、前端单测 | [10-testing.md](modules/10-testing.md) |

## 给其他 AI 的任务模板

> 阅读 AGENTS.md 和 docs/modules/对应模块.md。只修改该模块及必要合同；保留 Figma 样式与用户控制优先级。先列出受影响接口，再实现并运行模块文档指定的验证。同步更新文档，明确未验证项。不要添加模拟 AI 回复或将新能力默认为已连接。

## 依赖方向

- `courses` 只定义主题和事实；`tasks` 只供历史兼容。两者不依赖UI或数据库。
- `learning` 是状态转换，不执行网络请求。
- `policy` 是时间/活动门控，不做心理状态推断。
- `dialogue` 限定近期历史、状态证据和回复策略；`ai` 是真实服务边界。
- `main` 编排鉴权、版本、控制和持久化；AI 调用期间不持有数据库事务。
- `storage` 不理解教学文案，可独立替换。
- `CameraPreview`经视觉hook发送派生特征，不直连AI或数据库；`vision`独立维护有效校准与原引擎状态。
- UI显示依赖 `i18n`，API/SSE与活动请求传递归一化语言代码；后端不导入前端翻译资源，真实模型根据服务端语言偏好生成动态正文。新增语言还需同步后端白名单、模型语言规则及协议测试，见模块17。
- 每次模型请求前刷新视觉快照；AI解释与原始特征分开，用户控制和自述优先。

## 接下来最合理的开发顺序

1. 在页面“AI 接口设置”中接入真实模型，拿三套题与反例评估中文判断、格式、成本和延迟。
2. 若必须以 DeepTutor 承载教学，部署固定版本及关闭工具的独立 scope，并进行真实认证/取消测试；再考虑受控 capability 与 RAG。
3. 真机验证摄像头（权限拒绝、多人、弱光、后台、移动端）；再研究信号能否帮助任务，不能把检测成功当作情绪有效性。
4. 生产分支已含账号、调用限额和 HTTPS；扩大试用前补密码恢复与卷备份验证。扩容前迁移共享状态并评估 PostgreSQL，不能直接增加副本或 worker。
5. 有明确模型与授权方案后再加入 ASR、声学、融合或研究模块。
