/** Match only the same camera setup; raw device identifiers stay in the browser. */
export async function cameraDeviceKey(media:MediaStream):Promise<string|null>{
  try{
    const settings=media.getVideoTracks()[0]?.getSettings();
    if(!settings?.deviceId||!globalThis.crypto?.subtle)return null;
    const setup=JSON.stringify({featureVersion:'observed-minute-v1',id:settings.deviceId,width:settings.width,height:settings.height,facing:settings.facingMode});
    const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(setup));
    return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
  }catch{return null;} // Missing identifiers disable reuse, never the camera itself.
}
