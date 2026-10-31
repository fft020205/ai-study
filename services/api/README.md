# 产品后端入口

请先读根目录AGENTS.md与docs/DEVELOPMENT.md。

- study/tasks.py、learning.py：02-learning.md
- study/main.py、contracts.py：03-product-api.md
- study/ai.py：04-ai-interface.md
- study/policy.py：05-support-policy.md
- study/storage.py：08-storage.md

以上文档均在根目录docs/modules。当前单进程运行；没有真实AI配置就返回503，不插入模拟答案。

- study/vision.py与实际原仓库引擎、受保护WS、LLM快照：13-visual-analysis.md。VISION_ENABLED=true启用；只处理派生特征，单worker内存运行，不启动上游完整服务。
