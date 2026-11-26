// The release time zone: the clock that daily release times ("06:00, 10:00 …") are read in. RELEASE_TIME_ZONE in .env
// (an IANA name such as Asia/Dubai) wins; otherwise it is this computer's own time zone. Daylight-saving zones work too:
// every release slot is converted with the offset in force on that day.
export const validZone=z=>{if(typeof z!=='string'||!z.trim())return false;try{new Intl.DateTimeFormat('en-US',{timeZone:z.trim()});return true;}catch{return false;}};
export const systemZone=()=>{try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch{return 'UTC';}};
export function releaseZone(env=process.env){const z=String(env.RELEASE_TIME_ZONE||'').trim();return validZone(z)?z:systemZone();}
/** Minutes east of UTC in `zone` at instant `at` (Dubai → 240). */
export function offsetMinutes(zone,at=Date.now()){
 const name=new Intl.DateTimeFormat('en-US',{timeZone:zone,timeZoneName:'longOffset'}).formatToParts(new Date(at)).find(p=>p.type==='timeZoneName')?.value||'GMT';
 const m=/GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);return m?(m[1]==='-'?-1:1)*(Number(m[2])*60+Number(m[3]||0)):0;}
/** "+04:00" style offset of `zone` at `at`. */
export function offsetText(zone,at=Date.now()){const m=offsetMinutes(zone,at),a=Math.abs(m);return `${m<0?'-':'+'}${String(Math.floor(a/60)).padStart(2,'0')}:${String(a%60).padStart(2,'0')}`;}
/** The calendar day (YYYY-MM-DD) of instant `at` in `zone`. */
export const localDay=(at,zone)=>new Date(at).toLocaleDateString('sv-SE',{timeZone:zone});
export const addDays=(ymd,n)=>new Date(Date.parse(`${ymd}T00:00:00Z`)+n*86400e3).toISOString().slice(0,10);
/** The instant (ms) of wall-clock `hhmm` on day `ymd` in `zone`. */
export function zonedTime(ymd,hhmm,zone){const guess=Date.parse(`${ymd}T${hhmm}:00Z`);let t=guess-offsetMinutes(zone,guess)*60e3;const again=offsetMinutes(zone,t);if(again!==offsetMinutes(zone,guess))t=guess-again*60e3;return t;}
