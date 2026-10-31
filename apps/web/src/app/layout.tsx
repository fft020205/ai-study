import type {Metadata} from 'next';
import '@fontsource/noto-sans-sc/400.css';
import '@fontsource/noto-sans-sc/500.css';
import './styles.css';
export const metadata:Metadata={title:'学习助手 · 每次一件小事',description:'按自己的节奏，推理、验证与学习。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-CN"><body>{children}</body></html>;}
