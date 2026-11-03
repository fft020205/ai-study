import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {useTranslation} from 'react-i18next';
import i18n,{defaultLanguage,detectInitialLanguage,languageStorageKey,normalizeLanguage,selectLanguage} from './index';
import {I18nProvider} from './I18nProvider';
import {LanguageSwitcher} from '@/components/LanguageSwitcher';
import {courseSubtitle,courseTitle,localizeFocusTitle,localizeSessionTitle} from './course';
import {localizeError} from './errors';
import {zhCN} from './zh-CN';
import {en} from './en';

function VisibleText(){
  const {t}=useTranslation();
  return <h1>{t('tasks.title')}</h1>;
}

function flatten(value:unknown,prefix=''):Record<string,string>{
  if(typeof value==='string')return {[prefix]:value};
  return Object.entries(value as Record<string,unknown>).reduce<Record<string,string>>((result,[key,child])=>
    Object.assign(result,flatten(child,prefix?`${prefix}.${key}`:key)),{});
}

function setBrowserLanguage(value:string){
  Object.defineProperty(window.navigator,'language',{configurable:true,value});
  Object.defineProperty(window.navigator,'languages',{configurable:true,value:[value]});
}

describe('i18n resources and language detection',()=>{
  beforeEach(async()=>{
    await i18n.changeLanguage(defaultLanguage);
    window.localStorage.clear();
    document.head.innerHTML='<meta name="description" content="">';
  });

  afterEach(async()=>{
    cleanup();
    Reflect.deleteProperty(window.navigator,'language');
    Reflect.deleteProperty(window.navigator,'languages');
    vi.restoreAllMocks();
    await i18n.changeLanguage(defaultLanguage);
  });

  it('keeps English keys, values, interpolation variables, and plurals aligned',()=>{
    const source=flatten(zhCN),translated=flatten(en);
    expect(Object.keys(translated).sort()).toEqual(Object.keys(source).sort());
    for(const [key,value] of Object.entries(source)){
      expect(translated[key].trim(),key).not.toBe('');
      const variables=(text:string)=>[...text.matchAll(/{{\s*([^}]+?)\s*}}/g)].map(match=>match[1]).sort();
      expect(variables(translated[key]),key).toEqual(variables(value));
    }
    expect(i18n.t('summary.completed',{lng:'en',count:1,independent:1})).toContain('1 exercise');
    expect(i18n.t('summary.completed',{lng:'en',count:2,independent:1})).toContain('2 exercises');
  });

  it('normalizes supported locales and falls back for unsupported preferences',()=>{
    expect(normalizeLanguage(' EN-gb ')).toBe('en');
    expect(normalizeLanguage('zh-TW')).toBe('zh-CN');
    expect(normalizeLanguage('fr-FR')).toBeNull();
    setBrowserLanguage('en-GB');
    expect(detectInitialLanguage()).toBe('en');
    window.localStorage.setItem(languageStorageKey,'unsupported');
    setBrowserLanguage('fr-FR');
    expect(detectInitialLanguage()).toBe('zh-CN');
  });

  it('switches visible text without remounting and persists the explicit choice',async()=>{
    window.localStorage.setItem(languageStorageKey,'zh-CN');
    render(<I18nProvider><LanguageSwitcher/><VisibleText/></I18nProvider>);
    const select=screen.getByLabelText(zhCN.language.label) as HTMLSelectElement;
    expect(screen.getByText(zhCN.tasks.title)).toBeTruthy();
    fireEvent.change(select,{target:{value:'en'}});
    expect(await screen.findByText(en.tasks.title as string)).toBeTruthy();
    expect(screen.getByLabelText(en.language.label as string)).toBe(select);
    expect(window.localStorage.getItem(languageStorageKey)).toBe('en');
  });

  it('restores the saved language and creates document metadata',async()=>{
    window.localStorage.setItem(languageStorageKey,'en');
    document.head.innerHTML='';
    render(<I18nProvider><VisibleText/></I18nProvider>);
    expect(await screen.findByText(en.tasks.title as string)).toBeTruthy();
    await waitFor(()=>{
      expect(document.documentElement.lang).toBe('en');
      expect(document.title).toBe(en.metadata.title);
      expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(en.metadata.description);
    });
  });

  it('uses the browser language when no preference is saved',async()=>{
    setBrowserLanguage('en-US');
    render(<I18nProvider><VisibleText/></I18nProvider>);
    expect(await screen.findByText(en.tasks.title as string)).toBeTruthy();
    expect(window.localStorage.getItem(languageStorageKey)).toBeNull();
  });

  it('still changes language when local storage is unavailable',async()=>{
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Blocked','SecurityError');});
    await expect(selectLanguage('en')).resolves.toBeUndefined();
    expect(i18n.resolvedLanguage).toBe('en');
  });

  it('localizes only automatic course metadata and known errors',async()=>{
    await i18n.changeLanguage('en');
    expect(courseTitle('mean')).toBe(en.courses.mean.title);
    expect(courseSubtitle('mean')).toBe(en.courses.mean.subtitle);
    expect(localizeSessionTitle({task_id:'mean',title:'平均数02',title_version:0})).toBe('Averages 02');
    expect(localizeSessionTitle({task_id:'mean',title:'我的复习',title_version:1})).toBe('我的复习');
    expect(localizeFocusTitle(zhCN.courses.mean.objectives.weighted)).toBe(en.courses.mean.objectives.weighted);
    expect(localizeFocusTitle('模型生成的焦点')).toBe('模型生成的焦点');
    expect(localizeError(zhCN.errors.aiNotConnected)).toBe(en.errors.aiNotConnected);
    expect(localizeError('Provider-specific failure')).toBe('Provider-specific failure');
    expect(localizeError('')).toBe(en.errors.operationFailed);
  });
});
