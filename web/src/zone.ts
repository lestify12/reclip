// The release time zone, as the server reports it (RELEASE_TIME_ZONE, or that computer's zone). Every scheduled time
// in the app is shown and entered in this zone. Until the server answers, the browser's own zone is used.
let current=(()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}})();
export const zone=()=>current;
export function setZone(z?:string){if(!z)return;try{new Intl.DateTimeFormat('en-US',{timeZone:z});current=z;}catch{/* keep the old one */}}
/** "+04:00" for `z` at instant `at`. */
export function offsetOf(z=current,at=Date.now()){
 const name=new Intl.DateTimeFormat('en-US',{timeZone:z,timeZoneName:'longOffset'}).formatToParts(new Date(at)).find(p=>p.type==='timeZoneName')?.value||'GMT';
 const m=/GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);return m?`${m[1]}${m[2].padStart(2,'0')}:${m[3]||'00'}`:'+00:00';}
/** "Dubai time (GMT+4)". */
export function zoneLabel(z=current){const o=offsetOf(z),short=`GMT${o.replace(/:00$/,'').replace(/^([+-])0/,'$1')}`;return `${z.split('/').pop()!.replace(/_/g,' ')} time (${short})`;}
/** The ISO instant for a "YYYY-MM-DDTHH:MM" wall-clock time in the release zone. */
export function toIsoIn(local:string,z=current){const guess=Date.parse(`${local}:00Z`);return new Date(guess-minutes(offsetOf(z,guess))*60e3).toISOString();}
const minutes=(o:string)=>(o[0]==='-'?-1:1)*(Number(o.slice(1,3))*60+Number(o.slice(4,6)));
