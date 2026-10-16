import {useEffect,useRef} from 'react';
import {createPortal} from 'react-dom';
import {Button} from '../ui/button';
export default function TrackingDialog({title,onClose,children}){
  const root=useRef(null);
  useEffect(()=>{const previous=document.activeElement;root.current?.querySelector('button')?.focus();const key=e=>{
    if(e.key==='Escape'){e.stopPropagation();onClose();}
    if(e.key==='Tab'){const items=[...root.current.querySelectorAll('button:not(:disabled),a[href],input,select,[tabindex="0"]')];const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}
  };document.addEventListener('keydown',key,true);return()=>{document.removeEventListener('keydown',key,true);previous?.focus?.();};},[onClose]);
  return createPortal(<div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-3" onClick={onClose}><section ref={root} role="dialog" aria-modal="true" aria-label={title} className="max-h-[94vh] w-full max-w-2xl overflow-auto rounded-2xl border p-5 shadow-2xl" style={{backgroundColor:'var(--color-card-bg)',color:'var(--color-text-primary)',borderColor:'var(--color-border-default)'}} onClick={e=>e.stopPropagation()}><header className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title}</h2><Button variant="outline" onClick={onClose}>Close</Button></header>{children}</section></div>,document.body);
}
