# 第三方来源与许可

- Figma UI 与SVG来自用户指定设计文件Ppxeax0bTe6Cog4eSKP6gm。文件映射在docs/design/assets.json。未把Figma静态人物当实时摄像头。
- MediaPipe Tasks Vision 0.10.32：Google/MediaPipe，Apache-2.0。模型使用官方face_landmarker float16 v1。URL与SHA-256在integrations/vision-assets.lock.json；资源用于人脸几何检测，不提供心理推断许可或有效性结论。
- Noto Sans SC：SIL Open Font License 1.1，许可副本在licenses/NotoSansSC-OFL.txt。
- Next.js、React、React Markdown等软件的许可随NPM分发保存；版本以package-lock.json为准。Python版本以requirements.lock.txt为准。
- DeepTutor为可选外部集成，审查固定SHA f9a687575f345cdc570f1031f7494a193d59b6b6，Apache-2.0。本项目没有打包或复制上游源码，仅实现其公开2.0协议适配器；部署上游时须保留其LICENSE与THIRD_PARTY_NOTICES。
- adaptive-cognitive-load-analysis：用户指定的本地视觉引擎，固定提交0c938e4fec21a852401c10213127a630d0b6cf75。原版backend/cognitive_engine.py保存于integrations/adaptive-cognitive-load-analysis并实际运行；浏览器几何提取按上游web/app.js改写为TypeScript。来源与哈希见该目录upstream.lock.json。上游没有声明许可证，保留来源不代表已取得再分发或商业授权；对外发布前需解决许可。其指数为启发式行为估计，不代表经过心理测量验证。

本文件不替代模型服务商、教材或后续添加数据的许可核查。
