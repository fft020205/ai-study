"""Keep stream-owned tasks bounded even when ASGI middleware closes before iteration."""
from anyio import CancelScope
from fastapi.responses import StreamingResponse

class ManagedStreamResponse(StreamingResponse):
    def __init__(self,*args,on_close,**kwargs):
        super().__init__(*args,**kwargs);self.on_close=on_close
    async def __call__(self,scope,receive,send):
        try:await super().__call__(scope,receive,send)
        finally:
            with CancelScope(shield=True):await self.on_close()
