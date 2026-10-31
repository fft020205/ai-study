"""Deterministic proactive-support eligibility; never infers emotions from inactivity."""
from dataclasses import dataclass
from .support import support_context,episode_context,support_key,support_state_key,support_round

@dataclass
class Window:
    since: float | None = None
    last_seen: float = 0
    question: str = ''
    turn: int | None = None

@dataclass
class StateWindow:
    key: str
    since: float
    last_seen: float

class SupportPolicy:
    def __init__(self, settings):
        self.settings = settings
        self.windows: dict[str, Window] = {}
        self.state_windows: dict[str, StateWindow] = {}

    def reset(self, sid):
        self.windows.pop(sid, None)
        self.state_windows.pop(sid, None)

    @staticmethod
    def evidence_key(s):
        return s['question_key'] + ':' + str(sum(m['source']=='submitted' for m in s['messages']))

    def can_generate(self,s,context):
        budget=support_round(s)
        return len(budget['states'])<self.settings.support_max_states_per_turn and support_state_key(context) not in budget['states']

    def can_attempt(self,s,context,now):
        last=support_round(s)['attempts'].get(support_state_key(context))
        return self.can_generate(s,context) and (last is None or now-last>=self.settings.support_retry_seconds)

    def observe(self, s, activity, now, visual=None):
        eligible = (s['status'] == 'active' and s['support_mode'] == 'on' and s['consent']['support'] and
                    bool(s['messages']) and s['messages'][-1].get('role')=='assistant' and not s['pending'] and not s['protected'] and not s['episode'] and
                    activity.version == s['version'] and activity.foreground and
                    not any([activity.has_draft, activity.composing, activity.busy, activity.reading]))
        if not eligible:
            self.windows.pop(s['id'],None); return None
        if s['question_key'] in s['dismissed_questions']: return None
        w = self.windows.setdefault(s['id'], Window())
        if w.question != s['question_key'] or w.turn!=s.get('dialogue_turn',0) or now - w.last_seen > 8 or w.since is None:
            w.since = now
        w.last_seen = now
        w.question = s['question_key'];w.turn=s.get('dialogue_turn',0)
        context=support_context(s,visual,now)
        if context['signals']:
            if not self.can_attempt(s,context,now):return None
            return 'visual_signal' if context['signals'][0]['source']=='visual_behavior' else context['kind']
        waiting=support_context(s,visual,now,fallback='waiting')
        if now - w.since >= self.settings.support_wait_seconds and self.can_attempt(s,waiting,now): return 'waiting'
        return None

    def refresh(self,s,activity,now,visual=None):
        episode=s.get('episode') or {}
        eligible=(bool(episode.get('text')) and s['status']=='active' and s['support_mode']=='on'
            and s['consent']['support'] and not s['pending'] and not s['protected']
            and activity.version==s['version'] and activity.foreground
            and not any([activity.has_draft,activity.composing,activity.busy,activity.reading]))
        if not eligible:
            self.state_windows.pop(s['id'],None);return None
        context=episode_context(s,visual,now);key=support_key(s,context)
        if not self.can_attempt(s,context,now):
            self.state_windows.pop(s['id'],None);return None
        if key==episode.get('context_key') and episode.get('generated_turn',s.get('dialogue_turn',0))==s.get('dialogue_turn',0):
            self.state_windows.pop(s['id'],None);return None
        window=self.state_windows.get(s['id'])
        if not window or window.key!=key or now-window.last_seen>8:
            window=StateWindow(key,now,now);self.state_windows[s['id']]=window
        window.last_seen=now
        if now-window.since<self.settings.support_state_stable_seconds:return None
        return context
