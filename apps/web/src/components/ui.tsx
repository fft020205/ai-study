import type {ButtonHTMLAttributes,ReactNode} from 'react';
const icons={spark:'c365f.svg',mutedSpark:'5835f.svg',hint:'24dcb.svg',plus:'b94dc.svg',book:'7cf21.svg',code:'fa2e6.svg',chart:'ba0c8.svg',link:'58c6a.svg',camera:'e6d7b.svg',cameraOff:'f2bb3.svg',mic:'ca8be.svg',voice:'23771.svg',minimize:'7b5e2.svg',menu:'775a0.svg'};
export function Icon({name,className=''}:{name:keyof typeof icons;className?:string}){
  // Preserve each exported SVG's intrinsic dimensions; wrappers supply spacing.
  return <span className={`icon ${className}`} aria-hidden="true"><img src={`/figma/${icons[name]}`} alt=""/></span>;
}
export function Button({variant='secondary',children,...props}:ButtonHTMLAttributes<HTMLButtonElement>&{variant?:'primary'|'secondary'|'ghost';children:ReactNode}){
  return <button {...props} className={`button ${variant} ${props.className||''}`}>{children}</button>;
}
export function Toggle({label,value,onChange,disabled=false}:{label:string;value:boolean;onChange:(v:boolean)=>void;disabled?:boolean}){
  return <button type="button" className="toggle" role="switch" aria-label={label} aria-checked={value} onClick={()=>onChange(!value)} disabled={disabled}><img src={`/figma/${value?'90455.svg':'51a14.svg'}`} alt=""/></button>;
}
export function Notice({children}:{children:ReactNode}){return <div className="notice" role="status">{children}</div>;}
