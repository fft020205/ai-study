# 19 · 账号登录和云端部署

适用于 `railway-production` 生产分支；`main` 保留本地默认匿名模式。本机数据库不上传，线上沿用 Railway `/data` 卷。线上地址：https://ai-study-production.up.railway.app 。

## 文件和边界

- `study/accounts.py`：SQLAlchemy 账号、登录令牌、认证限速、每日调用计数，以及真实 Provider 的计数包装器。
- `study/main.py`：HTTP 身份中间件、账号路由、WebSocket 登录校验、退出撤权和运行任务取消。已有学习数据仍由 `Repository` 按 owner 过滤。
- `AuthGate.tsx`：登录、注册和过期回登录。密码只在表单内存，登录令牌由 HttpOnly Cookie 保存；不会写 localStorage。
- `Shell.tsx`：当前用户名和退出入口；托管模式隐藏 AI 配置。
- `ConsentPanel.tsx`、`page.tsx`、两种语言资源：托管模式下如实说明派生特征、服务器记录与 AI 服务传输。
- `Dockerfile`、`deploy/start.py`、`deploy/nginx.conf`、`railway.json`：原 Next/FastAPI 容器启动、单副本/worker、持久卷、HTTPS origin、SSE 与 WS 代理。

## 接口

| 接口 | 合同 |
|---|---|
| `GET /api/auth/config` | required、registration_enabled、ai_settings_enabled，均不含秘密 |
| `GET /api/auth/me` | 当前 user 的 id/username，未登录时 user=null |
| `POST /api/auth/register` | username/password；注册后直接登录，201；可关闭注册 |
| `POST /api/auth/login` | username/password；创建随机令牌，撤销当前旧令牌，返回 user |
| `POST /api/auth/logout` | 撤销当前令牌，删除 Cookie，取消当前账号生成与视觉任务 |

写接口继续要求 `X-Study-Client: web-v1`，验证存在的 Origin 为精确允许源。用户名英文数字点横线下划线，3–64 字符，转小写；密码12–128字符。422不回显输入；错误登录统一401，限速429。账号数据仅新增表，不改写旧匿名 owner。

每次真实上游请求前，以 ContextVar 保留服务器身份，原子更新用户与全站每日调用计数；事务任一限额不足整体回滚，返回429（SSE内为error事件）。失败尝试也计数。课程内暂停/撤权/取消保持原来版本检查。

## 配置和验证

完整线上参数与发布步骤见 [deploy/README.md](../../deploy/README.md)。本地默认仍为匿名访客；线上启动器强制认证、安全 Cookie、关闭配置接口、持久化数据库和 HTTPS origin。

测试入口：`npm test`、`npm run build`。账号测试覆盖跨账号读/改/删/导出隔离、Cookie标记、令牌哈希与撤销、过期、CSRF、注册关闭、认证限速、额度并发与重启保留、SSE身份、WebSocket拒绝伪造访客、登录账号校准恢复和退出清理。部署测试验证启动器的域名、密钥与卷约束。每次合并必须重跑并在发布记录中写入实际结果。

公网验证至少包含 `/api/health`、认证配置、未登录访问拒绝及登录页面；容器构建必须在 Railway 成功。历史已进行桌面和360px登录/注册与真实模型对话验证；本次不能据此声称实测了实体摄像头、多人压力、卷备份恢复或真实模型行为。


## GitHub 052fc628 更新合并

本次部署合并上游短时校准恢复，保留既有账号、调用额度、HTTPS、密钥变量和持久卷。WebSocket同时按账号解析owner与保留新的retain_calibration生命周期；退出登录仍销毁该账号当前视觉run与内存参考。登录账号下的真实原引擎合成特征测试覆盖完整校准、suspend、5秒复核、退出清理和重新登录后的完整校准。

原有219项后端测试与60项前端测试通过，新增账号校准兼容测试单独验证。此次不修改数据库表结构，也不移动原/data卷或重新设置密钥。

## GitHub 7007058 更新合并

本次合入主线 `7007058`，保留账号归属、每日调用额度、安全 Cookie、同源代理和单 worker。迟到视觉包只丢弃该包，连接重试保留同授权的完整校准参考；服务端 `lesson_ready` 允许已准备课程继续文字交流，但断线时传给模型的视觉摘要仍为不可用。退出仍撤销连接并清空该账号的视觉参考。完整协议与复用期限见[模块18](18-calibration-reuse.md)。

本次不修改数据库表结构，不迁移 `/data`，不覆盖秘密变量。本次发布前通过224项后端测试、64项前端测试、TypeScript、视觉资源校验和Next生产构建。未进行实体摄像头或真实模型调用的本次端到端验证；发布状态以Railway健康检查与部署元数据为准，合入来源见 `deploy/release.json`。
