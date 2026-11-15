import { buildOccupancy, buildDoorKeepout } from './geometry.mjs';
export const STYLE = Object.freeze({roomHeight:2.8,wallThickness:.12,floorThickness:.1,doorHeight:2.1,doorThickness:.035});
// All shapes are original parametric boxes. Input footprints remain authoritative.
export function buildScene(w, layout) {
 const parts=[]; const add=(id,kind,center,size,owner=id)=>{if(size.every(n=>n>0)) parts.push({id,kind,owner,center,size});};
 const {width:W,depth:D}=w.room, H=STYLE.roomHeight,T=STYLE.wallThickness;
 add('room:floor','floor',[W/2,-.05,D/2],[W,.1,D]);
 for(const wall of ['south','north','west','east']) {
  const horizontal=['south','north'].includes(wall), length=horizontal?W:D;
  const emit=(suffix,start,len,y,h)=>add(`room:${wall}:${suffix}`,'wall',horizontal?[start+len/2,y,wall==='south'?-T/2:D+T/2]:[wall==='west'?-T/2:W+T/2,y,start+len/2],horizontal?[len,h,T]:[T,h,len]);
  if(w.door.wall!==wall) emit('full',0,length,H/2,H);
  else {emit('low',0,w.door.offset,H/2,H);emit('high',w.door.offset+w.door.width,length-w.door.offset-w.door.width,H/2,H);emit('lintel',w.door.offset,w.door.width,(H+STYLE.doorHeight)/2,H-STYLE.doorHeight);}
 }
 const d=w.door,low=d.hinge==='low',h=d.offset+(low?0:d.width), thick=STYLE.doorThickness;
 const horizontal=['south','north'].includes(d.wall);
 const center=horizontal?[h+(low?thick/2:-thick/2),STYLE.doorHeight/2,d.wall==='south'?d.width/2:D-d.width/2]:[d.wall==='west'?d.width/2:W-d.width/2,STYLE.doorHeight/2,h+(low?thick/2:-thick/2)];
 add('door:leaf','door',center,horizontal?[thick,STYLE.doorHeight,d.width]:[d.width,STYLE.doorHeight,thick]);
 for(const o of w.obstacles) add(`obstacle:${o.id}`,'cabinet',[o.x,o.height/2,o.z],[o.width,o.height,o.depth],o.id);
 const zones=[];
 for(const s of layout.seats) {
  const t=w.seatTemplate,g=buildOccupancy(w,s),rot=s.orientation===90;
  const local=(x,z)=>rot?[s.x+z,s.z-x]:[s.x+x,s.z+z];
  const box=(suffix,kind,x,y,z,ww,hh,dd)=>{const [gx,gz]=local(x,z);add(`${s.id}:${suffix}`,kind,[gx,y,gz],rot?[dd,hh,ww]:[ww,hh,dd],s.id);};
  const top=Math.min(.045,t.tableHeight/10),leg=Math.min(.055,t.tableWidth/8,t.tableDepth/8);
  box('table:top','table',0,t.tableHeight-top/2,0,t.tableWidth,top,t.tableDepth);
  for(const [i,x,z] of [[0,-1,-1],[1,1,-1],[2,1,1],[3,-1,1]])box(`table:leg${i}`,'table',x*(t.tableWidth-leg)/2,(t.tableHeight-top)/2,z*(t.tableDepth-leg)/2,leg,t.tableHeight-top,leg);
  const cz=-(t.tableDepth/2+t.entityGap+t.chairDepth/2),seatY=Math.min(.45,t.tableHeight*.6),seatT=Math.min(.045,seatY/8),backH=Math.min(.4,t.tableHeight*.5),backT=Math.min(.04,t.chairDepth/8),cl=Math.min(.035,t.chairWidth/8,t.chairDepth/8);
  box('chair:seat','chair',0,seatY-seatT/2,cz,t.chairWidth,seatT,t.chairDepth);
  box('chair:back','chair',0,seatY+backH/2,cz-(t.chairDepth-backT)/2,t.chairWidth,backH,backT);
  for(const [i,x,z] of [[0,-1,-1],[1,1,-1],[2,1,1],[3,-1,1]])box(`chair:leg${i}`,'chair',x*(t.chairWidth-cl)/2,(seatY-seatT)/2,cz+z*(t.chairDepth-cl)/2,cl,seatY-seatT,cl);
  zones.push({...g.use,physical:false});
 }
 const ids=parts.map(p=>p.id);if(new Set(ids).size!==ids.length)throw new Error('duplicate asset part ID');
 return {units:'m',upAxis:'Y',simulatedScenario:true,style:STYLE,parts,zones,doorKeepout:{...buildDoorKeepout(w),physical:false}};
}
