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
it('keeps a stream-scoped key when hardware identity is unavailable',async()=>{
  vi.stubGlobal('crypto',webcrypto);
  const stream=media();const key=await cameraDeviceKey(stream);
  expect(key).toMatch(/^[a-f0-9]{64}$/);
  expect(await cameraDeviceKey(stream)).toBe(key);
  expect(await cameraDeviceKey(media())).not.toBe(key);
});
it('disables reuse if secure randomness is unavailable',async()=>{
  vi.stubGlobal('crypto',undefined);
  expect(await cameraDeviceKey(media('device'))).toBeNull();
});
