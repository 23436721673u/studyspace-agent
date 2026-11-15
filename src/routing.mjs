// Conservative square passage body; swept AABB also conservatively bounds diagonal links.
export function segmentClear(w, a, b, obstacles) {
  const r=w.passageWidth/2, e=w.tolerance;
  if (![a.x,a.z,b.x,b.z].every(Number.isFinite)) return false;
  const box={l:Math.min(a.x,b.x)-r,h:Math.max(a.x,b.x)+r,b:Math.min(a.z,b.z)-r,t:Math.max(a.z,b.z)+r};
  if(box.l < -e || box.b < -e || box.h>w.room.width+e || box.t>w.room.depth+e) return false;
  return !obstacles.some(o=>box.l<o.x+o.width/2-e && box.h>o.x-o.width/2+e && box.b<o.z+o.depth/2-e && box.t>o.z-o.depth/2+e);
}
export function findRoute(w,start,target,obstacles) {
  if(!segmentClear(w,start,start,obstacles)) return {reachable:false,reason:'invalid entrance body'};
  if(!segmentClear(w,target,target,obstacles)) return {reachable:false,reason:'target body intersects furniture or boundary'};
  const q=[{...start,parent:-1}], seen=new Set(['0:0']), step=w.gridSize;
  const maxNodes=Math.min(250000, Math.max(1, Math.ceil(w.room.width / step + 1) * Math.ceil(w.room.depth / step + 1)));
  const deadline=Math.min(performance.now()+(w.searchBudget?.maxMs ?? 5000), w._deadline ?? Infinity);
  for(let head=0;head<q.length;head++) {
    if(q.length>maxNodes || performance.now()>deadline) return {reachable:false,limited:true,reason:'route resource limit',visited:q.length,maxNodes,deadlineMs:w.searchBudget?.maxMs ?? null};
    const p=q[head];
    if(Math.hypot(p.x-target.x,p.z-target.z)<=step*1.5 && segmentClear(w,p,target,obstacles)) {
      const path=[target]; for(let i=head;i>=0;i=q[i].parent) path.push({x:q[i].x,z:q[i].z}); path.reverse();
      return {reachable:true,path,pathLength:path.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-path[i].x,p.z-path[i].z),0),visited:q.length};
    }
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
      const ix=Math.round((p.x-start.x)/step)+dx, iz=Math.round((p.z-start.z)/step)+dz, key=`${ix}:${iz}`;
      if(seen.has(key)) continue; seen.add(key);
      const n={x:start.x+ix*step,z:start.z+iz*step,parent:head};
      if(segmentClear(w,p,n,obstacles)) q.push(n);
    }
  }
  return {reachable:false,reason:'no route found at configured grid resolution',visited:q.length};
}
