import {useEffect,useLayoutEffect,useRef,useState,type CSSProperties,type PointerEvent as ReactPointerEvent} from 'react';
import {ChevronDown,Check} from 'lucide-react';

/**
 * A drop-in for <input type="color">: same `value` (#rrggbb) and `onChange(e.target.value)`, but the picker is drawn by
 * the app (dark, with preset swatches, a saturation square, a hue bar and a hex field) instead of the OS popup.
 */
type Props={value:string;onChange:(e:{target:{value:string}})=>void;'aria-label'?:string;id?:string;disabled?:boolean;className?:string};

export const PRESETS=['#ffffff','#ffd23f','#9be15d','#8ee5bc','#5ad7ff','#79a8ff','#b48cff','#ff7ab6','#ff5148','#ff8a1f','#16121f','#000000'];

const clamp=(n:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,n));
export function hexToHsv(hex:string):[number,number,number]{
 const m=/^#?([0-9a-f]{6})$/i.exec(hex.trim());if(!m)return [0,0,1];const n=parseInt(m[1],16),r=(n>>16&255)/255,g=(n>>8&255)/255,b=(n&255)/255;
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=0;
 if(d){h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;}
 return [h,max?d/max:0,max];
}
export function hsvToHex(h:number,s:number,v:number):string{
 const c=v*s,x=c*(1-Math.abs(((h/60)%2)-1)),m=v-c;const [r,g,b]=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
 return '#'+[r,g,b].map(q=>Math.round((q+m)*255).toString(16).padStart(2,'0')).join('');
}
const normalize=(hex:string)=>{const m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());if(!m)return null;const t=m[1].length===3?m[1].split('').map(c=>c+c).join(''):m[1];return '#'+t.toLowerCase();};

export default function ColorInput({value,onChange,id,disabled,className='',...aria}:Props){
 const [open,setOpen]=useState(false),[pos,setPos]=useState<CSSProperties>({}),[hsv,setHsv]=useState<[number,number,number]>(()=>hexToHsv(value)),[hex,setHex]=useState(value);
 const box=useRef<HTMLDivElement>(null),sv=useRef<HTMLDivElement>(null),hue=useRef<HTMLDivElement>(null);
 const current=normalize(value)||'#ffffff';
 // Follow outside changes to the value (another control, a template switch).
 useEffect(()=>{setHex(current);const next=hexToHsv(current);setHsv(old=>hsvToHex(...old)===current?old:next);},[current]);
 useEffect(()=>{if(!open)return;const away=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);},esc=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);},close=(e?:Event)=>{if(e&&box.current&&e.target instanceof Node&&box.current.contains(e.target))return;setOpen(false);};
  document.addEventListener('pointerdown',away);document.addEventListener('keydown',esc);window.addEventListener('resize',close);document.addEventListener('scroll',close,true);
  return()=>{document.removeEventListener('pointerdown',away);document.removeEventListener('keydown',esc);window.removeEventListener('resize',close);document.removeEventListener('scroll',close,true);};},[open]);
 useLayoutEffect(()=>{if(!open||!box.current)return;const r=box.current.getBoundingClientRect(),h=300,room=window.innerHeight-r.bottom-12;
  const left=Math.min(r.left,window.innerWidth-272);setPos(room>=h||r.top<room?{position:'fixed',left,top:r.bottom+6}:{position:'fixed',left,bottom:window.innerHeight-r.top+6});},[open]);
 const emit=(h:number,s:number,v:number)=>{setHsv([h,s,v]);const out=hsvToHex(h,s,v);setHex(out);onChange({target:{value:out}});};
 const drag=(el:HTMLDivElement|null,apply:(x:number,y:number)=>void)=>(e:ReactPointerEvent<HTMLDivElement>)=>{if(!el)return;e.preventDefault();el.setPointerCapture(e.pointerId);
  const at=(ev:{clientX:number;clientY:number})=>{const r=el.getBoundingClientRect();apply(clamp((ev.clientX-r.left)/r.width,0,1),clamp((ev.clientY-r.top)/r.height,0,1));};at(e);
  const move=(ev:PointerEvent)=>at(ev),up=()=>{el.removeEventListener('pointermove',move);el.removeEventListener('pointerup',up);el.removeEventListener('pointercancel',up);};
  el.addEventListener('pointermove',move);el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);};
 const [h,s,v]=hsv;
 return <div className={`color-input ${open?'open':''} ${className}`} ref={box}>
  <button type="button" id={id} className="color-button" disabled={disabled} aria-haspopup="dialog" aria-expanded={open} {...aria} onClick={()=>setOpen(!open)}><i className="color-swatch" style={{background:current}}/><span className="color-hex">{current}</span><ChevronDown size={14}/></button>
  {open&&<div className="color-pop" role="dialog" aria-label="Pick a colour" style={pos}>
   <div className="color-presets">{PRESETS.map(p=><button type="button" key={p} className={`color-preset ${p===current?'on':''}`} style={{background:p}} aria-label={p} title={p} onClick={()=>{setHsv(hexToHsv(p));setHex(p);onChange({target:{value:p}});}}>{p===current&&<Check size={12}/>}</button>)}</div>
   <div className="color-sv" ref={sv} style={{background:`linear-gradient(to top,#000,transparent),linear-gradient(to right,#fff,hsl(${h} 100% 50%))`}} onPointerDown={drag(sv.current,(x,y)=>emit(h,x,1-y))}><i className="color-thumb" style={{left:`${s*100}%`,top:`${(1-v)*100}%`,background:current}}/></div>
   <div className="color-hue" ref={hue} onPointerDown={drag(hue.current,x=>emit(x*360,s,v))}><i className="color-thumb" style={{left:`${h/360*100}%`,top:'50%',background:`hsl(${h} 100% 50%)`}}/></div>
   <label className="color-hex-field"><span>Hex</span><input value={hex} spellCheck={false} autoComplete="off" onChange={e=>{setHex(e.target.value);const n=normalize(e.target.value);if(n){setHsv(hexToHsv(n));onChange({target:{value:n}});}}} onBlur={()=>setHex(current)}/><i className="color-swatch" style={{background:current}}/></label>
  </div>}
 </div>;
}
