/** Raw device identifiers stay in the browser. Unknown devices match only this stream. */
const streamKeys=new WeakMap<MediaStream,string>();
function temporaryStreamKey(media:MediaStream):string|null{
  const existing=streamKeys.get(media);if(existing)return existing;
  if(!globalThis.crypto?.getRandomValues)return null;
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  const key=Array.from(bytes,value=>value.toString(16).padStart(2,'0')).join('');
  streamKeys.set(media,key);return key;
}
export async function cameraDeviceKey(media:MediaStream):Promise<string|null>{
  try{
    const settings=media.getVideoTracks()[0]?.getSettings();
    if(!settings?.deviceId||!globalThis.crypto?.subtle)return temporaryStreamKey(media);
    const setup=JSON.stringify({featureVersion:'observed-minute-v1',id:settings.deviceId,width:settings.width,height:settings.height,facing:settings.facingMode});
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(setup));
    return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
  }catch{return temporaryStreamKey(media);}
}
