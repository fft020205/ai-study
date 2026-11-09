# 08 · 数据存储与访客归属

## 实现

`study/storage.py`是唯一持久化边界。SQLAlchemy模型LearningRow包含id、owner、version、JSON state。默认SQLite文件`data/study.db`，首次启动create_all。对本机原型，减少额外数据库安装依赖；仍保持可替换Repository接口。

`DATABASE_URL=postgresql+psycopg://...`可切换驱动。该路径与迁移工具尚未实测，不应直接当作完成生产数据库部署。多用户版本应把messages、records、consents、requests拆成独立表并加入正式迁移。

## 身份与隔离

浏览器首次请求得到64字符随机HttpOnly、SameSite=Strict Cookie。服务器保存该token的SHA-256作为owner。请求不接受客户端自报user_id。所有读写、导出、删除带owner条件，不存在和不属于当前访客均404。

COOKIE_SECURE在HTTPS部署时必须开启。当前为同一浏览器档案的匿名访客，不是账户系统，不提供跨设备同步/找回。公共设备或共享Cookie不能获得个人账户级隔离。

## 写入与数据

更新使用`WHERE id AND owner AND version=expected`的CAS，影响行数非1则回滚409。AI不在事务内运行。state包含已提交消息、进度、提示记录、用户纠正、同意记录与最近100个成功请求摘要。

会话数据库不保存草稿、音视频、图片、人脸关键点、原始视觉特征、视觉摘要/判断或模型密钥。导出JSON只包括public session及consent_log。删除物理删除该会话；数据库备份/供应商日志不属于该接口管理范围。

当前JSON会话适合短任务，会话列表一次载入全部历史；大量使用时需分页、消息表与容量限制。

## 修改方式与测试

替换Repository需要保持create/get/list/save/delete语义与归属过滤。不得以仅前端过滤替代数据库owner约束。数据库模式变更必须提供迁移和备份说明，不能删除用户data解决问题。

相关测试：ownership_and_csrf、export_and_delete、answer_idempotency、并发取消。SQLite路径已经实测；PostgreSQL、备份恢复、多人压力测试尚未完成。

## 动态对话数据

JSON新增dialogue_version、focus_id、exercise、learner_state、dialogue_turn、assessment_log、pending_event等字段。exercise包含模型生成的参考答案/判据，仅服务器使用；assessment_log保留各轮带依据的暂定判断，不改写旧记录。公共session/export按白名单投影，不暴露这两类内部内容。

旧会话由learning.ensure_dialogue惰性升级，保留原content_version、消息、记录、授权。读取列表不会批量改写数据库，后续用户操作正常CAS保存；不删除或重建用户data。新增字段后同样遵守单worker与本地记录删除语义。

fatigue/cognitive_load作为已有learner_state和assessment_log中的自述维度保存，不新增视频/图像存储。camera_alerts由服务端读取时按时效投影，公共导出会包含当时有效的来源与自述原话；这两类原话也属于用户已提交的消息。删除会话同样删除这些本地状态与记录。

视觉引擎、基线、特征、ticket和LLM视觉解释只保留在当前API进程内存，关闭、断线、撤权、结束或重启后失效；不添加数据库迁移、不改写用户data。可见的模型回复可能提及暂定视觉线索，正常作为对话保存，不能据此承诺所有视觉相关文字均不留存。LLM收到的状态摘要由服务商按其策略处理。多worker部署前需先解决视觉run归属、共享撤权与清理，不能直接扩大worker数。

## 独立的历史名称元数据

名称元数据使用 session_titles(id,title,version)，新增 history_title_counters(owner,task_id,value) 管理每位访客每门课的持久序号。通过 create_all 增表，启动时为缺少名称元数据的旧记录补号，不改写旧学习 state 或重建数据。记录读取按会话归属过滤后合并名称；教学save排除custom_title/title_version，名称不会被迟到教学写入覆盖。rename验证会话owner，仅改名称版本；不提升教学版本、不重排updated_at。删除在同一事务删除名称与会话。接口、并发边界与测试见模块14。

SSE新增submitted_requests（最近100个请求的指纹/message_id）和Message.request_id，惰性保存在既有JSON中，无迁移。用户文字在accepted前持久化；失败后重试同ID不重复写入。只有完整结构与版本检查通过的助手消息才入库，partial不保存；未接收的乐观消息仅在当前页面内存。详见模块15。

新记录与自动名称在同一事务创建，编号采用原子 upsert/returning，遇到现有同名手动标题会跳号。自动标题版本0，实际重命名独立递增。删除会话保留纯编号计数以避免序号回退，既有记录不重新编号。旧记录补号按创建时间和id稳定分配，只更新显示元数据；详细合同和已验证 SQLite 并发范围见模块14。

支持卡额度新增私有 support_round={turn,states,attempts}，惰性保存在原会话JSON，无迁移。以dialogue_turn界定一轮，正常回复完成后逻辑重置，支持生成不推进轮次。旧episodes_count仍可审计但不设会话总限额；计数和尝试记录不进入public session/export，完整规则见模块05。


## 独立云端部署副本

托管副本新增accounts/account_logins/account_auth_attempts/account_daily_usage表。学习表结构不变，新账号不继承旧访客数据。数据库位于持久卷/data/study.db，详情见19-hosted-deployment.md。
