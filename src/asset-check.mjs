import { createHash } from 'node:crypto';
import { normalizeAndValidate } from './schema.mjs';
import { validateLayout } from './validator.mjs';
import { buildScene } from './scene.mjs';
import { structuralChecks } from './asset-oracle.mjs';
export const sha256=b=>createHash('sha256').update(b).digest('hex');
// Independent binary reader; never uses accessor min/max as geometric evidence.
export function readGlb(bytes) {
 if(bytes.length<28||bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('GLB header/length invalid');
 let off=12,json,bin;while(off<bytes.length){if(off+8>bytes.length)throw Error('chunk header truncated');const n=bytes.readUInt32LE(off),type=bytes.readUInt32LE(off+4);off+=8;if(n%4||off+n>bytes.length)throw Error('chunk length invalid');const chunk=bytes.subarray(off,off+n);if(type===0x4e4f534a&&!json&&off===20)json=JSON.parse(chunk.toString('utf8'));else if(type===0x004e4942&&json&&!bin)bin=chunk;else throw Error('unexpected chunk');off+=n;}
 if(!json||!bin||json.asset?.version!=='2.0'||json.buffers?.length!==1||json.buffers[0].byteLength>bin.length||json.buffers[0].uri)throw Error('unsupported buffer/asset');
 const accessor=i=>{const a=json.accessors?.[i],v=json.bufferViews?.[a?.bufferView];const comp={5126:4,5123:2}[a?.componentType],dim={VEC3:3,SCALAR:1}[a?.type];if(!a||!v||!comp||!dim||a.sparse||v.buffer!==0)throw Error('unsupported accessor');const stride=v.byteStride??comp*dim,start=(v.byteOffset??0)+(a.byteOffset??0),end=start+(a.count-1)*stride+dim*comp;if(!Number.isInteger(a.count)||a.count<1||stride<dim*comp||start%comp||end>bin.length||end>(v.byteOffset??0)+v.byteLength)throw Error('accessor range invalid');return Array.from({length:a.count},(_,k)=>Array.from({length:dim},(_,d)=>{const o=start+k*stride+d*comp;const x=comp===4?bin.readFloatLE(o):bin.readUInt16LE(o);if(!Number.isFinite(x))throw Error('nonfinite vertex');return x;}));};
 const scene=json.scenes?.[json.scene??0];if(!scene||scene.nodes?.length!==json.nodes?.length||new Set(scene.nodes).size!==scene.nodes.length)throw Error('scene node coverage invalid');
 const parts=[];for(const ni of scene.nodes){const n=json.nodes[ni];if(!n||n.children||n.matrix||n.rotation||n.skin)throw Error('unsupported transform: export contract is flat positive TRS without rotation');const t=n.translation??[0,0,0],s=n.scale??[1,1,1];if(t.length!==3||s.length!==3||![...t,...s].every(Number.isFinite)||s.some(x=>x<=0))throw Error('invalid TRS');const mesh=json.meshes[n.mesh];if(mesh?.primitives?.length!==1)throw Error('invalid primitive count');const p=mesh.primitives[0];if(p.mode!==4)throw Error('triangles required');const vertices=accessor(p.attributes.POSITION),normals=accessor(p.attributes.NORMAL),indices=accessor(p.indices).flat();if(vertices.length!==24||normals.length!==24||indices.length!==36||indices.some(i=>!Number.isInteger(i)||i<0||i>=vertices.length))throw Error('box topology invalid');
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];for(const v of vertices)for(let k=0;k<3;k++){const x=v[k]*s[k]+t[k];min[k]=Math.min(min[k],x);max[k]=Math.max(max[k],x);}
 const coverage=new Map();
 for(let j=0;j<indices.length;j+=3){const [a,b,c]=indices.slice(j,j+3).map(i=>vertices[i]);const u=b.map((x,k)=>x-a[k]),v=c.map((x,k)=>x-a[k]),cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];if(cross.reduce((r,x,k)=>r+x*normals[indices[j]][k],0)<=0)throw Error('degenerate/reversed face');
 const axis=[0,1,2].find(k=>a[k]===b[k]&&b[k]===c[k]&&Math.abs(a[k])===.5);if(axis===undefined)throw Error('triangle not on box face');const key=`${axis}:${a[axis]}`,signature=[a,b,c].map(v=>v.join(',')).sort().join('|');const face=coverage.get(key)??[];if(face.some(f=>f.signature===signature))throw Error('duplicate face triangle');face.push({signature,area:Math.hypot(...cross)/2,vertices:[a,b,c]});coverage.set(key,face);
 }
 if(coverage.size!==6||[...coverage.values()].some(f=>f.length!==2||Math.abs(f.reduce((n,t)=>n+t.area,0)-1)>1e-7||new Set(f.flatMap(t=>t.vertices.map(v=>v.join(',')))).size!==4))throw Error('six-face coverage invalid');
 for(const face of coverage.values()){const shared=face[0].vertices.filter(a=>face[1].vertices.some(b=>a.every((x,k)=>x===b[k])));if(shared.length!==2||Math.abs(shared[0].reduce((n,x,k)=>n+(x-shared[1][k])**2,0)-2)>1e-7)throw Error('face triangles do not share diagonal');}
 // Every coordinate must be a unit-box corner, so hidden deformation cannot hide behind the same AABB.
 if(vertices.some(v=>v.some(x=>Math.abs(Math.abs(x)-.5)>1e-7)))throw Error('non-box vertex');
 parts.push({id:n.name,extras:n.extras,min,max,center:min.map((x,k)=>(x+max[k])/2),size:min.map((x,k)=>max[k]-x),triangles:indices.length/3});}
 return {json,bin,parts};
}
export function checkAsset(bytes,input,layout) {
 const report={status:'fail',sha256:sha256(bytes),bytes:bytes.length,simulatedScenario:true,reader:'independent-binary-vertices-v1',toleranceMetres:1e-6,issues:[]};
 try{const normalized=normalizeAndValidate(input);if(!normalized.ok)throw Error('input schema failed');const w=normalized.value;report.layoutValidation=validateLayout(input,layout);if(report.layoutValidation.status!=='pass')report.issues.push('layout validation failed');const decoded=readGlb(bytes),expected=buildScene(w,layout);report.partCount=decoded.parts.length;report.triangles=decoded.parts.reduce((n,p)=>n+p.triangles,0);const actual=new Map(decoded.parts.map(p=>[p.id,p]));if(actual.size!==decoded.parts.length||actual.size!==expected.parts.length)report.issues.push('entity count/ID mismatch');
 const near=(a,b)=>a.length===b.length&&a.every((v,k)=>Math.abs(v-b[k])<=report.toleranceMetres);
 report.parts=expected.parts.map(e=>{const a=actual.get(e.id),ok=a&&near(a.center,e.center)&&near(a.size,e.size)&&a.extras?.units==='m'&&a.extras?.kind===e.kind&&a.extras?.owner===e.owner; if(!ok)report.issues.push(`part mismatch: ${e.id}`);return {id:e.id,status:ok?'pass':'fail',expectedCenter:e.center,expectedSize:e.size,actualCenter:a?.center,actualSize:a?.size};});
 // Separate footprint oracle derived directly from input, not geometry.mjs or scene generation.
 report.footprints=[];for(const seat of layout.seats)for(const kind of ['table','chair']){const t=w.seatTemplate,r=seat.orientation===90,ww=kind==='table'?t.tableWidth:t.chairWidth,dd=kind==='table'?t.tableDepth:t.chairDepth,offset=kind==='chair'?t.tableDepth/2+t.entityGap+t.chairDepth/2:0;const center=[seat.x-(r?offset:0),seat.z-(r?0:offset)],size=r?[dd,ww]:[ww,dd];const pp=decoded.parts.filter(p=>p.extras?.owner===seat.id&&p.extras?.kind===kind);const lo=[0,2].map(k=>Math.min(...pp.map(p=>p.min[k]))),hi=[0,2].map(k=>Math.max(...pp.map(p=>p.max[k])));const ok=near(lo.map((x,k)=>(x+hi[k])/2),center)&&near(lo.map((x,k)=>hi[k]-x),size);report.footprints.push({id:seat.id,kind,status:ok?'pass':'fail',center,size});if(!ok)report.issues.push(`footprint mismatch: ${seat.id}/${kind}`);}
 if(JSON.stringify(decoded.json.scenes[0].extras?.usageZones)!==JSON.stringify(expected.zones)||JSON.stringify(decoded.json.scenes[0].extras?.doorKeepout)!==JSON.stringify(expected.doorKeepout))report.issues.push('nonphysical zone mismatch');
 report.structuralChecks=structuralChecks(w,layout,decoded.parts,report.toleranceMetres);
 for(const row of report.structuralChecks)if(row.status!=='pass')report.issues.push(`structural mismatch: ${row.id}`);
 report.status=report.issues.length?'fail':'pass';
 }catch(e){report.issues.push(e.message);}return report;
}
