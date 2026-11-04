import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {TaskSelector} from './TaskSelector';
import {LanguageSwitcher} from '@/components/LanguageSwitcher';
import {I18nProvider} from '@/i18n/I18nProvider';
import i18n,{languageStorageKey} from '@/i18n';
import {zhCN} from '@/i18n/zh-CN';
import {en} from '@/i18n/en';

describe('task selection language changes',()=>{
  beforeEach(async()=>{
    window.localStorage.setItem(languageStorageKey,'zh-CN');
    await i18n.changeLanguage('zh-CN');
  });
  afterEach(async()=>{cleanup();window.localStorage.clear();await i18n.changeLanguage('zh-CN');});

  it('updates an existing fallback notice in both directions and keeps the draft',async()=>{
    const onSelect=vi.fn();
    render(<I18nProvider><LanguageSwitcher/><TaskSelector tasks={[]} onSelect={onSelect}/></I18nProvider>);
    fireEvent.change(screen.getByLabelText(zhCN.tasks.interestLabel),{target:{value:'astronomy'}});
    fireEvent.click(screen.getByRole('button',{name:zhCN.tasks.start}));
    expect(screen.getByText(zhCN.tasks.fallback)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(zhCN.language.label),{target:{value:'en'}});
    expect(await screen.findByText(en.tasks.fallback)).toBeTruthy();
    expect(screen.queryByText(zhCN.tasks.fallback)).toBeNull();
    expect((screen.getByLabelText(en.tasks.interestLabel) as HTMLInputElement).value).toBe('astronomy');
    fireEvent.change(screen.getByLabelText(en.language.label),{target:{value:'zh-CN'}});
    expect(await screen.findByText(zhCN.tasks.fallback)).toBeTruthy();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
