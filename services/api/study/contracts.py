from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator

class Contract(BaseModel):
    model_config = ConfigDict(extra='forbid')

Language = Literal['zh-CN', 'en']

class Consent(Contract):
    support: bool = False
    camera: bool = False

class CreateSession(Contract):
    language: Language = 'zh-CN'
    task_id: Literal['variable', 'mean', 'causality']
    consent: Consent = Field(default_factory=Consent)

class RenameSession(Contract):
    title: str = Field(max_length=80)

    @field_validator('title')
    @classmethod
    def clean_title(cls, value):
        value=value.strip()
        if not value or any(ord(c)<32 or ord(c)==127 for c in value):
            raise ValueError('名称不能为空，也不能包含换行或控制字符。')
        return value

class Answer(Contract):
    language: Language | None = None
    text: str = Field(default='', max_length=4000)
    event: Literal['message', 'open', 'hint', 'answer', 'continue', 'skip'] = 'message'
    version: int = Field(ge=0)
    request_id: str = Field(min_length=8, max_length=80)

class StreamAnswer(Answer):
    event: Literal['message','open','hint','answer','continue','skip','correct'] = 'message'

class Control(Contract):
    language: Language | None = None
    action: Literal['open', 'hint', 'answer', 'continue', 'skip', 'think', 'reject', 'pause', 'resume', 'end', 'correct', 'consent']
    version: int = Field(ge=0)
    text: str = Field(default='', max_length=1000)
    consent: Consent | None = None

class Activity(Contract):
    language: Language | None = None
    version: int = Field(ge=0)
    # No draft text, keystroke detail, audio or landmarks in the telemetry contract.
    foreground: bool
    has_draft: bool
    composing: bool
    busy: bool
    reading: bool

class Evaluation(Contract):
    # Semantic check only when server marks generated exercise metadata unverified.
    reference_applicable: bool | None = None
    verdict: Literal['supported', 'incorrect', 'insufficient', 'unknown']
    evidence_quote: str = Field(default='', max_length=1000)
    misconception: str = Field(default='', max_length=100)
    feedback: str = Field(max_length=600)

class StateClaim(Contract):
    value: str = Field(default='unknown', max_length=40)
    quote: str = Field(default='', max_length=1000)

class TurnAssessment(Contract):
    evaluation: Evaluation
    intent: Literal['answer','question','help','example','continue','thinking','feeling','off_topic','pause','end','reject','unknown'] = 'unknown'
    intent_quote: str = Field(default='', max_length=1000)
    correction_quote: str = Field(default='', max_length=1000)
    cognition: StateClaim = Field(default_factory=StateClaim)
    valence: StateClaim = Field(default_factory=StateClaim)
    pressure: StateClaim = Field(default_factory=StateClaim)
    fatigue: StateClaim = Field(default_factory=StateClaim)
    cognitive_load: StateClaim = Field(default_factory=StateClaim)

class Exercise(Contract):
    prompt: str = Field(min_length=1, max_length=2000)
    reference: str = Field(min_length=1, max_length=2000)
    rubric: str = Field(min_length=1, max_length=2000)

class VisualJudgment(Contract):
    state: Literal['possible_fatigue','possible_overload','no_concern','uncertain']
    reason: str = Field(min_length=1,max_length=300)

class DialogueReply(Contract):
    reply: str = Field(min_length=1, max_length=4000)
    focus_id: str = Field(min_length=1, max_length=60)
    move: Literal['invite','explain','hint','example','practice','reflect','wait','redirect']
    exercise_action: Literal['keep','replace','clear']
    exercise: Exercise | None = None
    # Measures assistance actually given, including help requested in natural language.
    assistance: Literal['none','hint','answer'] = 'none'
    visual_judgment: VisualJudgment | None = None
    support_title: str | None = Field(default=None,max_length=40)
