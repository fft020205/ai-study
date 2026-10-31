"""Current support needs and evidence, independent of UI wording or model providers."""
import json
import time
from .dialogue import STATE_TTL_SECONDS,STATE_TTL_TURNS


def current_claim(s,name,now):
    claim=s.get('learner_state',{}).get(name,{})
    if (claim.get('source') not in ('self_report','correction','task_answer') or not claim.get('quote')
        or not isinstance(claim.get('at'),(int,float)) or not 0<=now-claim['at']<STATE_TTL_SECONDS
        or not isinstance(claim.get('turn'),int) or not 0<=s.get('dialogue_turn',0)-claim['turn']<=STATE_TTL_TURNS):return None
    if name!='cognition' and claim['source']=='task_answer':return None
    return claim


def support_context(s,visual=None,now=None,fallback='general'):
    now=time.time() if now is None else now
    claims={name:current_claim(s,name,now) for name in ('fatigue','cognitive_load','cognition')}
    signals=[]
    for name,value,kind in [('fatigue','present','fatigue'),('cognitive_load','high','cognitive_load'),('cognition','difficulty','difficulty')]:
        claim=claims[name]
        if claim and claim['value']==value and (name=='cognition' or claim['source']!='task_answer'):
            signals.append({'kind':kind,'source':claim['source'],'evidence_quote':claim['quote'],'tentative':False})
    if visual and visual.get('valid') and visual.get('calibrated'):
        hint=visual.get('support_hint')
        name='fatigue' if hint=='possible_fatigue' else 'cognitive_load'
        if hint in ('possible_fatigue','possible_overload') and not claims[name]:
            signals.append({'kind':name,'source':'visual_behavior','tentative':True})
    # Keep combined needs, while prioritising rest and information load over a task-specific obstacle.
    order={'fatigue':0,'cognitive_load':1,'difficulty':2}
    signals.sort(key=lambda item:order[item['kind']])
    return {'kind':signals[0]['kind'] if signals else fallback,'signals':signals}


def episode_context(s,visual=None,now=None):
    episode=s.get('episode') or {}
    target=episode.get('pending_context') if s.get('pending_event')=='support' else None
    kind=(target or episode).get('kind',episode.get('reason'))
    return support_context(s,visual,now,fallback='waiting' if kind=='waiting' else 'general')


def support_key(s,context):
    # Compare meaningful needs and the current question, never every camera sample or score.
    return json.dumps([s['question_key'],context['kind'],sorted((v['kind'],v['source']) for v in context['signals'])],ensure_ascii=False)


def support_state_key(context):
    # Source changes and camera score jitter do not count as a different support need.
    kinds=sorted({item['kind'] for item in context['signals']})
    return json.dumps(kinds or [context['kind']],ensure_ascii=False)


def support_round(s):
    turn=s.get('dialogue_turn',0);stored=s.get('support_round',{})
    if stored.get('turn')!=turn:return {'turn':turn,'states':[],'attempts':{}}
    return {'turn':turn,'states':list(stored.get('states',[])),'attempts':dict(stored.get('attempts',{}))}


def record_support_attempt(s,context,now):
    budget=support_round(s);budget['attempts'][support_state_key(context)]=now;s['support_round']=budget


def record_support_generation(s,context):
    budget=support_round(s);key=support_state_key(context)
    if key not in budget['states']:budget['states'].append(key)
    s['support_round']=budget
