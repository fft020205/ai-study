import {useCallback,useLayoutEffect,useRef,useState,type ReactNode,type PointerEvent,type KeyboardEvent} from 'react';
import {useTranslation} from 'react-i18next';
import {clampCameraPosition,type CameraPoint} from './cameraPosition';

export function FloatingCamera({children}:{children:ReactNode}){
  const {t}=useTranslation();
  const element=useRef<HTMLDivElement>(null);
  const positionRef=useRef<CameraPoint|null>(null);
  const drag=useRef<{pointerId:number;startX:number;startY:number;origin:CameraPoint}|null>(null);
  const [position,setPosition]=useState<CameraPoint|null>(null),[dragging,setDragging]=useState(false);
  const move=useCallback((next:CameraPoint)=>{
    const el=element.current;if(!el)return;
    const rect=el.getBoundingClientRect(),viewport=window.visualViewport;
    const bounded=clampCameraPosition(next,rect,{x:viewport?.offsetLeft??0,y:viewport?.offsetTop??0,width:viewport?.width??window.innerWidth,height:viewport?.height??window.innerHeight});
    if(positionRef.current?.x===bounded.x&&positionRef.current?.y===bounded.y)return;
    positionRef.current=bounded;setPosition(bounded);
  },[]);
  useLayoutEffect(()=>{
    const el=element.current;if(!el)return;
    const keepVisible=()=>{
      const rect=el.getBoundingClientRect();
      move(positionRef.current??{x:rect.left,y:rect.top});
    };
    keepVisible();
    const observer=new ResizeObserver(keepVisible);observer.observe(el);
    const viewport=window.visualViewport;
    window.addEventListener('resize',keepVisible);viewport?.addEventListener('resize',keepVisible);viewport?.addEventListener('scroll',keepVisible);
    return()=>{observer.disconnect();window.removeEventListener('resize',keepVisible);viewport?.removeEventListener('resize',keepVisible);viewport?.removeEventListener('scroll',keepVisible);};
  },[move]);
  const start=(event:PointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||!event.isPrimary)return;
    const target=event.target as Element;
    // Regular controls keep their click semantics; the dedicated handle also works in the closed state.
    if(target.closest('button,a,input,textarea,select')&&!target.closest('[data-camera-drag-handle]'))return;
    const rect=event.currentTarget.getBoundingClientRect();
    drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,origin:{x:rect.left,y:rect.top}};
    event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);event.preventDefault();
  };
  const finish=(event:PointerEvent<HTMLDivElement>)=>{
    if(drag.current?.pointerId!==event.pointerId)return;
    drag.current=null;setDragging(false);
    if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const keyboardMove=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!(event.target as Element).closest('[data-camera-drag-handle]'))return;
    const step=event.shiftKey?1:10;
    const deltas:Record<string,CameraPoint>={ArrowLeft:{x:-step,y:0},ArrowRight:{x:step,y:0},ArrowUp:{x:0,y:-step},ArrowDown:{x:0,y:step}};
    const delta=deltas[event.key];if(!delta)return;
    event.preventDefault();const rect=event.currentTarget.getBoundingClientRect();move({x:rect.left+delta.x,y:rect.top+delta.y});
  };
  return <div ref={element} className={`camera-floating${dragging?' dragging':''}`} role="group" aria-label={t('camera.draggable')}
    style={position?{left:position.x,top:position.y,right:'auto'}:undefined}
    onPointerDown={start} onPointerMove={event=>{const active=drag.current;if(active?.pointerId===event.pointerId)move({x:active.origin.x+event.clientX-active.startX,y:active.origin.y+event.clientY-active.startY});}}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}} onKeyDown={keyboardMove}>{children}</div>;
}

export function CameraDragHandle(){
  const {t}=useTranslation();
  return <button type="button" className="camera-drag-handle" data-camera-drag-handle aria-label={t('camera.move')} title={t('camera.moveHelp')}><span aria-hidden="true">⠿</span></button>;
}
