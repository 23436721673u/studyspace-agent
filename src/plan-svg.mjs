import {buildOccupancy,buildDoorKeepout} from './geometry.mjs';
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
export function planSvg(w,layout) {
 const scale=Math.min(90,900/w.room.width,650/w.room.depth),W=w.room.width*scale,D=w.room.depth*scale;
 const rect=(r,fill,stroke,dash='')=>`<rect x="${(r.x-r.width/2)*scale}" y="${D-(r.z+r.depth/2)*scale}" width="${r.width*scale}" height="${r.depth*scale}" fill="${fill}" stroke="${stroke}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;
 const text=(x,y,s)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="11">${esc(s)}</text>`;
 let body=`<rect width="${W}" height="${D}" fill="#faf9f2" stroke="#333" stroke-width="3"/>`;
 body+=rect(buildDoorKeepout(w),'#ffe6ce','#cd7400','5 4');
 for(const o of w.obstacles){body+=rect(o,'#9eacbb','#334155');body+=text(o.x*scale,D-o.z*scale,`${o.id} 柜 ${o.width}×${o.depth}×${o.height}m`);}
 for(const s of layout.seats){const g=buildOccupancy(w,s);body+=rect(g.use,'#e2f6e8','#55886b','4 4')+rect(g.table,'#dec295','#6c492a')+rect(g.chair,'#64a8aa','#17515a');body+=text(s.x*scale,D-s.z*scale,`${s.id} ${s.orientation}°`);body+=text(s.x*scale,D-s.z*scale+13,`${g.table.width}×${g.table.depth}m`);body+=text(g.chair.x*scale,D-g.chair.z*scale,`${g.chair.width}×${g.chair.depth}m`);body+=text(g.use.x*scale,D-g.use.z*scale,`使用 ${g.use.width}×${g.use.depth}m`);}
 body+=`<path d="M0,-25 H${W} M0,-31 V-19 M${W},-31 V-19 M-25,0 V${D} M-31,0 H-19 M-31,${D} H-19" stroke="#333" fill="none"/>`;
 body+=text(W/2,-33,`房间内净宽 ${w.room.width}m`)+text(-38,D/2,`${w.room.depth}m`)+text(W/2,D+25,`门 ${w.door.wall} / 偏移 ${w.door.offset}m / 净宽 ${w.door.width}m / ${w.door.hinge} 铰链`);
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W+160}" height="${D+220}" viewBox="0 0 ${W+160} ${D+220}"><rect width="100%" height="100%" fill="white"/><g font-family="sans-serif" fill="#172c35"><text x="35" y="30" font-size="19">一间好自习 · 模拟场景 · 单位米</text><text x="35" y="52" font-size="12">上方 north / +z；右方 east / +x；坐标原点在西南内墙角</text><g transform="translate(85 110)">${body}</g><text x="35" y="${D+165}" font-size="12">绿色虚线：椅后使用空间（非实体）；橙色：保守开门区；通行设定 ${w.passageWidth}m，非消防认证</text><text x="35" y="${D+185}" font-size="12">桌高 ${w.seatTemplate.tableHeight}m；桌椅间隙 ${w.seatTemplate.entityGap}m；准确坐标及全部3D尺寸见 editable.json / geometry-report.json</text></g></svg>`;
}
