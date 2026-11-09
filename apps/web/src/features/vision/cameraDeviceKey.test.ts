import {webcrypto} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {cameraDeviceKey} from './cameraDeviceKey';

const media=(deviceId?:string,width=640)=>({getVideoTracks:()=>[{getSettings:()=>({deviceId,width,height:480})}]} as unknown as MediaStream);
afterEach(()=>vi.unstubAllGlobals());
it('matches the camera setup without exposing raw identifiers',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const key=await cameraDeviceKey(media('private-device-id'));
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(key).toBe(await cameraDeviceKey(media('private-device-id')));
  expect(key).not.toBe(await cameraDeviceKey(media('another-device')));
  expect(key).not.toBe(await cameraDeviceKey(media('private-device-id',1280)));
  expect(key).not.toContain('private-device-id');
});
it('disables reference reuse when device identity or hashing is unavailable',async()=>{
  expect(await cameraDeviceKey(media())).toBeNull();
  vi.stubGlobal('crypto',undefined);
  expect(await cameraDeviceKey(media('device'))).toBeNull();
});
