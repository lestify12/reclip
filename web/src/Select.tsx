import {Children,isValidElement,useEffect,useId,useLayoutEffect,useRef,useState,type CSSProperties,type KeyboardEvent,type ReactNode} from 'react';
import {ChevronDown,Check} from 'lucide-react';

/**
 * A styled drop-in for <select>: same children (<option>, <optgroup>), same `value` / `onChange(e.target.value)` shape,
 * so existing handlers keep working. The menu is drawn by the app (dark, keyboard-friendly) instead of the OS.
 */
type Opt={value:string;label:string;disabled?:boolean;group?:string};
type Props={value?:string|number;defaultValue?:string|number;onChange?:(e:{target:{value:string}})=>void;children?:ReactNode;id?:string;'aria-label'?:string;'aria-labelledby'?:string;translate?:'yes'|'no';disabled?:boolean;className?:string;title?:string;name?:string;style?:CSSProperties};

const textOf=(n:ReactNode):string=>Array.isArray(n)?n.map(textOf).join(''):n==null||typeof n==='boolean'?'':typeof n==='object'?textOf((n as {props?:{children?:ReactNode}}).props?.children):String(n);
function collect(children:ReactNode,group?:string,out:Opt[]=[]):Opt[]{
 Children.forEach(children,c=>{if(!isValidElement(c))return;const p=c.props as {value?:unknown;label?:unknown;disabled?:boolean;children?:ReactNode};
  if(c.type==='option')out.push({value:String(p.value??textOf(p.children)),label:textOf(p.children),disabled:!!p.disabled,group});
  else if(c.type==='optgroup')collect(p.children,String(p.label||''),out);
  else if(p.children)collect(p.children,group,out);});
 return out;
}

export default function Select({value,defaultValue,onChange,children,id,disabled,className='',title,name,style,...aria}:Props){
 const opts=collect(children);
 const [open,setOpen]=useState(false),[inner,setInner]=useState(String(defaultValue??'')),[hi,setHi]=useState(0),[pos,setPos]=useState<CSSProperties>({});
 const current=value!==undefined?String(value):inner,sel=opts.find(o=>o.value===current)||opts.find(o=>!o.disabled);
 const box=useRef<HTMLDivElement>(null),list=useRef<HTMLDivElement>(null),listId=useId();
 useEffect(()=>{if(!open)return;setHi(Math.max(0,opts.findIndex(o=>o.value===sel?.value)));
  const away=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setOpen(false);},close=()=>setOpen(false);
  document.addEventListener('pointerdown',away);window.addEventListener('resize',close);document.addEventListener('scroll',close,true);
  return()=>{document.removeEventListener('pointerdown',away);window.removeEventListener('resize',close);document.removeEventListener('scroll',close,true);};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open]);
 // The menu is fixed to the viewport so scrolling panels and dialogs never clip it; it opens upward when there is no room below.
 useLayoutEffect(()=>{if(!open||!box.current)return;const r=box.current.getBoundingClientRect(),room=window.innerHeight-r.bottom-12,h=Math.min(320,opts.length*40+12);
  setPos(room>=h||r.top<room?{position:'fixed',left:r.left,width:r.width,top:r.bottom+6,maxHeight:Math.max(120,Math.min(320,room))}:{position:'fixed',left:r.left,width:r.width,bottom:window.innerHeight-r.top+6,maxHeight:Math.max(120,Math.min(320,r.top-12))});
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[open]);
 useEffect(()=>{if(open)list.current?.querySelector<HTMLElement>('[data-hi="true"]')?.scrollIntoView({block:'nearest'});},[open,hi]);
 const pick=(o:Opt)=>{if(o.disabled)return;setOpen(false);if(value===undefined)setInner(o.value);onChange?.({target:{value:o.value}});};
 const key=(e:KeyboardEvent)=>{
  if(e.key==='Escape'){setOpen(false);return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();if(!open){setOpen(true);return;}let i=hi;do{i=(i+(e.key==='ArrowDown'?1:-1)+opts.length)%opts.length;}while(opts[i]?.disabled&&i!==hi);setHi(i);}
  else if(e.key==='Enter'||e.key===' '){e.preventDefault();if(open&&opts[hi])pick(opts[hi]);else setOpen(true);}
  else if(e.key==='Tab')setOpen(false);
 };
 return <div className={`ui-select ${open?'open':''} ${className}`} ref={box} style={style}>
  <button type="button" id={id} name={name} className="ui-select-button" title={title} disabled={disabled} aria-haspopup="listbox" aria-expanded={open} aria-controls={open?listId:undefined} {...aria} onClick={()=>setOpen(!open)} onKeyDown={key}><span className="ui-select-value">{sel?.label||''}</span><ChevronDown size={15}/></button>
  {open&&<div className="ui-select-menu" role="listbox" id={listId} ref={list} style={pos} aria-activedescendant={`${listId}-${hi}`}>
   {opts.map((o,i)=>{const grp=o.group&&(i===0||opts[i-1].group!==o.group);return <div key={o.value+i}>{grp&&<div className="ui-select-group">{o.group}</div>}<div id={`${listId}-${i}`} role="option" aria-selected={o.value===sel?.value} aria-disabled={o.disabled||undefined} data-hi={i===hi?'true':undefined} className={`ui-select-option ${o.value===sel?.value?'on':''} ${i===hi?'hi':''} ${o.disabled?'off':''}`} onMouseEnter={()=>setHi(i)} onClick={()=>pick(o)}>{o.label}{o.value===sel?.value&&<Check size={14}/>}</div></div>;})}
  </div>}
 </div>;
}
