'use client';

import {useTranslation} from 'react-i18next';
import {AIConnectionSettings} from '@/features/settings/AIConnectionSettings';
import {LanguageSwitcher} from '@/components/LanguageSwitcher';
export default function AISettingsPage(){
  const {t}=useTranslation();
  return <main className="standalone-settings"><header className="header"><a href="/">{t('common.appName')}</a><LanguageSwitcher/></header><AIConnectionSettings/></main>;
}
