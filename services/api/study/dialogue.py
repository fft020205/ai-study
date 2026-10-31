"""Grounded learner state and bounded dialogue context. No generated wording here."""
import time
from .contracts import TurnAssessment, Evaluation
from .courses import course_for, focus_for, DIALOGUE_VERSION

STATE_TTL_SECONDS = 300
STATE_TTL_TURNS = 3
HISTORY_MESSAGES = 24
HISTORY_CHARACTERS = 20000


def unknown_assessment():
    return TurnAssessment(evaluation=Evaluation(verdict='unknown', feedback=''))


def history_for(s):
    result=[];remaining=HISTORY_CHARACTERS
    for m in reversed(s['messages'][-HISTORY_MESSAGES:]):
        text=m['text'] + ('\n'+m['code'] if m.get('code') else '')
        if len(text)>remaining: break
        result.append({'role':m['role'],'text':text,'source':m['source']})
        remaining-=len(text)
    return list(reversed(result))


def ground_assessment(s, text, assessment):
    """Quotes are necessary, not proof of semantic correctness; keep model uncertainty."""
    ev=assessment.evaluation
    if (s.get('exercise') or {}).get('reference_alignment')=='unverified' and ev.reference_applicable is not True:
        assessment.evaluation=Evaluation(verdict='unknown',feedback='')
        ev=assessment.evaluation
    ev.feedback=''
    if not s.get('exercise') or ev.verdict in ('supported','incorrect') and (not ev.evidence_quote or ev.evidence_quote not in text):
        assessment.evaluation=Evaluation(verdict='unknown', feedback='')
    if ev.evidence_quote not in text: ev.evidence_quote=''
    if ev.misconception not in course_for(s)['misconceptions']:
        ev.misconception=''
    if not assessment.intent_quote or assessment.intent_quote not in text:
        assessment.intent='unknown';assessment.intent_quote=''
    if assessment.correction_quote not in text:
        assessment.correction_quote=''
    allowed={'cognition':{'difficulty','no_clear_difficulty'}, 'valence':{'positive','neutral','negative'}, 'pressure':{'low','medium','high'}, 'fatigue':{'present','absent'}, 'cognitive_load':{'high','manageable'}}
    for name, values in allowed.items():
        claim=getattr(assessment,name)
        if claim.value not in values or not claim.quote or claim.quote not in text:
            claim.value='unknown';claim.quote=''
    return assessment


def learner_state(s, assessment, event, now=None):
    now=time.time() if now is None else now
    turn=s.get('dialogue_turn',0)+1
    state={}
    corrected=event=='correct' or bool(assessment.correction_quote)
    for name in ('cognition','valence','pressure','fatigue','cognitive_load'):
        claim=getattr(assessment,name)
        old=s.get('learner_state',{}).get(name,{})
        if claim.value!='unknown':
            state[name]={'value':claim.value,'quote':claim.quote,'source':'correction' if corrected else 'self_report','at':now,'turn':turn}
        elif not corrected and old and (name!='cognition' or old['source']!='task_answer') and now-old['at']<=STATE_TTL_SECONDS and turn-old['turn']<=STATE_TTL_TURNS:
            state[name]=dict(old)
        else:
            state[name]={'value':'unknown','quote':'','source':'unavailable','at':now,'turn':turn}
    # Task evidence never becomes emotion or pressure evidence.
    if state['cognition']['value']=='unknown' and assessment.evaluation.verdict in ('supported','incorrect'):
        state['cognition']={'value':'difficulty' if assessment.evaluation.verdict=='incorrect' else 'no_clear_difficulty',
            'quote':assessment.evaluation.evidence_quote,'source':'task_answer','at':now,'turn':turn}
    return state


def response_policy(state, assessment, event):
    valence=state['valence']['value'];pressure=state['pressure']['value']
    difficulty=state['cognition']['value']=='difficulty'
    wait=assessment.intent=='thinking'
    return {
        'wait_without_question':wait,
        'acknowledge_explicit_feeling':valence!='unknown' or pressure!='unknown',
        'reduce_information_load':difficulty or pressure in ('medium','high') or state['fatigue']['value']=='present' or state['cognitive_load']['value']=='high',
        'allow_full_example':event=='answer' or assessment.intent=='example',
        'requested_help':event=='hint' or assessment.intent=='help',
        'preserve_factual_feedback':True,
        'tone':'brief_acknowledgment_then_one_small_step' if difficulty and (valence=='negative' or pressure in ('medium','high')) else 'natural_and_specific',
        'no_emotion_inference_from_waiting_or_camera':True,
    }


def generation_context(s, text, event, assessment, state):
    c=course_for(s);exercise=s.get('exercise')
    policy=response_policy(state,assessment,event)
    return {
        'dialogue_version':DIALOGUE_VERSION,'course':c,'focus':focus_for(s),
        'history':history_for(s),'history_is_bounded':True,'student_text':text,'event':event,
        'active_exercise':{'prompt':exercise['prompt']} if exercise else None,
        'verified_evaluation':assessment.evaluation.model_dump(),
        'learner_state':state,'response_policy':policy,
        'recent_records':s['records'][-12:],
        'example_reference':exercise['reference'] if exercise and policy['allow_full_example'] and (exercise.get('reference_alignment')!='unverified' or assessment.evaluation.reference_applicable is True) else None,
        'visual_observation':s.get('visual_observation',{'available':False,'valid':False}),
        'modalities':{'text':'submitted_only','visual_behavior':'available' if s.get('visual_observation',{}).get('valid') else 'unavailable','visual_emotion':'unavailable','acoustic_emotion':'unavailable'},
        'user_correction':s.get('correction','') if event=='correct' else '',
        'proactive_reason':s.get('episode',{}).get('reason') if event=='support' and s.get('episode') else None,
    }


def camera_alerts(s, now=None):
    """Only explicit, current self-reports are available. No camera inference here."""
    now=time.time() if now is None else now
    if s['status']!='active' or s.get('support_mode')!='on' or not s['consent']['support']: return []
    alerts=[]
    for dimension,value,kind in [('fatigue','present','fatigue'),('cognitive_load','high','high_load')]:
        claim=s.get('learner_state',{}).get(dimension,{})
        if (claim.get('value')!=value or claim.get('source') not in ('self_report','correction')
            or not claim.get('quote') or not isinstance(claim.get('at'),(float,int))
            or not isinstance(claim.get('turn'),int)):
            continue
        if now<claim['at'] or now-claim['at']>=STATE_TTL_SECONDS or s.get('dialogue_turn',0)-claim['turn']>STATE_TTL_TURNS:
            continue
        alerts.append({'kind':kind,'source':claim['source'],'evidence_quote':claim['quote'],
            'captured_at':claim['at'],'expires_at':claim['at']+STATE_TTL_SECONDS})
    return alerts


def exercise_from_reply(reply, exercise_id):
    """Display wording is authoritative. Never reject a natural paraphrase."""
    exercise=reply.exercise.model_dump() | {'id':exercise_id}
    if exercise['prompt'] not in reply.reply:
        exercise.update(metadata_prompt=exercise['prompt'],prompt=reply.reply,reference_alignment='unverified')
    return exercise
