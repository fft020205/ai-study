import pytest
from study.policy import SupportPolicy
from study.support import support_context,record_support_generation
from study.config import Settings
from study.contracts import Activity,Consent
from study.learning import new_session as empty_session

def new_session(task,consent):
    s=empty_session(task,consent);s['exercise']={'id':'test-question'};s['messages']=[{'role':'assistant','source':'ai'}];return s

def activity(s,**kw):
    return Activity(**({'version':s['version'],'foreground':True,'has_draft':False,'composing':False,'busy':False,'reading':False}|kw))

def test_requires_continuous_30_seconds_not_sample_count():
    policy=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    for time in range(100,130,2):assert policy.observe(s,activity(s),time) is None
    assert policy.observe(s,activity(s),130)=='waiting'

@pytest.mark.parametrize('flag,value',[('has_draft',True),('composing',True),('busy',True),('reading',True),('foreground',False)])
def test_ineligible_events_reset_entire_window(flag,value):
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    for time in range(0,30,2):p.observe(s,activity(s),time)
    assert p.observe(s,activity(s,**{flag:value}),30) is None
    for time in range(32,62,2):assert p.observe(s,activity(s),time) is None
    assert p.observe(s,activity(s),62)=='waiting'

def test_sleep_and_disconnect_are_not_waiting():
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    p.observe(s,activity(s),100)
    assert p.observe(s,activity(s),200) is None

@pytest.mark.parametrize('change',[{'protected':True},{'support_mode':'off'},{'support_mode':'paused'},{'status':'ended'},{'pending':'abc'}])
def test_controls_block_intervention(change):
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True));s.update(change)
    s['learner_state']={'cognitive_load':{'value':'high','quote':'信息太多','source':'self_report','at':100,'turn':0}}
    assert p.observe(s,activity(s),100) is None

def test_errors_legacy_limits_and_dismissal():
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True));s['same_error_count']=2
    assert p.observe(s,activity(s),100) is None
    s['learner_state']={'cognitive_load':{'value':'high','quote':'信息太多','source':'self_report','at':100,'turn':0}}
    assert p.observe(s,activity(s),100)=='cognitive_load'
    s['last_support_at']=100
    s['episodes_count']=999
    assert p.observe(s,activity(s),189)=='cognitive_load'
    s['dismissed_questions']=[s['question_key']]
    assert p.observe(s,activity(s),200) is None

def test_same_unanswered_silence_does_not_reprompt_after_cooldown():
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    record_support_generation(s,support_context(s,now=100,fallback='waiting'))
    for now in range(100,300,2):assert p.observe(s,activity(s),now) is None
    s['messages'].extend([{'role':'user','source':'submitted'},{'role':'assistant','source':'ai'}]);s['dialogue_turn']+=1
    for now in range(300,330,2):assert p.observe(s,activity(s),now) is None
    assert p.observe(s,activity(s),330)=='waiting'


def test_valid_visual_hint_can_request_llm_support_without_waiting_30_seconds():
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    assert p.observe(s,activity(s),100,visual={'valid':True,'calibrated':True,'support_hint':'possible_overload'})=='visual_signal'
    assert p.observe(s,activity(s,has_draft=True),100,visual={'valid':True,'calibrated':True,'support_hint':'possible_overload'}) is None
    assert p.observe(s,activity(s),100,visual={'valid':False,'calibrated':True,'support_hint':'possible_overload'}) is None


def test_errors_and_unreviewed_visual_state_do_not_show_early_buttons():
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True));s['same_error_count']=5
    assert p.observe(s,activity(s),100) is None
    assert p.observe(s,activity(s),102,visual={'valid':False,'calibrated':True,'support_hint':'possible_fatigue'}) is None
    assert p.observe(s,activity(s),104,visual={'valid':True,'calibrated':False,'support_hint':'possible_overload'}) is None
    s['learner_state']={'cognitive_load':{'value':'high','quote':'信息太多','source':'self_report','at':100,'turn':0}}
    assert p.observe(s,activity(s),105)=='cognitive_load'
    assert p.observe(s,activity(s),401) is None


def test_no_prompt_before_the_first_completed_reply_and_free_dialogue_can_wait():
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True));s['messages']=[]
    for now in range(100,140,2):assert p.observe(s,activity(s),now) is None
    s['messages']=[{'role':'assistant','source':'ai'}];s['exercise']=None
    for now in range(140,170,2):assert p.observe(s,activity(s),now) is None
    assert p.observe(s,activity(s),170)=='waiting'


@pytest.mark.parametrize('hint',['possible_fatigue','possible_overload'])
def test_both_valid_visual_conditions_can_trigger_support(hint):
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    assert p.observe(s,activity(s),100,visual={'valid':True,'calibrated':True,'support_hint':hint})=='visual_signal'


def test_explicit_fatigue_can_trigger_but_expired_or_denied_fatigue_cannot():
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    s['learner_state']={'fatigue':{'value':'present','quote':'我很累','source':'self_report','at':100,'turn':0}}
    assert p.observe(s,activity(s),100)=='fatigue'
    assert p.observe(s,activity(s),401) is None
    s['learner_state']['fatigue'].update(value='absent',quote='我不累',at=402)
    assert p.observe(s,activity(s),402) is None


def test_three_distinct_state_contents_share_one_round_budget_and_sources_do_not_duplicate():
    from study.support import support_state_key,record_support_attempt
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    contexts=[{'kind':kind,'signals':[{'kind':kind,'source':'self_report'}]} for kind in ('difficulty','fatigue','cognitive_load')]
    for context in contexts:
        assert p.can_attempt(s,context,100)
        record_support_attempt(s,context,100);record_support_generation(s,context)
        assert not p.can_generate(s,context)
    assert not p.can_generate(s,{'kind':'general','signals':[]})
    assert support_state_key(contexts[1])==support_state_key({'kind':'fatigue','signals':[{'kind':'fatigue','source':'visual_behavior'}]})
    s['dialogue_turn']+=1
    assert p.can_attempt(s,contexts[0],101) and p.can_attempt(s,contexts[1],101)


def test_retry_backoff_applies_only_to_the_same_failed_state():
    from study.support import record_support_attempt,support_round
    p=SupportPolicy(Settings(_env_file=None));s=new_session('variable',Consent(support=True))
    fatigue={'kind':'fatigue','signals':[{'kind':'fatigue','source':'self_report'}]}
    load={'kind':'cognitive_load','signals':[{'kind':'cognitive_load','source':'self_report'}]}
    record_support_attempt(s,fatigue,100)
    assert not p.can_attempt(s,fatigue,101) and p.can_attempt(s,load,101)
    assert support_round(s)['states']==[] and p.can_attempt(s,fatigue,130)
