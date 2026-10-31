"""Wire helpers: stream only the top-level visible reply, never private JSON fields."""
import json

class StreamFormatError(ValueError): pass

async def sse_data(lines):
    data=[]
    async for line in lines:
        if not line:
            if data:yield '\n'.join(data);data=[]
        elif line.startswith('data:'):data.append(line[5:].lstrip(' '))
    if data:yield '\n'.join(data)


def string_prefix(text,start):
    result=[];i=start+1
    escapes={'"':'"','\\':'\\','/':'/','b':'\b','f':'\f','n':'\n','r':'\r','t':'\t'}
    while i<len(text):
        char=text[i]
        if char=='"':return ''.join(result),i+1
        if char=='\\':
            if i+1>=len(text):break
            code=text[i+1]
            if code=='u':
                if i+6>len(text):break
                try:value=int(text[i+2:i+6],16)
                except ValueError:raise StreamFormatError('Invalid unicode escape')
                i+=6
                if 0xD800<=value<=0xDBFF:
                    if i+6>len(text):break
                    if text[i:i+2]!='\\u':raise StreamFormatError('Invalid surrogate pair')
                    try:low=int(text[i+2:i+6],16)
                    except ValueError:raise StreamFormatError('Invalid unicode escape')
                    if not 0xDC00<=low<=0xDFFF:raise StreamFormatError('Invalid surrogate pair')
                    value=0x10000+((value-0xD800)<<10)+(low-0xDC00);i+=6
                elif 0xDC00<=value<=0xDFFF:raise StreamFormatError('Invalid surrogate pair')
                result.append(chr(value));continue
            if code not in escapes:raise StreamFormatError('Invalid JSON escape')
            result.append(escapes[code]);i+=2;continue
        if ord(char)<32 or 0xD800<=ord(char)<=0xDFFF:raise StreamFormatError('Invalid JSON character')
        result.append(char);i+=1
    return ''.join(result),None


class ReplyTextDecoder:
    def __init__(self):self.buffer='';self.visible=''
    def feed(self,chunk):
        self.buffer+=chunk
        if len(self.buffer)>65536:raise StreamFormatError('Model output too large')
        text=self.buffer.lstrip()
        if text.startswith('```'):
            if '\n' not in text:return ''
            text=text.split('\n',1)[1].lstrip()
        if not text or text[0]!='{':return ''
        decoder=json.JSONDecoder();pos=1;reply=None
        while pos<len(text):
            while pos<len(text) and text[pos].isspace():pos+=1
            if pos>=len(text) or text[pos]=='}':break
            try:key,end=decoder.raw_decode(text,pos)
            except json.JSONDecodeError:break
            if not isinstance(key,str):raise StreamFormatError('Invalid object key')
            pos=end
            while pos<len(text) and text[pos].isspace():pos+=1
            if pos>=len(text):break
            if text[pos]!=':':raise StreamFormatError('Invalid object separator')
            pos+=1
            while pos<len(text) and text[pos].isspace():pos+=1
            if pos>=len(text):break
            if key=='reply':
                if reply is not None:raise StreamFormatError('Duplicate reply field')
                if text[pos]!='"':raise StreamFormatError('Reply must be a string')
                reply,end=string_prefix(text,pos)
                if len(reply)>4000:raise StreamFormatError('Reply too long')
                if end is None:break
                pos=end
            else:
                try:_,pos=decoder.raw_decode(text,pos)
                except json.JSONDecodeError:break
            while pos<len(text) and text[pos].isspace():pos+=1
            if pos>=len(text) or text[pos]=='}':break
            if text[pos]!=',':raise StreamFormatError('Invalid object separator')
            pos+=1
        if reply is None:return ''
        if not reply.startswith(self.visible):raise StreamFormatError('Reply changed while streaming')
        delta=reply[len(self.visible):];self.visible=reply
        return delta
