import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/500.css';
import './styles.css';
import {I18nProvider} from '@/i18n/I18nProvider';

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="zh-CN"><body><I18nProvider>{children}</I18nProvider></body></html>;
}
