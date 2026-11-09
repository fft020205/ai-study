# 06 · 摄像头、端侧特征与悬浮组件

## 当前能力与边界

真实设备预览 → MediaPipe 人脸几何检测与质量门控 → 端侧行为特征 → 本机后端原版 CognitiveEngine。原仓库已实际接入，详见 [13-visual-analysis.md](13-visual-analysis.md)。约一分钟准备现在包含真实的60秒有效采样校准；资源加载时间单独显示。视频和关键点不离开浏览器，派生特征送本机后端，当前状态摘要随真实模型请求发送给配置的AI服务。

视觉输出是启发式行为线索，不是经过验证的心理诊断或情绪分类；人脸检测成功不能证明认知负荷判断有效。没有AI配置时，视觉引擎仍可工作，但不会产生AI对话或AI解释。

## 文件与职责

| 文件（apps/web/src/features/vision） | 职责 |
|---|---|
| CameraPreview.tsx | 设备、Worker、采样生命周期与UI编排 |
| FloatingCamera.tsx / cameraPosition.ts | 拖动、键盘操作、可见窗口边界 |
| vision.worker.ts / quality.ts | MediaPipe检测、质量门控与本地特征提取 |
| behaviorFeatures.ts | 眨眼迟滞、虹膜偏移、鼻尖位移；不做心理判断 |
| useVisualAnalysis.ts | 获取短期ticket、建立WebSocket、发送派生特征 |
| visualAnalysis.ts | 结果合同、三秒时效校验 |
| visionPreparation.ts / VisionPreparationStatus.tsx | 运行时、模型与首个有效画面的真实加载阶段 |
| VisualAnalysisStatus.tsx | 后端连接、校准进度、行为指数与AI参考状态 |
| cameraAlerts.ts / CameraStatusWarning.tsx | 有来源、有时效的琥珀提醒 |

模型与WASM由scripts/vision-assets.mjs安装到public/vision；版本和哈希见integrations/vision-assets.lock.json。上游Python源码与固定版本单独在integrations/adaptive-cognitive-load-analysis。

## 采集与停止

仅在 active 会话的校准准备页或对话页、已同意 support 和 camera、页面前台时请求 getUserMedia，audio=false。画面下采样到320px宽并保持比例，最多约15帧/秒且同一时刻只处理一帧；后端派生特征约2包/秒。CPU性能较低时会自然降低采样率，不能把该频率视为设备保证。

质量允许值：valid / no_face / multiple_faces / low_light / out_of_frame / stale。只有有效画面才提取特征；无效包features必须为null。Worker返回bitmap的采集时间，过期画面不因刚刚送达而重新有效。

关闭先立即停止tracks、终止Worker和采样定时器，再异步保存撤权；关闭期间禁用再次开启，失败保持本地关闭。后台/pagehide同样停采和断开视觉连接；原授权仍有效且未手动关闭时，回前台自动恢复并按模块18复核。迟到媒体授权、Worker消息和网络回复必须经generation/disposed检查，不能恢复已停止的采集。离开、暂停、结束、删除会话同步使后端run失效。

## 悬浮、折叠与重新开启

展开、收起、关闭三种状态共用FloatingCamera和位置状态，组件在对话滚动区外fixed定位，不占课程正文空间。拖动只移动外层，不改变媒体流或授权。手柄支持指针/触摸与方向键；窗口和visualViewport变化后夹取到可见区域，保留既有桌面/手机断点。坐标不上传、不持久化。

收起仅隐藏画面，采集、连接和紧凑状态继续；关闭保留带图标的长方形“开启摄像头”入口。已同意support时点击重新提交camera=true，成功后展开；未同意support时进入既有学习设置。再次开启始终建立新run；同课程同设备的临时参考可用于5秒复核，过期或不匹配才完整校准，见模块18。

## 准备、校准与颜色

资源阶段：off → loading_runtime → loading_model → checking_frame → ready。该阶段使用真实事件和不定进度；超过60秒未就绪显示耗时与重试，不自动宣告完成。

首个有效画面后显示后端的calibration_progress与valid_seconds /60秒。无脸、低质、间隔过长时暂停累计；断线明确提示，基线不足显示重新校准。校准仅显示一行状态、有效采样/60秒和进度条；完成后只显示“监测中”。行为指数与独立AI判断仍由后端保留并供模型使用，摄像头卡片不重复显示数值和说明；异常保留简短状态与重试。

琥珀色标签仅覆盖在展开且实时开启的画面右下角，桌面8px、手机6px内边距，不再占用工具栏下方的独立横幅。有效视觉阶段连续3秒后才可能显示“可能疲劳 / 负荷可能偏高”，明确自述和视觉来源分别保留在title与无障碍名称中；实际AI判断的依据也可在悬停说明里查看。收起或关闭不显示画面标签；再展开按当前有效数据恢复，自述优先，同类标签不重复，过期或撤权不沿用旧视觉警告。

## 修改与验证

设备/拖动改本模块；算法接入、状态合同、授权与LLM链路改模块13；语气改模块12。不能在React里用阈值直接替代后端判定。

运行npm test与npm run build。quality、cameraPosition、visionPreparation、behaviorFeatures单测覆盖门控、边界、真实阶段、几何特征和过期。浏览器核对桌面与360px的展开/收起/关闭、校准和错误状态；组件预览或合成数据不等于摄像头实测。实体设备的眨眼漏检、光照、眼镜、性能、头部运动与实际学习状态的相关性仍需独立验证。

## 摄像头信息精简（2026-10-30）

按用户标注删除底部“检测到1张人脸 · 仅本机处理”文案与整段camera-quality元素；质量门控、无效帧、Worker与WebSocket发送继续保留。视觉准备阶段改为短状态、等待秒数和进度条，超过60秒或出错才出现重试；不重复铺开首次加载、行为指数、AI参考和辅助说明。正常分析一行，校准保留真实有效秒数；不会用计时替代校准。

CameraStatusWarning放入camera-picture内，绝对定位于视频右下角，多标签纵向右对齐，宽度受画面约束。overlay不单独变换，因此视频镜像不影响文字方向；原悬浮拖动、关闭入口、媒体停采和后端通信保持原行为。没有新增断点或新增状态推断。

## 监测状态移入左上角（2026-10-30）

按最新标注，camera-monitor-badge在camera-picture左上角替代旧“实时”标记，正常显示“监测中”、校准显示有效秒数/进度、异常可重试。camera-toolbar下方的整个状态栏删除，右下角仍是疲劳/负荷标签。桌面左/上8px，手机6px，白色半透明底与原accent色；没有新断点。收起后画面和覆盖标签一起隐藏，关闭入口不变。仅live时渲染该状态，不能把关闭或等待权限写成正在监测。后端判定、校准、消息流与模型输入不改。

先校准再学习：CameraPreview 在准备页立即启动真实设备与原引擎，报告就绪状态，完成有效60秒且基线充分后才显示对话并请求开场。切换到对话时不卸载该组件、不重建 WS；相同 run 的暂时低质画面不重启准备。重新开启/断开需要新run准备，匹配短期参考时只做5秒有效复核；统计窗口预热不再次拦截对话。重试结果按 sessionId/restartKey 区分，stop 立即清除就绪；关闭仍先停采再保存，详见模块16。

## 短时恢复（2026-11-09）

cameraDeviceKey对摄像头设置做本机SHA-256摘要，useVisualAnalysis在start请求携带device_key/reset。首次、续采和快速复核统一使用后端required_seconds，新增“监测恢复中”而不沿用旧告警。关闭/后台仍停采，回前台自动恢复只适用于未手动关闭且授权有效的场景；无新token或断点。缓存与配置见[模块18](18-calibration-reuse.md)。

## 眨眼短窗估计与状态优先级（2026-11-09）

BehaviorFeatureExtractor按滚动分钟中的真实有效区间换算每分钟眨眼频率，无效/长间隙不充当分母，先前有效区间不会因单帧无效全部清零。Worker→CameraPreview→WS同步feature_window_seconds，缺失时兼容旧调用。5秒复核后立即真实监测，取消额外60秒连续预热。状态组件先判断断线/无效/过期，不让旧warming_up标签遮蔽失效状态。没有新增断点、图标或布局。

## 答题连续性与恢复信号

视觉连接error不再卸载已准备课程的对话与输入。WS自动重连复用当前MediaStream，摄像头左上角仍显示实际连接/复核/监测状态，不把缓存参考当作实时画面。连接重试与强制重新校准分开，只有recalibrateSignal清除参考。deviceId不可用时只做同一媒体流的随机键匹配；后台停采、关闭保持关闭及旧回调隔离仍保留，详见模块18。
