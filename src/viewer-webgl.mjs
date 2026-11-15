import * as THREE from 'three';
import { GLTFLoader } from '/local/GLTFLoader.js';
import { OrbitControls } from '/local/OrbitControls.js';
const canvas=document.querySelector('#canvas'),status=document.querySelector('#status');
const renderer=new THREE.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});
renderer.setPixelRatio(devicePixelRatio);renderer.setClearColor('#edf1ed');
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(42,1,.01,1000);
const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
scene.add(new THREE.HemisphereLight(0xffffff,0x667766,2.5));
const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(3,10,-5);scene.add(sun);
let model=null,labels=[];
function resize(){renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix()}
function flags(){model?.traverse(o=>{if(o.userData.kind==='wall')o.visible=document.querySelector('#walls').checked});}
function load(buffer,name){new GLTFLoader().parse(buffer,'',g=>{
 if(model)scene.remove(model);for(const l of labels)l.element.remove();labels=[];model=g.scene;scene.add(model);
 let parts=0,triangles=0,chairs=0,tops=0,legs=0,backs=0;
 model.traverse(o=>{if(!o.isMesh)return;parts++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;if(o.userData.kind==='table'&&o.userData.id?.endsWith(':top')){tops++;const e=document.createElement('div');e.textContent=o.userData.owner||o.userData.id.split(':')[0];Object.assign(e.style,{position:'fixed',pointerEvents:'none',fontSize:'12px',background:'#ffffffe0',padding:'2px 5px',borderRadius:'3px'});document.body.append(e);labels.push({object:o,element:e});}if(o.userData.kind==='chair')chairs++;if(o.userData.kind==='table'&&o.userData.id?.includes(':leg'))legs++;if(o.userData.kind==='chair'&&o.userData.id?.includes(':back'))backs++;});
 const box=new THREE.Box3().setFromObject(model),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),span=Math.max(size.x,size.z);
 controls.target.set(center.x,.5,center.z);camera.position.set(center.x+span*.65,span*.8,center.z-span*.9);controls.update();flags();resize();
 canvas.dataset.meshes=parts;canvas.dataset.tables=tops;canvas.dataset.chairParts=chairs;canvas.dataset.legs=legs;canvas.dataset.backs=backs;canvas.dataset.depthTest='true';
 status.textContent=`已从GLB二进制读取 ${parts} 个部件 / ${triangles} 个三角形 · 单位m · ${name} · WebGL深度测试`;
},e=>{status.textContent='读取失败：'+e.message;console.error(e)});}
document.querySelector('#file').onchange=async e=>{const f=e.target.files[0];if(f)load(await f.arrayBuffer(),f.name)};
document.querySelector('#walls').onchange=flags;
const jid=new URLSearchParams(location.search).get('job');if(jid){try{const r=await fetch(`/api/jobs/${jid}/assets/scene.glb`);if(!r.ok)throw Error(`GLB HTTP ${r.status}`);load(await r.arrayBuffer(),'scene.glb')}catch(e){status.textContent='自动载入失败：'+e.message;console.error(e)}}
window.addEventListener('resize',resize);resize();
function frame(){requestAnimationFrame(frame);controls.update();renderer.render(scene,camera);for(const l of labels){const p=l.object.getWorldPosition(new THREE.Vector3());p.y+=.2;p.project(camera);const r=canvas.getBoundingClientRect();l.element.style.display=document.querySelector('#labels').checked&&Math.abs(p.x)<1&&Math.abs(p.y)<1?'block':'none';l.element.style.left=`${r.left+(p.x+1)*r.width/2}px`;l.element.style.top=`${r.top+(1-p.y)*r.height/2}px`;}}frame();
