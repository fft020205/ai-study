# 09 · 开发运行与交付

## 组成

根目录npm workspace；apps/web为Next.js 16/React 19；services/api为Python3.12/FastAPI。前端依赖精确版本与package-lock.json，Python直接依赖requirements.txt及全量requirements.lock.txt。视觉模型hash独立锁定。

`scripts/dev.mjs`启动两个子进程，默认web3000、api18000，均监听127.0.0.1。退出时终止它创建的两个进程，不清理其他应用。端口已占用时应改.env API_PORT/WEB_PORT；同时同步ALLOWED_ORIGINS与API_INTERNAL_URL。

`npm run assets:vision`从官方固定模型版本下载，复制已锁NPM包WASM。公共静态目录无需密钥；.env不得移入public。

## 运行与检查

首次安装见根README。开发`npm run dev`；生产打包`npm run build`。独立启动产品API：

```bash
.venv/bin/python -m uvicorn study.main:app --app-dir services/api --host 127.0.0.1 --port 18000
```

另一个终端以根目录为cwd执行：

```bash
API_INTERNAL_URL=http://127.0.0.1:18000 npm run build
npm run start -w apps/web
```

Next rewrite目标在构建/启动配置中读取；部署变化后重新构建并验证代理。当前启动脚本是开发用途，非守护进程或系统服务。

## 本轮取舍

使用单产品进程和清晰模块，尚未引入Redis、对象存储、后台作业和Kubernetes。当前没有上传教材/音视频需求，因此不添加空的文件服务。多人试用前补HTTPS、真实账户、预算限额、速率限制、数据库迁移、日志脱敏、清理与备份。不要直接运行多个API worker：活动窗口、取消表、视觉run/校准和短期ticket目前都在进程内。

## 验证

安装后`npm test`与`npm run build`。依赖升级后复核npm audit与构建；不使用未经核对的自动强制升级。运行时不自动修改用户.env或调用付费模型。


## 运行中配置 AI

页面配置保存在 `AI_CONFIG_PATH`（默认 `data/ai-connection.json`）。按启动环境读取 `.env` 后，再读取该文件的 AI 字段覆盖；不是修改 `.env`。保存原子替换，权限600，立即应用于新的请求。复制/备份 data 时其中包含密钥，应按私有配置管理。只在本机运行设置页；远程部署先设置 `AI_SETTINGS_ENABLED=false`，在有管理员鉴权后再开放配置接口。

## 视觉引擎与WebSocket

VISION_ENABLED=true默认启用实际原版引擎；health.vision_configured=true表示固定源文件存在且SHA-256通过，不能代表设备已连接。无需启动上游额外服务器或安装其完整依赖。模型资源仍由npm run assets:vision安装。原引擎源码和锁文件随本地项目保留，接口与许可边界见模块13。

浏览器WS走与HTTP相同的/api rewrite；线上反向代理须支持WebSocket Upgrade、保留身份Cookie与Origin，使用HTTPS/WSS。ALLOWED_ORIGINS必须与实际前端地址匹配。断线、重启后需要显式重新连接并校准；不恢复旧基线，不自动调用付费模型测试。

流式响应要求代理关闭SSE缓冲，保留text/event-stream、X-Accel-Buffering:no与no-transform。OpenAI兼容服务需要支持stream=true下的JSON输出；不兼容时明确报错，不能用前端定时器伪造流。具体运行与验收见模块15。

## GitHub 交付

源码、依赖锁文件、模块 Markdown、Figma 静态资源和第三方许可随 Git 保存。.env 与其本地变体、data/、数据库/备份、私钥、node_modules/、.venv/、.next/、日志和缓存不提交。仅 .env.example 是可提交的配置模板。

apps/web/public/vision/ 是可重建的模型/WASM下载目录，不加入Git；首次克隆后按README运行 npm ci 与 npm run assets:vision，脚本根据 integrations/vision-assets.lock.json 验证并安装固定资源。已有本地资源保留原处，不因.gitignore删除。

提交前核对 Git 暂存区清单和敏感值扫描；不输出密钥，不将真实学习记录、运行配置或临时数据库上传。仓库默认为用户个人账号下的私有仓库。

个人私有仓库为 https://github.com/fft020205/ai-study ，默认分支 main。首次克隆按根 README 安装依赖和固定视觉资源；本机原目录仍可直接 npm run dev。后续正常 git add / git commit / git push 同步源码，忽略规则不会删除本地配置、学习数据或下载资源。

## 开发时同步后端版本（2026-11-04）

`npm run dev` 现在为Uvicorn增加 `--reload --reload-dir services/api/study`，后端Python代码变化后自动重载，避免Next已热更新而API仍拒绝新增请求字段。仅用于开发，不增加API worker；配置文件与视觉资源目录不在监听范围。修改.env或启动参数仍需手动重启整套开发服务。重载会清理内存中的生成/视觉run，已有数据库、AI配置和学习记录保留，摄像头需按原流程重新校准。

新增运行参数不会自动改变已经启动的旧进程；首次采用本次脚本需重启npm run dev。当前端遇到旧API拒绝language字段时，显示明确的重启提示，JSON与SSE一致；不回显422中的input或完整校验对象。

## 校准参考配置（2026-11-09）

VISION_CALIBRATION_CACHE_SECONDS默认900，允许0–900，0关闭复用。参考只在当前单worker内存，重启失效；最多128份、约30秒清理一次失效记录，匹配时立即检查期限。无需数据库迁移、新依赖或人脸素材存储；不会修改用户.env。首次仍60秒，新run匹配有效参考后做5秒有效复核；部署/多worker限制不变。
