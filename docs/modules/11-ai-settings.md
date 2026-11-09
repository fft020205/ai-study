# 11 · AI 接口设置与本机配置管理

## 职责与文件

提供用户可以直接操作的第三方 AI 接入表单：API 地址、密钥、模型名、超时；保存即时生效、重启保留、单次连接测试。没有真实配置就保持不可用。

- `apps/web/src/features/settings/AIConnectionSettings.tsx`：可复用配置表单。
- `apps/web/src/app/settings/ai/page.tsx`：可直接访问的 `/settings/ai` 页面。
- `components/Shell.tsx`、`app/page.tsx`、`ConsentPanel.tsx`：显式入口与配置成功后的能力刷新。
- `services/api/study/ai_connection.py`：输入验证、私有持久化、Provider创建、连接测试。
- `services/api/study/main.py`：路由、访问限制、运行中切换。
- `services/api/tests/test_ai_connection.py`：合同、秘密保护、持久化与访问测试。

## 操作入口

地址：<http://127.0.0.1:3000/settings/ai>。从右上角访客菜单中的“AI 接口设置”或未接入提示中的“配置 AI 接口”打开。表单沿用 Figma 配色/字体/间距；用户要求新增此入口，原Figma没有该表单画板。

1. 接口类型选择“OpenAI 兼容接口”。
2. 填入服务商 Base URL（保留服务商要求的 `/v1` 等路径），支持完整 `/chat/completions` 地址自动规范化。
3. 填API Key和服务商准确的模型标识。
4. 可点击“测试连接”，再点击“保存并生效”；也可直接保存。
5. 回到学习页发送自己的回答。

测试会产生一次模型请求，可能收费，界面明确说明；只发送固定 `connection_test`，不发送学习记录。保存动作不调用第三方。成功配置状态仅表示参数齐全，不能冒充连接测试通过。

## 接口合同

所有接口同源 `/api`，需 `X-Study-Client: web-v1`，仅本机允许。

`GET /api/settings/ai` 返回：

```json
{"provider":"none","base_url":"https://api.openai.com/v1","model":"","has_api_key":false,"timeout_seconds":45,"configured":false,"load_error":false}
```

`PUT /api/settings/ai` 接收：

```json
{"provider":"openai","base_url":"https://your-provider.example/v1","model":"your-model-id","api_key":"用户填写的密钥","timeout_seconds":45}
```

返回同GET，绝不返回现有密钥。provider目前仅允许none/openai；环境中已有deeptutor仍能被读取，但DeepTutor的WS/token继续用环境配置。

- 密钥未传、null或空串：保留已存值。
- 更换地址：必须提供新密钥，避免把旧凭证发送到新目标。
- `clear_api_key: true`：清除密钥；只能在provider为none时保存，否则报参数不足。当前页面停用会保留密钥方便恢复，需要清除可调用该合同。
- `POST /api/settings/ai/test` 接受同样的草稿结构，但不保存。向 `<base>/chat/completions` 发送JSON模式请求，验证返回 `{"ok":true}`；返回ok/latency_ms/message。
- 地址只允许HTTPS；回环本机开发可HTTP。地址禁止内嵌账号、query、fragment及控制字符。超时1–120秒。
- 无效格式422、业务/存储/测试失败400、非本机403；均不返回密钥或上游响应体。

## 配置存储与优先级

默认 `data/ai-connection.json`，可用 `AI_CONFIG_PATH` 修改。启动先读取环境/.env，再应用该文件。保存文件权限600，通过临时文件+fsync+原子替换写入，成功后才换运行Provider；写入失败保留旧连接。

密钥是后端本机文件中的明文，按私有配置管理，不是加密密钥库。文件在gitignore的data目录，禁止复制到public、提交Git或用于浏览器缓存。页面仅保留尚未提交的密钥输入，保存成功后清空。

文件损坏时不回显内容，显示load_error并继续环境配置；UI提示重新保存。停用provider保存为none，重启仍停用。用户原有.env和学习数据库不被改写。

## 并发与访问边界

新话轮使用最新TeachingService；已经开始的整段话轮保留旧实例，两次调用不会跨Provider混合。测试与保存不取消学习，但主页面进入设置会沿用现有暂停流程；草稿保留。

设置接口核查回环client/Host、Origin和转发来源以及产品头。启动脚本把两服务绑定127.0.0.1；这是本机管理入口，不支持多人管理员权限。`AI_SETTINGS_ENABLED=false`关闭接口。需要对公网部署时先补认证、HTTPS和凭证管理，不能通过允许公网Host绕过本机限制。

## 修改方式与验证

新增服务商协议优先改模块04 Provider；页面只维护OpenAI兼容协议字段。若扩展表单，应同步更新这里的Pydantic合同、前端类型、OpenAPI快照及错误脱敏测试。

运行 `npm test`、`npm run build`。浏览器检查访客菜单与未接入提示入口、三个字段、密码遮蔽、空密钥错误、保存成功即时状态与手机360px表单。真实第三方质量、费用和服务稳定性需配置真实凭证后由接入者验证。

## 动态课程调用时点

保存配置仍不触发模型；已配置后进入空课程会自动调用生成开场。发送文字/纠正通常调用评估与生成两次；提示、示范、换例子、继续探索和授权开启的主动支持也会调用。`/test`只验证连接和JSON输出，不代表完整自适应教学协议或语气质量已验证。


## 独立云端部署副本

托管模式强制关闭本机AI配置接口，普通用户不显示配置表单；真实密钥使用平台运行时秘密变量，未绑定云端前不能称为部署完成。见19-hosted-deployment.md。
