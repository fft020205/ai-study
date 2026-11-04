import type {TranslationShape} from './zh-CN';
import {zhCN} from './zh-CN';

export const en: TranslationShape<typeof zhCN> = {
  metadata: {
    title: 'Learning Assistant · One Small Step at a Time',
    description: 'Reason, verify, and learn at your own pace.'
  },
  language: {label: 'Interface language', zh: '简体中文', en: 'English'},
  common: {
    appName: 'Learning Assistant', back: 'Back', retry: 'Retry', close: 'Close',
    configureAI: 'Configure AI API', aiSettings: 'AI API Settings', privacy: 'Privacy & Data'
  },
  shell: {
    closeNavigation: 'Close navigation', openNavigation: 'Open navigation', navigation: 'Learning navigation',
    home: 'Learning Assistant home', newLearning: 'New learning session', history: 'History',
    control: 'You are in control of this session', cameraOn: 'Camera on', cameraOff: 'Camera off',
    supportOn: 'Proactive support on', supportPaused: 'Proactive support paused', supportOff: 'Proactive support off',
    privacy: 'Privacy and data information', openAccount: 'Open account menu', guest: 'Guest · Learning records on this device',
    avatar: 'G', endSession: 'End this learning session',
    breadcrumb: {
      variable: 'Track previous values and swaps', mean: 'Understand means through group sizes', causality: 'From differences to evidence'
    }
  },
  history: {
    label: 'History', empty: 'Your learning records will appear here', open: 'Open learning record: {{title}}',
    manage: 'Manage record: {{title}}', active: 'In progress', ended: 'Ended', rename: 'Rename', delete: 'Delete',
    renameTitle: 'Rename learning record', deleteTitle: 'Delete this learning record?', name: 'Name',
    nameHelp: 'Up to 80 characters.',
    deleteWarning: 'Deleting this record permanently removes its conversations, progress, and consent records from this product.',
    saving: 'Saving…', deleting: 'Deleting…', save: 'Save name', confirmDelete: 'Delete record',
    cancel: 'Cancel', keep: 'Keep record'
  },
  tasks: {
    title: 'What would you like to understand today?',
    descriptionDesktop: 'Choose an 8–10 minute task and reason through it with AI.',
    descriptionMobile: 'Choose a short task and learn through a conversation with AI.',
    duration: 'About 8–10 min · Pausable', interestLabel: 'Topic you want to learn',
    interestPlaceholder: 'Or tell me where you would like to start', start: 'Start',
    fallback: 'Choose one of the three tasks above. More topics will be added later.'
  },
  courses: {
    variable: {
      title: 'Programming Variables', subtitle: 'Track previous values and fix swaps', historyTitle: '{{title}} {{number}}',
      objectives: {
        copy: 'Assignment and copying', overwrite: 'Track previous values', swap: 'Temporary storage and transfer'
      }
    },
    mean: {
      title: 'Averages', subtitle: 'Weight by group size and assess representativeness', historyTitle: '{{title}} {{number}}',
      objectives: {
        weighted: 'Weight by group size', typical: 'Understand representativeness', limits: 'Limits of summarized information'
      }
    },
    causality: {
      title: 'Correlation & Causation', subtitle: 'Find alternative explanations and improve comparisons', historyTitle: '{{title}} {{number}}',
      objectives: {
        alternatives: 'Find alternative explanations', comparison: 'Improve comparisons', limits: 'Qualify conclusions'
      }
    }
  },
  consent: {
    editable: 'Change anytime', beforeStart: 'Before you start · About 1 minute', settingsTitle: 'Learning Settings',
    startTitle: 'Monitoring & API', settingsDescription: 'You can continue learning with either option turned off.',
    selected: 'Selected: {{title}} · About 8–10 minutes. Both options are off by default and can be changed anytime.',
    support: 'Proactive support', supportDescription: 'When you might be stuck, AI checks in before offering a little help.',
    camera: 'Camera & self-view', cameraDescription: 'See yourself while analyzing blinks, gaze shifts, and head movement.',
    cameraRequirement: 'Requires proactive support. Complete about 1 minute of calibration before starting the AI conversation.',
    notConnected: 'AI service not connected',
    notConnectedDescription: 'After you configure an API, AI will generate openings, explanations, and hints for the selected topic and adapt to your conversation.',
    save: 'Save and continue', start: 'Confirm and start',
    noSessionDescription: 'After choosing a task, you can decide separately whether to enable proactive support and the camera.',
    chooseTask: 'Choose a learning task'
  },
  aiSettings: {
    eyebrow: 'Connect the model of your choice', title: 'AI API Settings',
    description: 'Enter the endpoint, API key, and model name from your provider. Changes take effect when saved.',
    loading: 'Loading configuration…', configured: 'AI service configured', notConfigured: 'AI service not enabled',
    currentService: 'Current service: {{service}}. A complete configuration does not mean the connection test has passed.',
    disconnectedDescription: 'Once connected, the model generates lesson openings, explanations, and hints.',
    provider: 'API type', openAICompatible: 'OpenAI-compatible API', disabled: 'Do not enable',
    baseUrl: 'API endpoint', baseUrlPlaceholder: 'https://provider-endpoint/v1',
    baseUrlHelp: 'Enter the provider’s Base URL, or paste a full URL ending in /chat/completions.',
    apiKey: 'API key', savedKeyPlaceholder: 'Key saved; leave blank to keep using it',
    apiKeyPlaceholder: 'Paste the API key from your provider',
    apiKeyHelp: 'The key is stored only in the local backend and is never displayed again. Enter it again when changing the API endpoint.',
    model: 'Model name', modelPlaceholder: 'Enter the model identifier from your provider console', timeout: 'Request timeout (seconds)',
    testNotice: '“Test connection” sends a short request to the configured service and may incur a small usage charge. It does not send your learning records.',
    saving: 'Saving…', save: 'Save and apply', testing: 'Testing…', test: 'Test connection', back: 'Back to learning',
    feedback: {
      loadError: 'The saved configuration could not be loaded. Enter it again and save.',
      saved: 'Saved and applied. You can return to the learning page and send a response.',
      disabled: 'Saved. The AI connection is disabled.',
      testSuccess: 'Connected successfully. The model returned valid JSON in {{latency}} seconds. Testing does not save the configuration; click “Save and apply” to save it.'
    }
  },
  conversation: {
    readyTitle: 'Ready to start this learning session', connectTitle: 'Connect AI to start a conversation',
    readyDescription: 'Let AI begin with this topic, or write down the question you want to discuss.',
    connectDescription: 'After entering an API endpoint, key, and model name, AI can discuss this topic with you.',
    startAI: 'Let AI begin', logLabel: 'Learning conversation', tableLabel: 'Scrollable table', assistant: 'Learning Assistant',
    hintSource: 'Lesson hint', answerSource: 'Lesson example', taskSource: 'Learning task',
    sendingLabel: 'Sending message', thinkingLabel: 'AI is thinking', sending: 'Sending', thinking: 'Thinking',
    receiving: 'AI response being received', sentButIncomplete: 'Message sent, but the AI response is incomplete.',
    notSent: 'Message not sent.', replyIncomplete: 'AI response incomplete.',
    regenerate: 'Regenerate response', retrySend: 'Retry sending',
    protected: 'Proactive reminders are paused. Keep typing to resume the conversation.',
    supportPaused: 'Proactive support is paused. You can still learn through text.', resume: 'Resume support',
    support: 'Proactive support', defaultSupportTitle: 'Go at your own pace',
    thinkingAction: 'I’m still thinking', helpAction: 'I need a hint', dismissAction: 'Not now'
  },
  composer: {
    label: 'Write your thoughts', placeholder: 'Write your thoughts…', hint: 'Give me a hint', send: 'Send',
    disclaimer: 'AI can make mistakes. You can correct it, reject suggestions, or pause support anytime.',
    disconnected: 'AI not connected · Your input will be kept until you connect a service and send it'
  },
  lessonPreparation: {
    label: 'Camera calibration before learning', eyebrow: 'Before learning · {{title}}', title: 'Get ready before you begin',
    description: 'Keep your face in frame and blink naturally. The AI conversation will start after about 60 seconds of valid footage.',
    baselineInsufficient: 'Insufficient baseline footage. Recalibrate.', cameraError: 'The camera cannot start. Check permissions or your device.',
    recognitionInterrupted: 'Recognition was interrupted. Try again.', stopped: 'Camera stopped. Turn it on again.',
    preparingCamera: 'Preparing camera', connecting: 'Connecting to recognition service',
    waiting: 'Waiting for valid footage. Calibration progress is preserved.', calibrating: 'Calibrating',
    seconds: '{{seconds}} / 60 sec', progress: 'Pre-learning calibration progress',
    progressValue: '{{seconds}} of 60 seconds of valid sampling completed',
    progressHelp: 'Progress pauses when footage is unclear or no face is detected. AI will not introduce exercises during calibration.',
    retry: 'Turn on camera and recalibrate', disable: 'Turn off camera and continue learning'
  },
  summary: {
    eyebrow: 'Learning session ended', title: 'One small step forward today',
    stopped: '{{title}} · Camera and proactive support are off.', practiced: 'What you practiced',
    topics: 'This session focused on “{{title}}”, with the most recent discussion on “{{focus}}”.',
    completed_one: 'Completed {{count}} exercise with response evidence, including {{independent}} completed without solution hints.',
    completed_other: 'Completed {{count}} exercises with response evidence, including {{independent}} completed without solution hints.',
    none: 'No exercises were verified as complete in this session. You can still review the conversation in your history.',
    caveat: 'This completion summary reflects only this session and does not mean the topic has been fully mastered.',
    home: 'Back to tasks', export: 'Export this record', privacy: 'View this session’s data and deletion options'
  },
  privacy: {
    eyebrow: 'You are in control', title: 'Privacy & Data', textTitle: 'Text and learning records',
    textBody: 'Only text you click to send enters the product service. Drafts stay in the current page’s memory and are cleared when you refresh or leave. Guest identities are distinguished by browser cookies; do not share the same browser profile on a public device.',
    cameraTitle: 'Camera',
    cameraBody: 'Video and facial landmarks are processed only in your browser and are never sent or saved. Blink rate, gaze shifts, and head movement features are assessed by the local backend’s vision engine and temporarily stored in memory. A summary of the current valid state is provided to your configured AI service. Visual behavioral cues are not emotional or psychological diagnoses. Collapsing only hides the preview; turning off the camera, moving to the background, or ending the session stops collection and closes the vision connection.',
    aiTitle: 'AI services and retention',
    aiBody: 'After AI is connected, submitted text, recent conversations, the current exercise, and evidence-based self-reported states are sent to the configured third-party service. The integrator must verify that provider’s retention and training settings. Local learning records are kept until you delete them; there is no automatic cleanup period.',
    export: 'Export this learning session', delete: 'Delete this learning record',
    deletionNote: 'Deletion covers only this product’s storage. Records already sent to third-party services must be handled separately under each provider’s policies.'
  },
  correction: {
    title: 'Correct my understanding', description: 'Your explanation takes precedence. The current exercise will be kept.',
    label: 'Your correction', placeholder: 'Actually, this is how I understand it now…', confirm: 'Confirm correction'
  },
  loading: {
    title: 'Learning Assistant', unavailable: 'The learning service is temporarily unavailable.', preparing: 'Preparing your learning space…',
    retry: 'Retry connection', closeNotice: 'Dismiss notification', close: 'Close'
  },
  camera: {
    waiting: 'Waiting to turn on', stopped: 'Camera stopped', stoppedReopen: 'Stopped · Click to turn on again',
    requesting: 'Requesting camera access…', error: 'The camera cannot start. Check permissions or your device.',
    aiOpinion: 'AI’s tentative assessment based on vision and conversation: {{reason}}',
    heuristicEvidence: 'The local visual behavior engine has repeatedly indicated this heuristic stage. Confirm it against how you actually feel.',
    closedLabel: 'Camera off', previewLabel: 'Camera self-view', liveLabel: 'Your live camera feed',
    closing: 'Turning off…', opening: 'Turning on…', open: 'Turn on camera', reopen: 'Turn on again',
    onCompact: '● On', you: 'You', expand: 'Expand preview', collapse: 'Collapse preview',
    collapseTitle: 'Collapsing does not turn off the camera', close: 'Turn off camera',
    draggable: 'Draggable camera window', move: 'Move camera window', moveHelp: 'Drag to move; use arrow keys to fine-tune the position'
  },
  vision: {
    preparationLabel: 'Vision detection preparation status', loadingRuntime: 'Loading detection…', loadingModel: 'Preparing model…',
    checkingFrame: 'Waiting for a valid frame', ready: 'Detection ready', error: 'Detection unavailable', slow: 'Loading is taking longer',
    seconds: '{{seconds}} sec', reload: 'Reload detection', progress: 'Vision detection preparation progress',
    analysisLabel: 'Vision assessment status', behaviorEstimate: 'Visual behavior estimate for supplementary reference only',
    disconnected: 'Disconnected', connecting: 'Connecting…', recalibrate: 'Recalibration required',
    waiting: 'Waiting for valid footage', paused: 'Calibration paused', calibrating: 'Calibrating', monitoring: 'Monitoring',
    calibrationSeconds: '{{seconds}}/60 sec', reconnect: 'Reconnect and recalibrate', calibrationProgress: 'Personal baseline calibration progress',
    calibrationValue: '{{seconds}} of 60 seconds of valid sampling; pauses for invalid footage'
  },
  alerts: {
    label: 'Learning status reminder', visualSource: 'Visual signal; awaiting your confirmation', selfSource: 'Based on your feedback',
    possibleFatigue: 'Possible fatigue', possibleHighLoad: 'Possibly high load', fatigue: 'Somewhat fatigued', highLoad: 'High load',
    selfDetail: 'You said: “{{quote}}”', tagLabel: '{{label}}, {{source}}', tooltip: '{{source}}. {{detail}}'
  },
  errors: {
    serverVersionOutdated: 'The learning service is out of date. Restart the project, then refresh this page.',
    invalidRequest: 'Invalid request parameters. Please check and try again.',
    requestFailed: 'The request could not be completed. Please try again later.', operationFailed: 'The action could not be completed. Please try again.',
    operationIncomplete: 'The action was not completed. Please try again.',
    learningServiceOffline: 'The learning service is unavailable. Make sure the project is running, then try again.',
    replyInterrupted: 'The response connection was interrupted. Please try again.', connectionRetry: 'Unable to connect. Please try again.',
    recalibrateRetry: 'The camera needs recalibration. Complete it before retrying this response.',
    responseTooLarge: 'The response is too large. Please try again.', sendFailed: 'The message could not be sent. Please try again.',
    nonStreamingResponse: 'The service did not return a streaming response.', responseIdentityMismatch: 'Response identifiers do not match. Reconnect and try again.',
    aiReplyInterrupted: 'The AI response was interrupted. Please try again.', invalidDelta: 'The streaming content has an invalid format.',
    sessionStateMissing: 'Learning state is missing. Please try again.',
    localAIOnly: 'AI API settings are available only from this device.', invalidOrigin: 'Invalid request origin.',
    invalidConfiguration: 'Invalid configuration. Check the endpoint, key, model name, and timeout (1–120 seconds).',
    sessionNotFound: 'This learning session was not found.', sessionConflict: 'Learning state has changed. Refresh to continue.',
    cancelledByAction: 'This response was cancelled by your new action.', invalidAIResponse: 'The AI returned an invalid format. Your input has been preserved.',
    requestFingerprintConflict: 'The same request identifier cannot be used for different content.', emptyInput: 'Enter some content.',
    sessionEnded: 'This learning session has ended.',
    aiNotConfiguredPreserved: 'AI is not connected. Configure a third-party API. Your input has been preserved.',
    conversationAdvanced: 'The discussion has moved on. Send a new message.', previousReplyPending: 'The previous response is still being generated. Please try again shortly.',
    aiNotConfiguredRetry: 'AI is not connected. Configure a third-party API and try again.',
    cancelledByState: 'This response was cancelled because the learning state changed.', replyCancelled: 'This response was cancelled.',
    consentMissing: 'Consent settings are missing.', correctionMissing: 'Describe what you want to correct.',
    teachingActionInvalid: 'Teaching actions must be generated through the AI conversation API.',
    calibrationRequired: 'Camera calibration is incomplete. Complete it to start the conversation.',
    apiWhitespace: 'The API endpoint cannot contain whitespace or control characters.',
    apiUrlInvalid: 'Enter a complete API endpoint without credentials, keys, query parameters, or fragments.',
    apiHttpsRequired: 'The API endpoint must use HTTPS. HTTP is allowed for local development services.',
    apiPortInvalid: 'Invalid API port.', apiKeyInvalid: 'Invalid API key format.',
    apiKeyRequiredOnUrlChange: 'Enter the API key again when changing the API endpoint.',
    apiKeyAndModelRequired: 'Enter an API key and model name.',
    settingsSaveFailed: 'Could not save the configuration. Check write permissions for the project data directory.',
    openAIRequired: 'Select an OpenAI-compatible API first.',
    connectionTestFailed: 'Connection test failed. Check the endpoint, key, model name, and JSON output support.',
    invalidTestJSON: 'The service responded but did not return the expected JSON. Check the model’s structured output support.',
    aiProtocolConfiguration: 'The AI response does not follow the API contract. Check the service configuration.',
    aiNotConnectedInputPreserved: 'AI is not connected. Configure a third-party API before sending. Your input has been preserved.',
    aiUnavailable: 'AI is temporarily unavailable. Try again later or check the third-party API configuration.',
    aiNotConnected: 'AI is not connected.',
    providerNotStreaming: 'The provider did not return a streaming response. Check its Chat Completions streaming compatibility.',
    aiStreamInterrupted: 'The AI streaming connection was interrupted. Please try again.', invalidAIStream: 'The AI stream has an invalid format.',
    incompleteAIReply: 'The AI response was not fully generated. Please try again.', aiStreamEndedEarly: 'The AI streaming connection ended early. Please try again.',
    aiStreamUnavailable: 'The AI streaming connection was interrupted. Try again later or check the third-party API configuration.',
    aiNotConnectedConfigure: 'AI is not connected. Configure a third-party API first.',
    deepTutorRejected: 'DeepTutor rejected the request. Check the protocol and internal configuration.',
    deepTutorInterrupted: 'The DeepTutor connection was interrupted or timed out. Your input has been preserved.',
    deepTutorIncomplete: 'DeepTutor did not return a complete result.',
    invalidAIStreamContent: 'The AI streaming content has an invalid format. Please try again.',
    inconsistentAIResult: 'The AI streaming content does not match the final result.',
    coursePolicyViolation: 'The AI response departed from the current lesson policy. Please try again.',
    discussionPositionViolation: 'The AI did not preserve the current discussion position. Please try again.',
    hintScopeViolation: 'The AI did not follow the hint scope for this turn. Please try again.',
    supportAnswerViolation: 'Proactive support cannot reveal a complete answer directly.',
    waitingChoiceViolation: 'The AI did not respect the waiting choice. Please try again.',
    visionPacketInvalid: 'Valid frames must include features; invalid frames cannot include features.',
    visionStaleOrOrdered: 'Vision data is stale or out of sequence.', visionOutsideValidity: 'Vision data is outside its valid time range.',
    visionTooFrequent: 'Vision data is being sent too frequently.', visionEngineUnavailable: 'The vision assessment engine is missing or failed verification. Check the local integration.',
    visionPermissionRequired: 'Turn on the camera and proactive support first.', visionAuthorizationInvalid: 'Invalid vision authorization.',
    visionRequestTooLarge: 'The vision request is too large.', visionHandshakeInvalid: 'Invalid vision handshake format.',
    visionCredentialsExpired: 'Vision connection credentials have expired. Turn the camera on again.', visionSessionClosed: 'The vision session is closed or its authorization has changed.'
  }
};
