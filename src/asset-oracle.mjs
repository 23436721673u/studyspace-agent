// Direct structural oracle. No imports from the scene builder or 2D geometry.
// Heights/thicknesses are explicit simulated V1 presentation constants.
export function structuralChecks(w, layout, parts, tolerance = 1e-6) {
  const rows = [], byId = new Map(parts.map(p => [p.id, p]));
  const near = (a,b) => a.length === b.length && a.every((x,i) => Math.abs(x-b[i]) <= tolerance);
  const check = (id, center, size) => {
    const p = byId.get(id), pass = !!p && near(p.center,center) && near(p.size,size);
    rows.push({id,status:pass?'pass':'fail',expectedCenter:center,expectedSize:size,actualCenter:p?.center,actualSize:p?.size});
  };
  const {width:W,depth:D}=w.room, H=2.8,T=.12,DH=2.1,DT=.035;
  check('room:floor',[W/2,-.05,D/2],[W,.1,D]);
  for(const wall of ['south','north','west','east']) {
    const horizontal=wall==='south'||wall==='north',length=horizontal?W:D;
    const ranges=wall===w.door.wall ? [['low',0,w.door.offset,H/2,H],['high',w.door.offset+w.door.width,length-w.door.offset-w.door.width,H/2,H],['lintel',w.door.offset,w.door.width,(H+DH)/2,H-DH]] : [['full',0,length,H/2,H]];
    for(const [suffix,start,len,y,height] of ranges) {
      if(len<=0)continue;
      check(`room:${wall}:${suffix}`,horizontal?[start+len/2,y,wall==='south'?-T/2:D+T/2]:[wall==='west'?-T/2:W+T/2,y,start+len/2],horizontal?[len,height,T]:[T,height,len]);
    }
  }
  const d=w.door,along=d.offset+(d.hinge==='low'?DT/2:d.width-DT/2),horizontal=d.wall==='south'||d.wall==='north';
  check('door:leaf',horizontal?[along,DH/2,d.wall==='south'?d.width/2:D-d.width/2]:[d.wall==='west'?d.width/2:W-d.width/2,DH/2,along],horizontal?[DT,DH,d.width]:[d.width,DH,DT]);
  // Open doorway prism: no wall may occupy any positive-volume portion below lintel.
  const opening=horizontal?[[d.offset,0,d.wall==='south'?-T: D],[d.offset+d.width,DH,d.wall==='south'?0:D+T]]:[[d.wall==='west'?-T:W,0,d.offset],[d.wall==='west'?0:W+T,DH,d.offset+d.width]];
  const intruders=parts.filter(p=>p.extras?.kind==='wall'&&[0,1,2].every(k=>p.min[k]<opening[1][k]-tolerance&&p.max[k]>opening[0][k]+tolerance)).map(p=>p.id);
  rows.push({id:'door:opening',status:intruders.length?'fail':'pass',min:opening[0],max:opening[1],intruders});
  for(const o of w.obstacles)check(`obstacle:${o.id}`,[o.x,o.height/2,o.z],[o.width,o.height,o.depth]);
  for(const seat of layout.seats) {
    const top=byId.get(`${seat.id}:table:top`),tableParts=parts.filter(p=>p.extras?.owner===seat.id&&p.extras?.kind==='table');
    const chairParts=parts.filter(p=>p.extras?.owner===seat.id&&p.extras?.kind==='chair');
    const tableGround=Math.min(...tableParts.map(p=>p.min[1])),chairGround=Math.min(...chairParts.map(p=>p.min[1]));
    const pass=top&&Math.abs(top.max[1]-w.seatTemplate.tableHeight)<=tolerance&&Math.abs(tableGround)<=tolerance&&Math.abs(chairGround)<=tolerance;
    rows.push({id:`${seat.id}:vertical`,status:pass?'pass':'fail',tableTop:top?.max[1],expectedTableTop:w.seatTemplate.tableHeight,tableGround,chairGround});
  }
  return rows;
}
