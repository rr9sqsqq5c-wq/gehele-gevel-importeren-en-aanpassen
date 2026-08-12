// SPIKE — horizontale doorsnede van een raam op halve hoogte. Snijdt elke driehoek met het vlak
// height=Ycut, projecteert de snijpunten op (lengte, dikte), gegroepeerd per sub-geometrie. Emit JSON.
import { IfcAPI } from 'web-ifc';
import fs from 'fs';
const { IFCWINDOW } = await import('web-ifc');

const api = new IfcAPI();
await api.Init();
const modelID = api.OpenModel(new Uint8Array(fs.readFileSync('public/BIL-MOO-A-ZZ-PBP.ifc')));

const WID = Number(process.argv[2] ?? 63430);

function subMeshes(eID) {
  const mesh = api.GetFlatMesh(modelID, eID);
  const out = [];
  for (let gi = 0; gi < mesh.geometries.size(); gi++) {
    const placed = mesh.geometries.get(gi);
    const geom = api.GetGeometry(modelID, placed.geometryExpressID);
    const verts = api.GetVertexArray(geom.GetVertexData(), geom.GetVertexDataSize());
    const idxs = api.GetIndexArray(geom.GetIndexData(), geom.GetIndexDataSize());
    const m = placed.flatTransformation;
    const V = [];
    for (let vi = 0; vi < verts.length; vi += 6) {
      const lx = verts[vi], ly = verts[vi+1], lz = verts[vi+2];
      V.push([ m[0]*lx+m[4]*ly+m[8]*lz+m[12], m[1]*lx+m[5]*ly+m[9]*lz+m[13], m[2]*lx+m[6]*ly+m[10]*lz+m[14] ]);
    }
    out.push({ geomID: placed.geometryExpressID, V, idx: Array.from(idxs) });
    geom.delete();
  }
  return out;
}

const subs = subMeshes(WID);
// bepaal assen uit de totale bbox: dunste = dikte (t), hoogste variatie… we kennen up niet zeker → we
// kiezen height = de as met de op-één-na-grootste extent NIET zijnde dikte; length = grootste.
let all = { min:[Infinity,Infinity,Infinity], max:[-Infinity,-Infinity,-Infinity] };
for (const s of subs) for (const v of s.V) for (let k=0;k<3;k++){ if(v[k]<all.min[k])all.min[k]=v[k]; if(v[k]>all.max[k])all.max[k]=v[k]; }
const ext = [0,1,2].map(k => all.max[k]-all.min[k]);
const upName = (process.argv[3] ?? 'Y').toUpperCase();        // BIL-MOO is Y-up
const hAxis = { X:0, Y:1, Z:2 }[upName];                       // hoogte = up-as
const tAxis = ext.indexOf(Math.min(...ext.map((e,k)=> k===hAxis ? Infinity : e))); // dikte = dunste (niet-up)
const lAxis = [0,1,2].find(k => k!==hAxis && k!==tAxis);       // lengte = de rest
const mm = v => Math.round(v*1000);
const Ycut = (all.min[hAxis]+all.max[hAxis])/2;

// snijd driehoeken met height=Ycut → segmenten in (l,t)
const segsPerSub = subs.map((s) => {
  const segs = [];
  for (let ti=0; ti<s.idx.length; ti+=3) {
    const tri = [s.V[s.idx[ti]], s.V[s.idx[ti+1]], s.V[s.idx[ti+2]]];
    const pts = [];
    for (let e=0;e<3;e++){
      const a=tri[e], b=tri[(e+1)%3];
      const ha=a[hAxis], hb=b[hAxis];
      if ((ha<Ycut && hb>=Ycut) || (hb<Ycut && ha>=Ycut)) {
        const u=(Ycut-ha)/(hb-ha);
        pts.push([ mm(a[lAxis]+u*(b[lAxis]-a[lAxis])), mm(a[tAxis]+u*(b[tAxis]-a[tAxis])) ]);
      }
    }
    if (pts.length===2) segs.push(pts);
  }
  return { geomID: s.geomID, tSpan: mm(Math.max(...s.V.map(v=>v[tAxis]))-Math.min(...s.V.map(v=>v[tAxis]))), segs };
});
const off = [mm(all.min[lAxis]), mm(all.min[tAxis])];
const result = {
  wID: WID, axes: { lAxis:'XYZ'[lAxis], hAxis:'XYZ'[hAxis], tAxis:'XYZ'[tAxis] },
  Lrange:[0, mm(all.max[lAxis]-all.min[lAxis])], Trange:[0, mm(all.max[tAxis]-all.min[tAxis])],
  subs: segsPerSub.map(s=>({ geomID:s.geomID, tSpan:s.tSpan, segs: s.segs.map(([p,q])=>[[p[0]-off[0],p[1]-off[1]],[q[0]-off[0],q[1]-off[1]]]) })),
};
fs.writeFileSync('spike/kozijn-slice.json', JSON.stringify(result));
console.log('raam', WID, 'assen', result.axes, 'L', result.Lrange, 'T', result.Trange, 'subs', result.subs.map(s=>`#${s.geomID}(span${s.tSpan}, ${s.segs.length}seg)`).join(' '));
api.CloseModel(modelID);
