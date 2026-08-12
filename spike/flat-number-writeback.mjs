// Nummer platte-gevel-panelen (1 plaat = 1 paneel), groep = gevelvlak. Nummert per gevel
// onder->boven, links->rechts; wijst strippen+latten toe aan hun plaat; schrijft
// Paneelnummer/Gevel terug in IFC. Levert genummerde IFC + mapping-CSV + genummerde kaart.
import fs from 'node:fs';
import path from 'node:path';
const IFC=process.argv[2], OUT=process.argv[3];
fs.mkdirSync(OUT,{recursive:true});
const text=fs.readFileSync(IFC,'latin1');
const WANT=new Set(['IFCEXTRUDEDAREASOLID','IFCRECTANGLEPROFILEDEF','IFCARBITRARYCLOSEDPROFILEDEF','IFCPOLYLINE','IFCSHAPEREPRESENTATION','IFCPRODUCTDEFINITIONSHAPE','IFCBUILDINGELEMENTPART','IFCMEMBER','IFCAXIS2PLACEMENT3D','IFCAXIS2PLACEMENT2D','IFCDIRECTION','IFCLOCALPLACEMENT','IFCCARTESIANPOINT']);
function splitTop(s){const o=[];let d=0,q=false,c='';for(let i=0;i<s.length;i++){const ch=s[i];if(q){c+=ch;if(ch==="'")q=false;continue;}if(ch==="'"){q=true;c+=ch;continue;}if(ch==='('){d++;c+=ch;continue;}if(ch===')'){d--;c+=ch;continue;}if(ch===','&&d===0){o.push(c);c='';continue;}c+=ch;}o.push(c);return o;}
const ref=s=>{const m=String(s).match(/#(\d+)/);return m?+m[1]:null;};
const refsOf=s=>[...String(s).matchAll(/#(\d+)/g)].map(x=>+x[1]);
const unq=s=>String(s).trim().replace(/^'/,'').replace(/'$/,'');
const r1=v=>Math.round(v*10)/10;
let maxId=0;
const ent=new Map();{const lines=text.split(/\r?\n/);let buf='';for(const raw of lines){buf+=(buf?' ':'')+raw;if(!/;\s*$/.test(buf))continue;const m=buf.match(/^#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\((.*)\)\s*;\s*$/);buf='';if(!m)continue;const id=+m[1];if(id>maxId)maxId=id;const t=m[2].toUpperCase();if(!WANT.has(t))continue;ent.set(id,{type:t,args:m[3]});}}
const pt=id=>{const e=ent.get(id);if(!e)return[0,0,0];const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);return[n[0]||0,n[1]||0,n[2]||0];};
const dir=id=>{if(id==null)return null;const e=ent.get(id);if(!e)return null;const n=splitTop(e.args.replace(/^\(|\)$/g,'')).map(parseFloat);const v=[n[0]||0,n[1]||0,n[2]||0];const L=Math.hypot(...v)||1;return[v[0]/L,v[1]/L,v[2]/L];};
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const nrm=a=>{const L=Math.hypot(...a)||1;return[a[0]/L,a[1]/L,a[2]/L];};
const II={R:[[1,0,0],[0,1,0],[0,0,1]],t:[0,0,0]};
function axis3d(id){const e=ent.get(id);if(!e||e.type!=='IFCAXIS2PLACEMENT3D')return II;const p=splitTop(e.args);const loc=pt(ref(p[0]));let z=dir(ref(p[1]))||[0,0,1];let x=dir(ref(p[2]))||[1,0,0];const zx=dot(z,x);x=nrm([x[0]-zx*z[0],x[1]-zx*z[1],x[2]-zx*z[2]]);const y=cross(z,x);return{R:[[x[0],y[0],z[0]],[x[1],y[1],z[1]],[x[2],y[2],z[2]]],t:loc};}
function mul(A,B){const R=[[0,0,0],[0,0,0],[0,0,0]];for(let i=0;i<3;i++)for(let j=0;j<3;j++){let s=0;for(let k=0;k<3;k++)s+=A.R[i][k]*B.R[k][j];R[i][j]=s;}const t=[0,0,0];for(let i=0;i<3;i++){let s=A.t[i];for(let k=0;k<3;k++)s+=A.R[i][k]*B.t[k];t[i]=s;}return{R,t};}
const apply=(M,p)=>[M.R[0][0]*p[0]+M.R[0][1]*p[1]+M.R[0][2]*p[2]+M.t[0],M.R[1][0]*p[0]+M.R[1][1]*p[1]+M.R[1][2]*p[2]+M.t[1],M.R[2][0]*p[0]+M.R[2][1]*p[1]+M.R[2][2]*p[2]+M.t[2]];
const colX=M=>[M.R[0][0],M.R[1][0],M.R[2][0]];const colY=M=>[M.R[0][1],M.R[1][1],M.R[2][1]];const colZ=M=>[M.R[0][2],M.R[1][2],M.R[2][2]];
const plCache=new Map();
function localMatrix(id){if(id==null)return II;if(plCache.has(id))return plCache.get(id);const e=ent.get(id);if(!e||e.type!=='IFCLOCALPLACEMENT'){plCache.set(id,II);return II;}const p=splitTop(e.args);const parent=ref(p[0]);const rel=axis3d(ref(p[1]));const M=parent==null?rel:mul(localMatrix(parent),rel);plCache.set(id,M);return M;}
function axis2dLoc(id){const e=ent.get(id);if(!e)return[0,0];const p=splitTop(e.args);return pt(ref(p[0]));}
function profileInfo(id){const e=ent.get(id);if(!e)return null;if(e.type==='IFCRECTANGLEPROFILEDEF'){const p=splitTop(e.args);const pos=p[2]!=='$'?axis2dLoc(ref(p[2])):[0,0];return{x:parseFloat(p[3]),y:parseFloat(p[4]),cx:pos[0],cy:pos[1]};}if(e.type==='IFCARBITRARYCLOSEDPROFILEDEF'){const p=splitTop(e.args);const pl=ent.get(ref(p[p.length-1]));if(pl){const pts=refsOf(pl.args).map(pt);const xs=pts.map(v=>v[0]),ys=pts.map(v=>v[1]);return{x:Math.max(...xs)-Math.min(...xs),y:Math.max(...ys)-Math.min(...ys),cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2};}}return null;}
const V=[0,0,1];
const CAT={Board:'panelen',Slats:'latten',Bricks:'steenstrips'};
// elementen (verticale vlakken)
const els=[];
for(const [id,e] of ent){if(e.type!=='IFCBUILDINGELEMENTPART'&&e.type!=='IFCMEMBER')continue;const p=splitTop(e.args);const nm=unq(p[2]);const cat=CAT[nm];if(!cat)continue;const plId=ref(p[5]);const reprId=ref(p[6]);if(!reprId)continue;const PM=localMatrix(plId);const pds=ent.get(reprId);if(!pds)continue;const pp=splitTop(pds.args);for(const rId of refsOf(pp[pp.length-1])){const sr=ent.get(rId);if(!sr||sr.type!=='IFCSHAPEREPRESENTATION')continue;const srP=splitTop(sr.args);for(const sid of refsOf(srP[3])){const se=ent.get(sid);if(!se||se.type!=='IFCEXTRUDEDAREASOLID')continue;const sp=splitTop(se.args);const depth=parseFloat(sp[3]);const prof=profileInfo(ref(sp[0]));if(!prof)continue;const SM=mul(PM,axis3d(ref(sp[1])));const wc=apply(SM,[prof.cx,prof.cy,depth/2]);let n=nrm(colZ(SM));if(Math.abs(n[2])>0.5)continue;const sgn=(n[0]||n[1]||n[2])<0?-1:1;const nd=[n[0]*sgn,n[1]*sgn,n[2]*sgn];const uAx=nrm(cross(V,nd));const lx=colX(SM),ly=colY(SM);const uHalf=Math.abs(prof.x/2*dot(lx,uAx))+Math.abs(prof.y/2*dot(ly,uAx));const vHalf=Math.abs(prof.x/2*dot(lx,V))+Math.abs(prof.y/2*dot(ly,V));els.push({pid:id,cat,nd,ndk:`${nd[0].toFixed(2)},${nd[1].toFixed(2)},${nd[2].toFixed(2)}`,off:dot(wc,nd),uc:dot(wc,uAx),vc:wc[2],uHalf,vHalf});}}}
// gevelvlakken: per normaal-richting, offsets clusteren (gap 250) -> wall incl. alle lagen
function cluster1D(vals,gap){const s=[...new Set(vals)].sort((a,b)=>a-b);const edges=[s[0]];for(let i=1;i<s.length;i++){if(s[i]-s[i-1]>gap)edges.push((s[i]+s[i-1])/2);}return v=>{let idx=0;for(let i=0;i<edges.length;i++)if(v>=edges[i])idx=i;return idx;};}
// gevelvlak = PLATEN-vlak: per normaal-richting, board-offsets clusteren (gap 150)
const boardsAll=els.filter(e=>e.cat==='panelen');
const byDirB=new Map();for(const b of boardsAll)(byDirB.get(b.ndk)||byDirB.set(b.ndk,[]).get(b.ndk)).push(b);
const gevMeta=new Map();
for(const [ndk,arr] of byDirB){const cl=cluster1D(arr.map(b=>b.off),150);for(const b of arr){const gid=`${ndk}#${cl(b.off)}`;b._gid=gid;if(!gevMeta.has(gid))gevMeta.set(gid,{gid,nd:b.nd,offs:[]});gevMeta.get(gid).offs.push(b.off);}}
const gevs=[...gevMeta.values()].map(g=>({...g,off:g.offs.reduce((a,b)=>a+b,0)/g.offs.length,ang:Math.atan2(g.nd[1],g.nd[0])})).sort((a,b)=>a.ang-b.ang||a.off-b.off);
const letter=new Map();gevs.forEach((g,i)=>letter.set(g.gid,String.fromCharCode(65+i)));
// nummer boards per gevel (onder->boven, links->rechts)
const panels=[];
const boardByGev=new Map();for(const b of boardsAll)(boardByGev.get(b._gid)||boardByGev.set(b._gid,[]).get(b._gid)).push(b);
for(const g of gevs){const bs=boardByGev.get(g.gid);const L=letter.get(g.gid);const rowIdx=cluster1D(bs.map(b=>b.vc),250);bs.forEach(b=>b._row=rowIdx(b.vc));bs.sort((a,b)=>a._row-b._row||a.uc-b.uc);bs.forEach((b,i)=>{const pan={num:`${L}-${String(i+1).padStart(3,'0')}`,letter:L,gid:g.gid,board:b,members:[b.pid]};panels.push(pan);b._pan=pan;});}
// wijs strippen+latten toe aan dichtstbijzijnde plaat (zelfde normaal, |offset|<300, in-vlak)
const bByDir=new Map();for(const b of boardsAll)(bByDir.get(b.ndk)||bByDir.set(b.ndk,[]).get(b.ndk)).push(b);
let unassigned=0;
for(const e of els){if(e.cat==='panelen')continue;const cand=bByDir.get(e.ndk)||[];let best=null,bd=1e18;for(const b of cand){if(Math.abs(e.off-b.off)>300)continue;const du=Math.abs(e.uc-b.uc)-b.uHalf,dv=Math.abs(e.vc-b.vc)-b.vHalf;const inside=du<=3&&dv<=3;const cd=(e.uc-b.uc)**2+(e.vc-b.vc)**2;const score=inside?cd-1e12:cd;if(score<bd){bd=score;best=b;}}if(best)best._pan.members.push(e.pid);else unassigned++;}
// report
console.log(`${path.basename(IFC)} | elementen(vert): ${els.length} | gevels: ${gevs.length} | panelen(platen): ${panels.length}`);
const perGevCount=new Map();for(const p of panels)perGevCount.set(p.letter,(perGevCount.get(p.letter)||0)+1);
for(const g of gevs){const L=letter.get(g.gid);if(!perGevCount.get(L))continue;console.log(`  gevel ${L} (n=${g.nd.map(v=>v.toFixed(0)).join(',')} @${Math.round(g.off)}): ${perGevCount.get(L)} panelen`);}
const totMembers=panels.reduce((s,p)=>s+new Set(p.members).size,0);
console.log(`  totaal getagde elementen: ${totMembers} / ${els.length} (niet toegewezen strippen/latten: ${unassigned})`);

// ===== write-back =====
const ALPH="0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function ifcGuid(n){let s='';let x=n>>>0;for(let i=0;i<21;i++){s=ALPH[x&63]+s;x=Math.floor(x/64);}return '2'+s;}
let nid=maxId+1, gseed=1;
const newLines=[]; const map=['paneelnummer;gevel;plaat_breedte_mm;plaat_hoogte_mm;n_elementen;u_mm;v_mm'];
for(const p of panels){
  const b=p.board;const w=Math.round(2*b.uHalf),h=Math.round(2*b.vHalf);
  const uniq=[...new Set(p.members)];
  const pNum=nid++,pGev=nid++,pW=nid++,pH=nid++,pset=nid++,rel=nid++;
  newLines.push(`#${pNum}= IFCPROPERTYSINGLEVALUE('Paneelnummer',$,IFCLABEL('${p.num}'),$);`);
  newLines.push(`#${pGev}= IFCPROPERTYSINGLEVALUE('Gevel',$,IFCLABEL('${p.letter}'),$);`);
  newLines.push(`#${pW}= IFCPROPERTYSINGLEVALUE('PlaatBreedte',$,IFCINTEGER(${w}),$);`);
  newLines.push(`#${pH}= IFCPROPERTYSINGLEVALUE('PlaatHoogte',$,IFCINTEGER(${h}),$);`);
  newLines.push(`#${pset}= IFCPROPERTYSET('${ifcGuid(gseed++)}',#7,'KGT Paneelnummering',$,(#${pNum},#${pGev},#${pW},#${pH}));`);
  newLines.push(`#${rel}= IFCRELDEFINESBYPROPERTIES('${ifcGuid(gseed++)}',#7,$,$,(${uniq.map(x=>'#'+x).join(',')}),#${pset});`);
  map.push([p.num,p.letter,w,h,uniq.length,r1(b.uc),r1(b.vc)].join(';'));
}
const marker='ENDSEC;';const li=text.lastIndexOf(marker);
const out=text.slice(0,li)+newLines.join('\r\n')+'\r\n'+text.slice(li);
const outName=path.basename(IFC).replace(/\.ifc$/i,'')+'-genummerd.ifc';
fs.writeFileSync(path.join(OUT,outName),out,'latin1');
fs.writeFileSync(path.join(OUT,path.basename(IFC).replace(/\.ifc$/i,'')+'-paneelmap.csv'),map.join('\r\n'),'utf8');
console.log(`  geschreven: ${outName} (+${newLines.length} regels), express-ids ${maxId+1}..${nid-1}`);

// ===== genummerde kaart =====
const S=0.05, mL=64, gapY=52, labelH=34, mT=54, mR=24;
function draw(gid,yTop){const bs=panels.filter(p=>p.gid===gid).map(p=>p.board);if(!bs.length)return null;const L=letter.get(gid);
  const uMin=Math.min(...bs.map(b=>b.uc-b.uHalf)),uMax=Math.max(...bs.map(b=>b.uc+b.uHalf)),vMin=Math.min(...bs.map(b=>b.vc-b.vHalf)),vMax=Math.max(...bs.map(b=>b.vc+b.vHalf));
  const W=(uMax-uMin)*S,H=(vMax-vMin)*S;const X=u=>mL+(u-uMin)*S,Yc=v=>yTop+labelH+(vMax-v)*S;
  let s=`<text x="${mL}" y="${yTop+22}" font-size="14" font-weight="bold">Gevel ${L}</text><text x="${mL}" y="${yTop+36}" font-size="10" fill="#555">${bs.length} panelen · onder→boven, links→rechts</text>`;
  for(const p of panels.filter(p=>p.gid===gid)){const b=p.board;const x=X(b.uc-b.uHalf),y=Yc(b.vc+b.vHalf),w=2*b.uHalf*S,h=2*b.vHalf*S;const par=(Math.round((b.uc-uMin)/450)+Math.round((vMax-b.vc)/450))%2;s+=`<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(1.5,w).toFixed(1)}" height="${Math.max(1.5,h).toFixed(1)}" fill="${par?'#d7e3f4':'#f6e6d5'}" stroke="#334155" stroke-width="0.4"/>`;if(w>16&&h>10)s+=`<text x="${(x+w/2).toFixed(1)}" y="${(y+h/2+3).toFixed(1)}" font-size="7" text-anchor="middle" fill="#222">${(+p.num.split('-')[1])}</text>`;}
  return {svg:s,height:labelH+H+30,width:W};}
let y=mT,maxW=0,body='';for(const g of gevs){const gid=g.gid;if(!panels.some(p=>p.gid===gid))continue;const d=draw(gid,y);if(!d)continue;body+=d.svg;y+=d.height+gapY;maxW=Math.max(maxW,d.width);}
const Wt=Math.round(mL+maxW+mR),Ht=Math.round(y);
fs.writeFileSync(path.join(OUT,path.basename(IFC).replace(/\.ifc$/i,'')+'-genummerd.svg'),`<svg xmlns="http://www.w3.org/2000/svg" width="${Wt}" height="${Ht}" viewBox="0 0 ${Wt} ${Ht}" font-family="Segoe UI,Arial"><rect width="${Wt}" height="${Ht}" fill="#fff"/><text x="${mL}" y="30" font-size="16" font-weight="bold">${path.basename(IFC)} — panelen genummerd per gevel</text>${body}</svg>`,'utf8');
console.log(`  geschreven: genummerde kaart`);
