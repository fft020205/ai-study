export const zhCN = {
  metadata: {
    title: '学习助手 · 每次一件小事',
    description: '按自己的节奏，推理、验证与学习。'
  },
  language: {label: '界面语言', zh: '简体中文', en: 'English'},
  common: {
    appName: '学习助手', back: '返回', retry: '重试', close: '关闭',
    configureAI: '配置 AI 接口', aiSettings: 'AI 接口设置', privacy: '隐私与数据'
  },
  shell: {
    closeNavigation: '关闭导航', openNavigation: '打开导航', navigation: '学习导航',
    home: '学习助手首页', newLearning: '开始新的学习', history: '历史记录',
    control: '这次学习，由你掌控', cameraOn: '摄像头已开启', cameraOff: '摄像头未开启',
    supportOn: '主动支持已开启', supportPaused: '主动支持已暂停', supportOff: '主动支持未开启',
    privacy: '隐私与数据说明', openAccount: '打开账户菜单', guest: '访客 · 本机学习记录',
    avatar: '访', endSession: '结束本次学习',
    breadcrumb: {
      variable: '追踪旧值与交换', mean: '按人数理解平均数', causality: '从差异走向证据'
    }
  },
  history: {
    label: '历史记录', empty: '学习记录会保存在这里', open: '打开学习记录：{{title}}',
    manage: '管理记录：{{title}}', active: '进行中', ended: '已结束', rename: '重命名', delete: '删除',
    renameTitle: '重命名学习记录', deleteTitle: '删除这次学习记录？', name: '名称',
    nameHelp: '最多80个字符。',
    deleteWarning: '删除后，本产品内的对话、进度和同意记录将无法恢复。',
    saving: '正在保存…', deleting: '正在删除…', save: '保存名称', confirmDelete: '确认删除',
    cancel: '取消', keep: '保留记录'
  },
  tasks: {
    title: '今天，想弄懂什么？',
    descriptionDesktop: '选择一个约 8–10 分钟的小任务，和 AI 一起推理、验证。',
    descriptionMobile: '选一个短任务，和 AI 边聊边学。',
    duration: '约 8–10 分钟 · 可暂停', interestLabel: '想学习的主题',
    interestPlaceholder: '也可以先告诉我：你想从哪里开始？', start: '开始',
    fallback: '先从上面的三个小任务中选一个。其他主题会在后续加入。'
  },
  courses: {
    variable: {
      title: '编程变量', subtitle: '追踪旧值，修复交换', historyTitle: '{{title}}{{number}}',
      objectives: {
        copy: '赋值与复制', overwrite: '追踪旧值', swap: '暂存与迁移'
      }
    },
    mean: {
      title: '平均数', subtitle: '按人数加权，判断代表性', historyTitle: '{{title}}{{number}}',
      objectives: {
        weighted: '按人数加权', typical: '理解代表性', limits: '汇总信息的边界'
      }
    },
    causality: {
      title: '相关与因果', subtitle: '寻找替代解释，改进比较', historyTitle: '{{title}}{{number}}',
      objectives: {
        alternatives: '寻找替代解释', comparison: '改进比较', limits: '限定结论'
      }
    }
  },
  consent: {
    hostedStartTitle: '学习方式设置', hostedCameraData: '原始视频与人脸关键点留在浏览器；眨眼、视线和头部运动的派生特征会发送至站点后端，当前有效摘要会提供给 AI 服务。',
    editable: '随时可更改', beforeStart: '开始前 · 约 1 分钟', settingsTitle: '学习设置',
    startTitle: '监测方式与 API', settingsDescription: '关闭任一项，也可以继续学习。',
    selected: '已选：{{title}} · 约 8–10 分钟。首次均为关闭，可随时更改。',
    support: '主动支持', supportDescription: '在你可能卡住时，先确认，再给一点帮助。',
    camera: '摄像头与自览', cameraDescription: '显示自己的画面，分析眨眼、视线偏移和头部运动。',
    cameraRequirement: '需先开启主动支持；开启后先完成约1分钟校准，再开始 AI 对话。',
    notConnected: 'AI 服务尚未连接',
    notConnectedDescription: '配置 API 后，AI 会围绕所选课题生成开场、解释和提示，并根据交流调整节奏。',
    save: '保存并继续', start: '确认开始',
    noSessionDescription: '选择任务后，你可以分别决定是否开启主动支持与摄像头。',
    chooseTask: '选择学习任务'
  },
  aiSettings: {
    eyebrow: '连接你选择的模型', title: 'AI 接口设置',
    description: '填写服务商提供的地址、密钥和模型名。保存后立即生效。',
    loading: '正在读取配置…', configured: '当前已配置 AI 服务', notConfigured: '当前尚未启用 AI 服务',
    currentService: '当前服务：{{service}}。配置齐全不代表连接测试已通过。',
    disconnectedDescription: '连接后，课程开场、解释与提示都由模型生成。',
    provider: '接口类型', openAICompatible: 'OpenAI 兼容接口', disabled: '暂不启用',
    baseUrl: 'API 地址', baseUrlPlaceholder: 'https://服务商地址/v1',
    baseUrlHelp: '填写服务商的 Base URL；也可粘贴以 /chat/completions 结尾的完整地址。',
    apiKey: 'API 密钥', savedKeyPlaceholder: '已保存密钥；留空继续使用',
    apiKeyPlaceholder: '粘贴服务商提供的 API Key',
    apiKeyHelp: '密钥只保存在本机后端，不回显。更换 API 地址时需重新填写。',
    model: '模型名', modelPlaceholder: '填写服务商控制台中的模型标识', timeout: '请求超时（秒）',
    testNotice: '“测试连接”会向填写的服务发送一次简短请求，可能产生少量调用费用。测试不发送你的学习记录。',
    saving: '正在保存…', save: '保存并生效', testing: '正在测试…', test: '测试连接', back: '返回学习',
    feedback: {
      loadError: '之前保存的配置无法读取，请重新填写并保存。',
      saved: '已保存并生效。你可以返回学习页发送回答。',
      disabled: '已保存，AI 连接已停用。',
      testSuccess: '连接成功，模型已返回有效 JSON。用时 {{latency}} 秒。测试不会保存配置，请再点击“保存并生效”。'
    }
  },
  conversation: {
    readyTitle: '准备开始这次学习', connectTitle: '连接 AI 后开始对话',
    readyDescription: '可以让 AI 从这个课题开始，也可以直接写下你想讨论的问题。',
    connectDescription: '填写 API 地址、密钥和模型名后，AI 会围绕这个课题与你交流。',
    startAI: '让 AI 开始', logLabel: '学习对话', tableLabel: '表格，可横向滚动', assistant: '学习助手',
    hintSource: '课程提示', answerSource: '课程示范', taskSource: '学习任务',
    sendingLabel: '正在发送消息', thinkingLabel: 'AI 正在思考', sending: '正在发送', thinking: '正在思考',
    receiving: '正在接收的AI回复', sentButIncomplete: '消息已发送，AI 回复未完成。',
    notSent: '消息未发送。', replyIncomplete: 'AI 回复未完成。',
    regenerate: '重新生成回复', retrySend: '重试发送',
    protected: '主动提醒已暂停，继续输入即可恢复对话。',
    supportPaused: '主动支持已暂停，文字学习仍可继续。', resume: '恢复支持',
    support: '主动支持', defaultSupportTitle: '按你的节奏来',
    thinkingAction: '我还在思考', helpAction: '需要一点帮助', dismissAction: '暂时不用'
  },
  composer: {
    label: '写下你的想法', placeholder: '写下你的想法…', hint: '给我一点提示', send: '发送',
    disclaimer: 'AI 可能会出错。你可以纠正、拒绝或随时暂停支持。',
    disconnected: 'AI 尚未连接 · 输入会保留，连接服务后可发送'
  },
  lessonPreparation: {
    resumeTitle: '快速恢复学习', continuedTitle: '继续完成校准',
    resumeDescription: '已保留本次课程的校准。保持面部清晰可见，约 {{required}} 秒有效画面复核后即可继续。',
    continuedDescription: '之前的有效校准进度已保留。保持面部在画面中，完成剩余采样后即可继续。',
    revalidating: '快速复核中', recalibrate: '重新校准',
    label: '学习前摄像头校准', eyebrow: '正式学习前 · {{title}}', title: '先准备好，再开始',
    description: '请保持面部在画面中，自然眨眼。累计约 60 秒有效画面后，会自动进入 AI 对话。',
    baselineInsufficient: '画面基线不足，请重新校准', cameraError: '摄像头暂时无法开启，请检查权限或设备',
    recognitionInterrupted: '识别暂时中断，请重试', stopped: '摄像头已停止，请重新开启',
    preparingCamera: '正在准备摄像头', connecting: '正在连接识别服务',
    waiting: '等待有效画面，校准进度已保留', calibrating: '正在校准',
    seconds: '{{seconds}} / {{required}} 秒', progress: '学习前校准进度',
    progressValue: '已完成{{seconds}}秒有效采样，共{{required}}秒',
    progressHelp: '画面不清晰或未检测到人脸时，进度会暂停；校准期间 AI 不会出题。',
    retry: '重新连接摄像头', disable: '关闭摄像头，继续学习'
  },
  summary: {
    eyebrow: '本次学习已结束', title: '今天，向前走了一小步',
    stopped: '{{title}} · 摄像头与主动支持已停止。', practiced: '你练习了什么',
    topics: '本次围绕「{{title}}」展开交流，最近讨论「{{focus}}」。',
    completed_one: '完成了 {{count}} 道有作答证据的练习，其中 {{independent}} 道未使用解题提示。',
    completed_other: '完成了 {{count}} 道有作答证据的练习，其中 {{independent}} 道未使用解题提示。',
    none: '本次暂无已核对完成的练习；你仍可从历史记录回看交流内容。',
    caveat: '这次完成情况只反映本次练习，不代表已经完全掌握。',
    home: '返回任务', export: '导出本次记录', privacy: '查看本次数据与删除方式'
  },
  privacy: {
    hostedTextBody: '点击发送的文字与学习记录保存在站点服务器，按你的账号隔离，可跨设备登录查看。草稿仅保留在当前页面内存，刷新或离开会清除。使用公共设备后请退出登录。',
    hostedCameraBody: '视频和人脸关键点只在浏览器内处理，不发送、不保存。眨眼、视线偏移和头部运动的派生特征会通过加密连接发送至站点后端，在内存中进行视觉行为分析；当前有效摘要会提供给站点配置的 AI 服务。视觉提示不等于情绪或心理诊断。关闭摄像头、进入后台、退出登录或结束学习会停止采集并关闭连接。',
    hostedAiBody: '已提交文字、近期对话、当前练习及有依据的自述状态会发送至站点配置的第三方 AI 服务；开启摄像头时还包含当前有效的行为状态摘要。站点学习记录保留至你主动删除，第三方服务的保存与训练策略由其服务商规定。',
    eyebrow: '由你掌控', title: '隐私与数据说明', textTitle: '文字与学习记录',
    textBody: '只有点击发送的文字会进入产品服务。草稿保留在当前页面内存；刷新或离开会清除。访客身份以浏览器 Cookie 区分，请勿在公共设备上共享同一浏览器档案。',
    cameraTitle: '摄像头',
    cameraBody: '视频和人脸关键点只在浏览器内处理，不发送、不保存。眨眼频率、视线偏移和头部运动特征通过本机后端的视觉引擎判定，临时保存在内存；当前有效状态摘要会提供给你配置的AI服务。视觉行为提示不等于情绪或心理诊断。收起仅隐藏预览；关闭、后台或结束会停采并关闭视觉连接。同一课程和摄像头的校准参考只在本机内存临时保留，停止有效观测后最多保留15分钟，便于短时恢复；结束或撤销主动支持时清除，不保存照片或视频。',
    aiTitle: 'AI 服务与保留期限',
    aiBody: '连接 AI 后，已提交文字、近期对话、当前练习及有依据的自述状态会发送至配置的第三方服务。该服务的保存与训练设置须由接入者核实。当前本地学习记录保留至你主动删除，没有自动清理期限。',
    export: '导出这次学习', delete: '删除这次学习记录',
    deletionNote: '删除只覆盖本产品存储；已发送至第三方服务的记录需按服务商规则另行处理。'
  },
  correction: {
    title: '纠正我的理解', description: '以你的说明为准，当前题目会保留。',
    label: '你的纠正', placeholder: '其实，我现在是这样想的…', confirm: '确认纠正'
  },
  loading: {
    title: '学习助手', unavailable: '学习服务暂时不可用。', preparing: '正在准备学习空间…',
    retry: '重试连接', closeNotice: '关闭提示', close: '关闭'
  },
  camera: {
    waiting: '等待开启', stopped: '摄像头已停止', stoppedReopen: '已停止 · 点击重新开启',
    requesting: '正在请求摄像头…', error: '无法开启摄像头，请检查权限或设备。',
    aiOpinion: 'AI结合视觉与对话的暂定意见：{{reason}}',
    heuristicEvidence: '本机视觉行为引擎连续给出该启发式阶段；需要结合你的实际感受确认。',
    closedLabel: '摄像头已关闭', previewLabel: '摄像头自览', liveLabel: '你的实时摄像头画面',
    closing: '正在关闭…', opening: '正在开启…', open: '开启摄像头', reopen: '重新开启',
    onCompact: '● 已开启', you: '你', expand: '展开预览', collapse: '收起预览',
    collapseTitle: '收起不会关闭摄像头', close: '关闭摄像头',
    draggable: '可拖动摄像头窗口', move: '移动摄像头窗口', moveHelp: '拖动移动；方向键微调位置'
  },
  vision: {
    revalidating: '快速复核中', warming: '监测恢复中',
    preparationLabel: '视觉检测准备状态', loadingRuntime: '加载检测…', loadingModel: '准备模型…',
    checkingFrame: '等待有效画面', ready: '检测就绪', error: '检测不可用', slow: '加载较慢',
    seconds: '{{seconds}}秒', reload: '重新加载检测', progress: '视觉检测准备进度',
    analysisLabel: '视觉判定状态', behaviorEstimate: '视觉行为估计，仅供辅助参考',
    disconnected: '连接中断', connecting: '连接中…', recalibrate: '需要重新校准',
    waiting: '等待有效画面', paused: '校准暂停', calibrating: '正在校准', monitoring: '监测中',
    calibrationSeconds: '{{seconds}}/{{required}}秒', reconnect: '重新连接并校准', calibrationProgress: '个人基线校准进度',
    calibrationValue: '有效采样{{seconds}}秒，共{{required}}秒；画面无效时暂停'
  },
  alerts: {
    label: '学习状态提醒', visualSource: '视觉信号，待你确认', selfSource: '根据你的反馈',
    possibleFatigue: '可能疲劳', possibleHighLoad: '负荷可能偏高', fatigue: '有些疲劳', highLoad: '负荷偏高',
    selfDetail: '你说：“{{quote}}”', tagLabel: '{{label}}，{{source}}', tooltip: '{{source}}。{{detail}}'
  },
  errors: {
    serverVersionOutdated: '学习服务版本较旧，请重启项目后刷新页面。',
    invalidRequest: '请求参数无效，请检查后重试。',
    requestFailed: '请求未完成，请稍后重试。', operationFailed: '操作没有完成，请重试。',
    operationIncomplete: '操作未完成，请重试。',
    learningServiceOffline: '暂时无法连接学习服务，请确认项目已启动，然后重试。',
    replyInterrupted: '回复连接中断，请重试。', connectionRetry: '暂时无法连接，请重试。',
    recalibrateRetry: '摄像头需要重新校准，完成后可重试这条回复。',
    responseTooLarge: '回复数据过大，请重试。', sendFailed: '消息未能发送，请重试。',
    nonStreamingResponse: '服务未返回流式响应。', responseIdentityMismatch: '回复标识不一致，请重新连接。',
    aiReplyInterrupted: 'AI 回复中断，请重试。', invalidDelta: '流式正文格式不正确。',
    sessionStateMissing: '学习状态缺失，请重试。',
    localAIOnly: 'AI 接口设置仅限本机访问。', invalidOrigin: '请求来源无效。',
    invalidConfiguration: '配置格式无效，请检查地址、密钥、模型名和超时（1–120秒）。',
    sessionNotFound: '未找到这次学习。', sessionConflict: '学习状态已更新，请刷新后继续。',
    cancelledByAction: '这条回复已因你的新操作取消。', invalidAIResponse: 'AI 返回格式不正确，输入已保留。',
    requestFingerprintConflict: '相同请求标识不能对应不同内容。', emptyInput: '请输入内容。',
    sessionEnded: '这次学习已经结束。',
    aiNotConfiguredPreserved: 'AI 服务尚未连接。请配置第三方 API；你的输入已保留。',
    conversationAdvanced: '讨论已继续，请发送一条新消息。', previousReplyPending: '上一条回复仍在生成，请稍后重试。',
    aiNotConfiguredRetry: 'AI 服务尚未连接，请配置第三方 API 后重试。',
    cancelledByState: '这条回复已因学习状态变化取消。', replyCancelled: '这条回复已取消。',
    consentMissing: '缺少同意设置。', correctionMissing: '请写下希望纠正的内容。',
    teachingActionInvalid: '教学动作需要由 AI 对话接口生成。',
    calibrationRequired: '摄像头尚未完成校准，完成后即可开始对话。',
    apiWhitespace: 'API 地址不能包含空白或控制字符。',
    apiUrlInvalid: 'API 地址需为完整地址，不能包含账号、密钥、查询参数或片段。',
    apiHttpsRequired: 'API 地址需使用 HTTPS；本机开发服务可使用 HTTP。',
    apiPortInvalid: 'API 端口无效。', apiKeyInvalid: '密钥格式无效。',
    apiKeyRequiredOnUrlChange: '更换 API 地址时，请重新填写密钥。',
    apiKeyAndModelRequired: '请填写 API 密钥和模型名。',
    settingsSaveFailed: '配置保存失败，请检查项目数据目录的写入权限。',
    openAIRequired: '请先选择 OpenAI 兼容接口。',
    connectionTestFailed: '连接测试失败。请核对地址、密钥、模型名及 JSON 输出支持。',
    invalidTestJSON: '服务已响应，但未返回约定的 JSON，请检查模型的结构化输出支持。',
    aiProtocolConfiguration: 'AI 返回格式不符合接口约定，请检查服务配置。',
    aiNotConnectedInputPreserved: 'AI 服务尚未连接。请配置第三方 API 后再发送；你的输入已保留。',
    aiUnavailable: 'AI 服务暂时不可用。请稍后重试，或检查第三方 API 配置。',
    aiNotConnected: 'AI 服务尚未连接。',
    providerNotStreaming: '服务商未返回流式响应，请检查其 Chat Completions 流式兼容性。',
    aiStreamInterrupted: 'AI 流式连接中断，请重试。', invalidAIStream: 'AI 流式格式不正确。',
    incompleteAIReply: 'AI 回复未完整生成，请重试。', aiStreamEndedEarly: 'AI 流式连接提前结束，请重试。',
    aiStreamUnavailable: 'AI 流式连接中断。请稍后重试，或检查第三方 API 配置。',
    aiNotConnectedConfigure: 'AI 服务尚未连接，请先配置第三方 API。',
    deepTutorRejected: 'DeepTutor 拒绝了请求，请检查协议与内部配置。',
    deepTutorInterrupted: 'DeepTutor 连接中断或超时，输入已保留。',
    deepTutorIncomplete: 'DeepTutor 未返回完整结果。',
    invalidAIStreamContent: 'AI 流式内容格式不正确，请重试。',
    inconsistentAIResult: 'AI 流式正文与最终结果不一致。',
    coursePolicyViolation: 'AI 回复偏离当前课程约定，请重试。',
    discussionPositionViolation: 'AI 未保留当前讨论位置，请重试。',
    hintScopeViolation: 'AI 未遵守本轮提示范围，请重试。',
    supportAnswerViolation: '主动支持不能直接公布完整答案。',
    waitingChoiceViolation: 'AI 未遵守等待选择，请重试。',
    visionPacketInvalid: '有效画面必须包含特征，失效画面不能提供特征。',
    visionStaleOrOrdered: '视觉数据已过期或顺序无效。', visionOutsideValidity: '视觉数据不在有效时间范围内。',
    visionTooFrequent: '视觉数据发送过于频繁。', visionEngineUnavailable: '视觉判定引擎未安装或校验失败，请检查本机集成。',
    visionPermissionRequired: '请先开启摄像头和主动支持。', visionAuthorizationInvalid: '视觉授权无效。',
    visionRequestTooLarge: '视觉请求过大。', visionHandshakeInvalid: '视觉握手格式无效。',
    visionCredentialsExpired: '视觉连接凭据已失效，请重新开启。', visionSessionClosed: '视觉会话已关闭或授权已更新。'
  }
} as const;

export type TranslationShape<T> = {
  [K in keyof T]: T[K] extends string ? string : TranslationShape<T[K]>;
};
