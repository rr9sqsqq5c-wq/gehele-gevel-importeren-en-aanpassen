// SYNTHETISCHE CALC-WAND — een wand zonder IFC (lengte L × hoogte H × dikte intikken),
// die het minimale wand-contract vervult zodat een één-wand-groep bekleedbaar is in
// 3D + 2D + uittrekstaat. GEEN IFC-export, GEEN georef, SESSIE-ONLY (synthetic:true →
// uitgesloten van persist). Zie diagnose @128ba02.
//
// CONTRACT (ifc.js:1611 + wallOrigin ifc.js:1475-1492): expressID(string mag), length,
// height, openings([]), wallOrigin.{lengthAxis,heightAxis,thicknessAxis,lengthStart,
// heightStart,thicknessStart}. lengthEnd/heightEnd/thicknessEnd ingevuld; facadePoly:null mag.
//
// NAMESPACE: expressID = `syn_${n}` (string) → botst nooit met numerieke IFC-id's of de
// merge-prefix `m{n}_` (App.jsx:4152). ASSEN: Z-up default-frame (length=x, height=z,
// thickness=y) → correct zonder IFC; buildFullGroupFacadePattern legt halfsteens horizontaal
// langs x, rijen langs z.
export function makeSyntheticWall(L, H, dikte, n) {
  const length = Math.round(L);
  const height = Math.round(H);
  const thickness = Math.round(dikte);
  return {
    expressID: `syn_${n}`,
    name: `Calc-wand ${n}`,
    length,
    height,
    openings: [],
    facadePoly: null,
    synthetic: true,
    typeName: '(synthetisch)',
    storeyID: null,
    wallOrigin: {
      globalId: null,
      lengthAxis: 'x',
      heightAxis: 'z',
      thicknessAxis: 'y',
      lengthStart: 0,
      lengthEnd: length,
      heightStart: 0,
      heightEnd: height,
      thicknessStart: 0,
      thicknessEnd: thickness,
      wallInsideThickDir: 1,
      wallLengthDir: null,
      matLayerSense: null,
      matLayerSetDir: null,
      matOffsetMm: 0,
      spaceBoundaryType: null,
    },
  };
}
