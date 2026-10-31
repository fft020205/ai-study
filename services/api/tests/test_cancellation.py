import asyncio
import uuid
import httpx
from study.config import Settings
from study.main import create_app

async def test_end_discards_inflight_reply_even_with_stale_client(tmp_path):
    entered=asyncio.Event()
    class SlowProvider:
        configured=True
        async def complete_json(self,system,payload):
            entered.set()
            await asyncio.Event().wait()
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/cancel.db',_env_file=None),provider=SlowProvider())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app),base_url='http://test',headers={'X-Study-Client':'web-v1'}) as c:
        await c.get('/api/bootstrap')
        s=(await c.post('/api/sessions',json={'task_id':'variable'})).json()
        task=asyncio.create_task(c.post(f"/api/sessions/{s['id']}/turns",json={'text':'我的回答','version':s['version'],'request_id':str(uuid.uuid4())}))
        await asyncio.wait_for(entered.wait(),2)
        ended=await c.post(f"/api/sessions/{s['id']}/controls",json={'action':'end','version':s['version']})
        assert ended.status_code==200 and ended.json()['status']=='ended'
        reply=await asyncio.wait_for(task,2)
        assert reply.status_code==409
        final=(await c.get(f"/api/sessions/{s['id']}")).json()
        assert final['status']=='ended' and not final['pending']
        assert final['messages']==[]
