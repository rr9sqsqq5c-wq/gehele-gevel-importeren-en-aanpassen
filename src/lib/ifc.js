/**
 * src/lib/ifc.js  —  Agent 1: IFC wand-loader
 *
 * Elke wand heeft:
 *   id          – unieke string
 *   name        – leesbare naam
 *   startPoint  – { x, y }  (meters, bovenaanzicht)
 *   endPoint    – { x, y }
 *   thickness   – wanddikte in meters (optioneel, default 0.2)
 *   height      – wandhoogte in meters (optioneel)
 *   properties  – vrij object met extra IFC-attributen
 */

/**
 * @typedef {{ x: number, y: number }} Point
 * @typedef {{
 *   id: string,
 *   name: string,
 *   startPoint: Point,
 *   endPoint: Point,
 *   thickness: number,
 *   height: number,
 *   properties: Record<string, unknown>
 * }} Wall
 */

/**
 * Verwerk een ruwe IFC-wandarray naar genormaliseerde Wall-objecten.
 * In productie vervangt u deze functie door een echte IFC.js-parser.
 *
 * @param {object[]} rawWalls  – ruwe wandobjecten uit IFC-bestand
 * @returns {Wall[]}
 */
export function parseWalls(rawWalls) {
  return rawWalls.map((w, i) => ({
    id: w.id ?? `wall-${i}`,
    name: w.name ?? `Wand ${i + 1}`,
    startPoint: { x: Number(w.startPoint?.x ?? 0), y: Number(w.startPoint?.y ?? 0) },
    endPoint: { x: Number(w.endPoint?.x ?? 0), y: Number(w.endPoint?.y ?? 0) },
    thickness: Number(w.thickness ?? 0.2),
    height: Number(w.height ?? 3.0),
    properties: w.properties ?? {}
  }));
}

/**
 * Demo-wandarray die Agent 2 gebruikt wanneer er nog geen echt IFC-bestand
 * beschikbaar is.  Stelt een eenvoudig rechthoekig gebouw voor.
 *
 * Coördinaten in meters, bovenaanzicht (X = oost, Y = noord).
 *
 *        (0,6)──────────(8,6)
 *          │                │
 *  (0,3)──(0,4)   (8,4)──(8,3)
 *          │                │   ← binnenste gang-wanden
 *  (0,2)──(0,1)   (8,1)──(8,2)
 *          │                │
 *        (0,0)──────────(8,0)
 *               + tussenliggende dwarswand (4,0)–(4,6)
 */
export const demoWalls = parseWalls([
  { id: 'w1',  name: 'Gevel Zuid',       startPoint: { x: 0, y: 0 }, endPoint: { x: 8, y: 0 } },
  { id: 'w2',  name: 'Gevel Oost',       startPoint: { x: 8, y: 0 }, endPoint: { x: 8, y: 6 } },
  { id: 'w3',  name: 'Gevel Noord',      startPoint: { x: 8, y: 6 }, endPoint: { x: 0, y: 6 } },
  { id: 'w4',  name: 'Gevel West',       startPoint: { x: 0, y: 6 }, endPoint: { x: 0, y: 0 } },
  { id: 'w5',  name: 'Dwarswand midden', startPoint: { x: 4, y: 0 }, endPoint: { x: 4, y: 6 } },
  { id: 'w6',  name: 'Gang West boven',  startPoint: { x: 0, y: 4 }, endPoint: { x: 4, y: 4 } },
  { id: 'w7',  name: 'Gang West onder',  startPoint: { x: 0, y: 2 }, endPoint: { x: 4, y: 2 } },
  { id: 'w8',  name: 'Gang Oost boven',  startPoint: { x: 4, y: 4 }, endPoint: { x: 8, y: 4 } },
  { id: 'w9',  name: 'Gang Oost onder',  startPoint: { x: 4, y: 2 }, endPoint: { x: 8, y: 2 } },
  { id: 'w10', name: 'Losstaande wand',  startPoint: { x: 1, y: 1 }, endPoint: { x: 3, y: 1 } }
]);
