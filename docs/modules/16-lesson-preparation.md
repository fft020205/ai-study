# 16 · 对话前摄像头准备

## 当前流程

camera=false直接进入文字学习。camera=true时先启动真实设备、Worker和视觉WS，首次累计60秒有效采样且baseline_quality=adequate后进入AI对话；空会话才请求真实开场。权限等待、加载、无脸/多脸/弱光及长间隙不计时，不能靠墙钟或客户端完成标记解锁。

2026-11-09起加入同访客/同课程/同设备的短时恢复：已完成参考在默认15分钟有效期内复用，约5秒有效画面复核后继续；部分校准从已完成秒数续采。过期、换设备、无匹配键、低基线、显式重校或服务重启时完整准备。完整缓存、协议、质量与删除边界见[模块18](18-calibration-reuse.md)。

## 文件与就绪

- `lessonReadiness.ts`：匹配session/live/connection，要求calibrated和adequate；保留受中断消息的重试身份。
- `LessonPreparation.tsx`：首次/继续/快速恢复文案，按required_seconds显示真实有效进度，复核时允许重新校准。
- `CameraPreview.tsx` / `useVisualAnalysis.ts`：设备、后台停采与恢复、匹配键、新ticket/run、显式reset。
- `study/vision.py`：dialogue_ready/require_dialogue_ready，服务端权威准备门控。
- `main.py` / `ai.py`：生成、每次Provider调用、delta及最终提交再次检查；校准中不触发后台支持。

5秒有效复核后立即恢复真实监测及对话，不再加60秒连续有效画面的预热门槛。眨眼频率按真实有效观测时长换算，短窗估计附带时长标记供模型审慎使用；无效或过期画面仍保持未知。暂时画面不佳不会重做整份校准。

## 生命周期与取消

切到设置、隐私或其他课程使用suspend取消生成、停视觉并保留同意和位置。回到当前课程自动建立新run，复核后继续；浏览器后台仍停采，未手动关闭且授权有效时回前台恢复。收起/拖动/语言切换不重建校准。显式关闭立即停采并保存camera=false；结束/撤销support/删除清除参考。

准备页不渲染对话和输入栏；复用原readable、stack、浅绿token与响应式布局，未增加断点。准备不足的新普通请求409且不调用AI；已经accepted的文字及request_id保留，准备通过后同ID重试，不重复保存消息。暂停/结束/纠正优先控制仍可执行；无AI不产生假承接。

## 验证与限制

运行npm test、npm run build。原test_lesson_preparation保留真实60秒、无效基线、前置门控、同run低质、关闭文字模式、优先控制和两阶段失去run测试；新增test_calibration_resume覆盖实际复用、5秒门控和隔离清理。lessonReadiness测试覆盖5秒进度、短时恢复和旧状态兼容。布局与真机边界见模块18及验收记录；没有持久人脸基线或跨课程免校准。
