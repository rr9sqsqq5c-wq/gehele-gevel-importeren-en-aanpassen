// planBridge.js — postMessage-brug tussen Brickboard (in een iframe) en een parent-planningstool
// (de "Brickboard-planner"). Volledig ADDITIEF: dit bestand wordt alleen geïmporteerd/aangeroepen
// achter de vlag isPlanBridge() (default UIT, zie featureFlags.js). Met de vlag uit wordt er niets
// geregistreerd en is het gedrag byte-identiek.
//
// Protocol (alle berichten hebben een type met prefix 'brickboard:'):
//   child → parent : { type:'brickboard:ready', version }                       (handshake bij init)
//   parent → child : { type:'brickboard:request-engineering' }                  → child antwoordt met engineering
//   child → parent : { type:'brickboard:engineering', version, payload }        (de engineering-JSON)
//   parent → child : { type:'brickboard:set-context', context }                 (projectkoppeling onthouden)
//   child → parent : { type:'brickboard:context-ack', version }
//
// VEILIGHEID:
//  - De parent-origin moet bekend zijn via ?bridgeOrigin=<origin> (door de planner meegegeven bij het
//    inbedden) of anders via document.referrer. Is die niet te bepalen, dan blijft de brug inert.
//  - Elk inkomend bericht wordt op event.origin === parentOrigin gecontroleerd.
//  - Er wordt NOOIT naar '*' gepost; uitgaande berichten gaan uitsluitend naar de vastgestelde
//    parentOrigin. Er worden geen ruwe wand-/geometrie- of opslaggegevens verstuurd — alleen de
//    door getEngineering() samengestelde, samenvattende payload.

const PREFIX = 'brickboard:';

function resolveParentOrigin() {
  // document.referrer is door de browser gezet (niet te spoofen via de URL) → LEIDEND.
  // De ?bridgeOrigin=-param mag die alleen BEVESTIGEN, nooit overschrijven; hij dient enkel als
  // fallback wanneer de referrer is weggelaten (bv. een strikte Referrer-Policy). Zo kan een
  // gemanipuleerde iframe-URL (?bridgeOrigin=https://kwaadaardig.example) de payload niet
  // omleiden zolang de echte referrer bekend is.
  let refOrigin = null;
  try { if (document.referrer) refOrigin = new URL(document.referrer).origin; } catch { /* ignore */ }
  let paramOrigin = null;
  try {
    const bo = new URLSearchParams(window.location.search).get('bridgeOrigin');
    if (bo) paramOrigin = new URL(bo).origin;
  } catch { /* ignore */ }
  if (refOrigin) return refOrigin;   // referrer aanwezig → altijd leidend (param mismatch genegeerd)
  return paramOrigin;                // geen referrer → val terug op de expliciete param
}

/**
 * Zet de brug op. Retourneert een object met destroy() (en sendEngineering() om ongevraagd te pushen).
 * @param {object} opts
 * @param {() => any} [opts.getEngineering] - bouwt de engineering-payload (aangeroepen op verzoek).
 * @param {(context:any) => void} [opts.onContext] - ontvangt de door de parent gezette projectcontext.
 */
export function createPlanBridge({ getEngineering, onContext } = {}) {
  // Alleen zin in een echt iframe (parent !== self).
  const target = (typeof window !== 'undefined' && window.parent && window.parent !== window) ? window.parent : null;
  const parentOrigin = resolveParentOrigin();
  if (!target || !parentOrigin) {
    return { parentOrigin: parentOrigin || null, active: false, destroy() {}, sendEngineering() {} };
  }

  let destroyed = false;

  function post(msg) {
    if (destroyed) return;
    try { target.postMessage(msg, parentOrigin); } catch { /* ignore */ }
  }

  function buildEngineering() {
    if (!getEngineering) return null;
    try { return getEngineering(); } catch { return null; }
  }

  function onMessage(e) {
    if (destroyed) return;
    if (e.origin !== parentOrigin) return; // origin-allowlist
    const d = e.data;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string' || d.type.indexOf(PREFIX) !== 0) return;
    switch (d.type) {
      case PREFIX + 'request-engineering':
        post({ type: PREFIX + 'engineering', version: 1, payload: buildEngineering() });
        break;
      case PREFIX + 'set-context':
        try { if (onContext) onContext(d.context ?? null); } catch { /* ignore */ }
        post({ type: PREFIX + 'context-ack', version: 1 });
        break;
      default:
        break;
    }
  }

  window.addEventListener('message', onMessage);
  post({ type: PREFIX + 'ready', version: 1 });

  return {
    parentOrigin,
    active: true,
    sendEngineering() { post({ type: PREFIX + 'engineering', version: 1, payload: buildEngineering() }); },
    destroy() { destroyed = true; window.removeEventListener('message', onMessage); },
  };
}
