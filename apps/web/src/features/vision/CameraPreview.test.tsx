import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {CameraPreview} from './CameraPreview';
import {I18nProvider} from '@/i18n/I18nProvider';
import {LanguageSwitcher} from '@/components/LanguageSwitcher';
import i18n,{languageStorageKey} from '@/i18n';
import {en} from '@/i18n/en';

class ResizeObserverStub{
  observe(){}
  disconnect(){}
}

describe('CameraPreview language switching',()=>{
  beforeEach(async()=>{
    await i18n.changeLanguage('zh-CN');
    window.localStorage.setItem(languageStorageKey,'zh-CN');
    vi.stubGlobal('ResizeObserver',ResizeObserverStub);
  });

  afterEach(async()=>{
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    await i18n.changeLanguage('zh-CN');
  });

  it('does not request the camera again when the interface language changes',async()=>{
    const getUserMedia=vi.fn(()=>new Promise<MediaStream>(()=>{}));
    Object.defineProperty(window.navigator,'mediaDevices',{configurable:true,value:{getUserMedia}});
    render(<I18nProvider>
      <LanguageSwitcher/>
      <CameraPreview allowed collapseSignal={0} onOpen={vi.fn()} onClose={vi.fn()} onLive={vi.fn()}/>
    </I18nProvider>);
    await waitFor(()=>expect(getUserMedia).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText('界面语言'),{target:{value:'en'}});
    expect(await screen.findByText(en.camera.reopen as string)).toBeTruthy();
    expect(getUserMedia).toHaveBeenCalledTimes(1);
  });
});
