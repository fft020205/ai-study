# 18 · 短时切页与校准恢复

## 行为与边界

首次开启摄像头仍累计60秒真实有效采样。已校准的同一访客、同一课程会话和同一摄像头设置在有效期内重新开启时，复用内存参考值，累计约5秒有效画面复核后继续对话。未完成的校准保留有效秒数与校准样本，继续补足60秒；离开、资源加载和无效画面不计时。

已完成参考的闲置期限默认900秒，从最近一次真实有效且已通过准备的观测起算。持续有效监测会刷新活跃时间，避免学习超过15分钟后一次重连就重做60秒；仅发起重连或未完成复核不延长期限。部分进度仍从本次校准开始时起算。设备/分辨率变化、过期、无设备匹配能力、参考不足、用户选择重新校准、服务重启或被容量策略清理时，回到完整准备。此功能不做人脸识别，不支持跨课程、跨浏览器、跨设备或永久免校准；不能确认共享同一浏览器/课程/摄像头的人是否换了人。

## 文件与模块

| 文件 | 职责 |
|---|---|
| `study/vision_calibration.py` | 纯内存参考结构、同设备匹配、期限、容量、清除、基线充分性 |
| `study/vision.py` | 新run恢复、真实复核计时、短窗特征标记、就绪与模型快照 |
| `study/contracts.py` / `main.py` | VisionStart合同、suspend控制、归属/授权/WS生命周期、周期清理 |
| `features/vision/cameraDeviceKey.ts` | 本机摄像头设置摘要；缺失时仅匹配同一MediaStream，不能跨重新开启的设备复用 |
| `CameraPreview.tsx` / `useVisualAnalysis.ts` | 后台停采、回前台恢复、匹配键与显式reset传输 |
| `LessonPreparation.tsx` / `VisualAnalysisStatus.tsx` | 首次/继续/5秒复核的真实进度与当前监测状态 |
| `app/page.tsx` | 页面导航使用suspend，避免把暂离当成撤销摄像头 |

固定上游 `cognitive_engine.py` 和哈希未修改。恢复只把服务端已经真实完成的参考值装入新引擎，首次或明确重校仍由服务端阻止模型对话；同授权的已准备课程可以在视觉恢复期间继续文字，模型收到不可用视觉状态。不以墙钟或客户端标记跳过首次准备。

## API与输出

`POST /api/sessions/{id}/vision/start` 新增可选JSON：

```json
{"device_key":"64位小写SHA-256十六进制值","reset":false}
```

空请求兼容旧客户端，正常执行完整校准；不存在匹配键时不复用。设备键由浏览器对deviceId、width、height、facingMode计算摘要，原始设备标识不上传。这个键是匹配线索，不是身份凭据；每次仍验证owner、active、camera/support同意，签发新的单次短期ticket与run_id。

reset=true丢弃该会话缓存并完整校准。恢复/继续准备页提供“重新校准”，经retrySignal发送显式reset；普通重连不重置基线。

start响应新增 `calibration_mode=full/resume/continued`；`calibration_seconds` 为60或5。VisualObservation新增同名mode和feature_window_seconds；`required_seconds` 与 `valid_seconds` 根据真实准备阶段分别为60秒累计或5秒复核。进度组件使用服务端required_seconds，不能硬编码60。

状态 `revalidating` 表示短时复核，完成后立即使用新画面进入analyzing，不再额外等待60秒连续画面。calibrated在复核完成前为false。复核只累计有效采样段，质量无效或长间隙暂停；没有用5秒定时器模拟完成。旧warming_up仅作显示兼容，过期画面优先显示等待有效画面。

新增 `controls.action=suspend` 供切到API设置、隐私和其他学习记录时使用，取消当前生成并停止视觉run，保留同意、学习位置、自述和已显示支持卡。它不等于用户明确暂停主动支持；原pause/end/consent语义保留。点击当前正在显示的历史记录不重复暂离。暂停、关闭摄像头和临时断线可以保留参考；结束、删除或撤销support清除。

## 恢复后的状态质量与模型通信

新run不复制旧帧、旧阶段、告警、CLI历史或LLM判断，seq从1开始；旧ticket、run与迟到结果不能覆盖新流。未完成校准只保留校准专用样本，完整参考只保留三个基线值与元数据。

重建Worker后不再强制等待完整一分钟。浏览器以最近一分钟内实际有效观测区间为分母，将眨眼事件换算为每分钟频率（不足1秒按1秒下限、上限240）；无效画面和超过1.5秒的间隙不充当观测时间，区间与事件均按滚动分钟淘汰。设备匹配键包含featureVersion，避免混用旧计数口径的基线。

5秒复核完成且当前画面有效时立即valid=true、status=analyzing，真实CLI与特征可以进入模型；新增feature_window_seconds和blink_rate_estimated注明统计时长与短窗估计，模型须结合其他线索保持不确定。原引擎30包阶段窗口、连续3秒提示、时效、自述纠正和LLM独立判断保持。无效画面仍valid=false，不沿用旧告警。

## 内存、授权与清理

缓存键为(owner, session_id)，设备摘要必须匹配。默认最多128份，满后清除最早保留的参考；访问时清理失效条目，服务每30秒清理一次。配置 `VISION_CALIBRATION_CACHE_SECONDS` 允许0–900，默认900，0禁用复用。值只在服务启动时读取，不改用户.env。临时参考不写数据库、文件、导出或模型payload。

后台/pagehide立即停止tracks、Worker和WS，回前台或BFCache恢复时，在原同意仍有效且未手动关闭的情况下重新请求设备并复核。手动关闭保持关闭，回前台不会偷偷开启；结束/撤权后服务端也不能恢复。退出服务清空内存参考，单worker限制仍有效。

## 修改与验证

改缓存期限/容量/隔离只改vision_calibration与配置；改复核时长改vision.RESUME_SECONDS并同步文档及UI；改生命周期改CameraPreview/useVisualAnalysis与suspend；不要改原引擎或用客户端标记解锁。

`test_calibration_resume.py`运行原引擎和受控时钟，覆盖5秒有效复核、部分进度、旧告警隔离、过期/换设备/reset/禁用/无键、归属/会话隔离、低基线、期限不续期、内存容量、旧WS迟到、API暂离与门控、撤权/删除。前端覆盖后台停采恢复、设备键、普通复用与显式reset、5秒组件、短窗估算与过期状态显示。运行npm test和npm run build。

1414×827与360×800的中英文恢复组件使用真实Chrome核对，无横向溢出或预览/进度遮挡；截图在docs/screenshots/calibration-resume-*，明确标注合成状态。未打开实体摄像头、未调用真实模型。5秒复核与短窗估计对实际设备、光照和行为估计的效果仍需真机评估，不据此声称心理测量有效。

## 答题中误触发完整校准的修复

根因链路：服务端原本对迟到/乱序/短时到达拥堵直接关闭WS并清理参考；hook没有自动重连；页面将连接error等同首次未校准；“重新连接”又走了强制reset。用户不移动也能触发。现在：

- VisionSampleRejected只丢弃该帧，不刷新有效时间、不关闭已校准run；非法结构、越权及撤权仍按原规则终止。
- useVisualAnalysis只重连WS，500ms起退避、最长5秒，有8秒握手超时；新连接使用新ticket/run，seq重置，不重新请求媒体。停止/后台/会话变化会取消timer、请求和旧回调。发送前丢弃2.5秒前的帧；服务器仍执行3秒时效。
- retrySignal只恢复；recalibrateSignal才发送reset。画面上的连接重试只重连WS；准备页“重新连接摄像头”保留参考，“重新校准”明确清除。
- 后端VisualObservation/lease新增lesson_ready，表示本课程是否已满足准备，不代表当前视觉有效。当前run完成基线，或同owner/session/consent的未过期完整参考可保持lesson_ready=true；新设备、首次/部分校准、新授权、明确reset、过期/撤权不能靠该标记放行。这个值只由服务端生成。
- Home保留本课程已准备状态，避免连接error使对话/输入卸载及中断正在输出的答案；服务端明确lesson_ready=false时清除。模型调用前、delta及提交仍核对后端准备/版本；断线时snapshot.available/valid=false，旧CLI/告警/LLM解释不复用。
- 完成参考绑定consent_key与last_valid_at，容量和清除规则保持。若浏览器不提供设备ID，用WeakMap中的随机流键匹配同一MediaStream；新媒体流生成新键，不能跨未知设备复用。

page.camera.test.tsx渲染真实Home/CameraPreview/useVisualAnalysis，用测试媒体/WS/Provider模拟“已发回答→WS断线→后台复核→回复完成”，确认输入节点、新草稿和流式任务保留，getUserMedia只调用1次。后端真实引擎/WS测试迟到及拥堵帧后同run可继续回答；评分中断线时第二阶段收到不可用视觉并正常完成。首次/明确重校/撤权/其他归属仍有独立回归。
