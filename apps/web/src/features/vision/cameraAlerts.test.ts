import {describe,it,expect} from 'vitest';
import type {CameraAlert} from '../../lib/types';
import {activeCameraAlerts} from './cameraAlerts';
const alert:CameraAlert={kind:'fatigue',source:'self_report',evidence_quote:'我很累了',captured_at:100,expires_at:400};
describe('camera reminders need valid, current user evidence',()=>{
  it('shows distinct fatigue and high-load reminders from explicit feedback',()=>{
    expect(activeCameraAlerts([alert,{...alert,kind:'high_load'}],200)).toHaveLength(2);
  });
  it('removes expired, future, empty and unverified-source records',()=>{
    expect(activeCameraAlerts([alert],400)).toEqual([]);
    expect(activeCameraAlerts([alert],99)).toEqual([]);
    expect(activeCameraAlerts([{...alert,evidence_quote:''}],200)).toEqual([]);
    expect(activeCameraAlerts([{...alert,source:'camera_guess'} as unknown as CameraAlert],200)).toEqual([]);
    expect(activeCameraAlerts([{...alert,expires_at:50}],100)).toEqual([]);
  });
});
