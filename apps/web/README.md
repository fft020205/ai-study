# 前端模块入口

请先读根目录AGENTS.md。界面实现说明见../../docs/modules/01-ui.md；同意与控制见07-consent-controls.md；视觉见06-vision.md。

`src/app/page.tsx`编排页面；独立功能位于`src/features`；网络调用集中在`src/lib/api.ts`。不要在组件内放模型密钥或评分标准。

原仓库视觉接入及前后端实时合同见../../docs/modules/13-visual-analysis.md。浏览器只提取特征并通过产品API发送，不直连第三方模型；校准/指数来自后端实际原引擎。
