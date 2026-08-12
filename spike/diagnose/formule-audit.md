FASE 0c — FORMULE-AUDIT @ 9130bba
434 mod 110 = 104
🔴 PRODUCTIEDEFECT — mal met 3 i.p.v. 4 sleuven bereikbaar via Export-werkbalk knop "⬇ Mal recept CSV" ([App.jsx:6144](src/App.jsx#L6144))

**Modus** READ-ONLY MEET — niets aan bestaande code gewijzigd, geen commit.
Spike uitgebreid: [spike/diagnose/kramatweg-crosscheck.mjs](spike/diagnose/kramatweg-crosscheck.mjs) (wegwerp, niet committen).

---

## V1..V3 — BEREIKBAARHEID

### V1 — route naar handleExportMalRecept 🔴 (bereikbaar in productie)
Aangeroepen door `<button onClick={handleExportMalRecept}>` **"⬇ Mal recept CSV"**
([App.jsx:6144-6145](src/App.jsx#L6144)) in de **Export-werkbalk** ([App.jsx:6095-6096](src/App.jsx#L6095)).
Conditie: **`groups.some((g) => getSettings(g.id).panelen?.enabled)`** ([App.jsx:6140](src/App.jsx#L6140))
— géén feature-vlag, géén `import.meta.env.DEV`-guard; dus **aanwezig in een `vite build`**
(gewone render zodra één groep panelen aan heeft).

### V2 — letterlijke 12-koloms kopregel 🟢
Uit [App.jsx:4814](src/App.jsx#L4814):
```
Groep · Zone · Paneel · Breedte mm · Hoogte mm · Dikte mm · Rijen totaal · Rijen per mal · Mal-doorgang · Doorgangen totaal · Lagenmaat mm · Slede posities in mal (mm)
```
(letterlijke array: `['Groep', 'Zone', 'Paneel', 'Breedte mm', 'Hoogte mm', 'Dikte mm', 'Rijen totaal', 'Rijen per mal', 'Mal-doorgang', 'Doorgangen totaal', 'Lagenmaat mm', 'Slede posities in mal (mm)']`).

### V3 — "mal-recept" in docs/commits? 🟠 ONBEKEND → geen bewijs van productie-gebruik
`git grep "mal-recept"` = **alleen** [App.jsx:4902](src/App.jsx#L4902) (de download-bestandsnaam);
`README.md`/`DEPLOY.md` bestaan **niet** in de repo; `git log --all --grep=mal -i` levert geen
commit die specifiek een mal-recept beschrijft (alleen ruis-matches). **Aanwijzing dat er ooit een
echt mal-recept naar productie ging: ONBEKEND** (geen positief spoor; wél een bereikbare knop).

---

## V4..V8 — FORMULE-AUDIT

### V4 — letterlijke telformules + laagmaat-herkomst 🟢
- **Gevel-generator** ([pattern.js:616](src/lib/pattern.js#L616)):
  `` const lagen = lagenmaat > 0 ? Math.ceil(height / lagenmaat) : 0; `` → **`ceil`**.
- **Mal-recept** ([panelization.js:664](src/lib/panelization.js#L664)):
  `` const totalRows = Math.max(1, Math.floor(panel.height / lagenmaat)); `` → **`floor`** (met clamp `max(1,…)`).
- **Laagmaat** — gevel ([pattern.js:95-97](src/lib/pattern.js#L95)):
  `` if (verband === 'staand_tegelverband') return material.steenL + material.lint; return material.steenH + material.lint; ``
  Mal-recept ([panelization.js:657](src/lib/panelization.js#L657)):
  `` const lagenmaat = verband === 'staand_tegelverband' ? steenL + lint : steenH + lint; `` — **identieke** definitie (`steenH + lint`).

### V5 — sweep H=50..1500 (steenH=100, lint=10, laagmaat=110) 🟢
Gemeten (spike):

| variant | # H afwijkend van n_ref | eerste afwijkende H (getallen) |
|---|---|---|
| `n_pattern` (ceil) | **1308** | H=50 → n_pattern=1, n_ref=0 |
| `n_mold` (floor+clamp) | **170** | H=50 → n_mold=1, n_ref=0 |
| `n_ceil` | 1308 | H=50 → n_ceil=1, n_ref=0 |

`n_pattern` **overtelt** (ceil) op de hele resten-band 1..99 mm; `n_mold` **ondertelt** structureel
zodra `H mod 110 ∈ [100,109]` (o.a. **H=434 → 3 i.p.v. 4**) plus de `max(1,…)`-clamp aan de
onderkant. `n_pattern == n_ceil` altijd (beide `ceil`).

### V6 — n_ref los geverifieerd 🟢
`floor((H+10)/110)` voldoet voor **elke** H aan `110·n_ref − 10 ≤ H < 110·(n_ref+1) − 10`:
**0 schendingen** (spike). n_ref = het fysiek exacte "max. aantal lagen dat past"
(n lagen = `n·steenH + (n−1)·lint = 110n − 10 ≤ H`).

### V7 — biconditional weerlegd; is ceil de fix? 🔴 nee 🟢
De bewering "`n_ceil == n_ref` precies dan als `H mod 110 ≥ 100`" is **onjuist**: **13 fails**
(spike), eerste H=110 (`H%110=0`, n_ceil=1=n_ref maar rhs=false). Correcte voorwaarde: **`H%110 == 0`
óf `H%110 ≥ 100`**; `n_ceil != n_ref` bij **1308** H-waarden. **In één zin: `ceil` is NIET de fix —
`ceil` matcht de referentie alleen als `H%110` 0 of ≥100 is; de universele fix is
`n = floor((H + lint) / laagmaat)`** (= n_ref).

### V8 — eerste hart 🟢
Eerste laag ligt op de paneelbodem (`row.y = round2(r*lagenmaat)`, r=0 → 0,
[pattern.js:619](src/lib/pattern.js#L619)); hart = **`steenH/2` boven de onderrand, geen lintvoeg
onder de eerste laag** (consumptie `row.y + steenH/2` [Viewer3D.jsx:262](src/Viewer3D.jsx#L262);
`r*lagenmaat + round(steenH/2)` [panelization.js:671](src/lib/panelization.js#L671)). Sweep
reproduceert **hart = 50 voor H=434** ✅.

---

## V9..V10 — DE TWEEDE VERBORGEN AFLEIDING

### V9 — slede-Y voor 1972×434 🔴 (niet 73/196)
`generateMoldRecipe` geeft per maldoorgang **`[50 | 160]`** (pass 1) en **`[50]`** (pass 2),
**teruggezet naar 0 per pass** — dus **eerste rij 50, hoh 110**, **níet 73 en 196**. De mal-steek =
**`lagenmaat = steenH + lint` = 110** ([panelization.js:657](src/lib/panelization.js#L657)); eerste
slede = **`round(steenH/2)` = 50** ([panelization.js:671](src/lib/panelization.js#L671)) — dus
`steenH + lintvoeg`, **niet** `steenH + speling`.

### V10 — sub-panelen 1972→3 🟠 (panelizeZone zelf, brick-grid-raster)
`targetWidth = min(w, 5·steenL + 4·stoot) = min(1972, 1090) = **1090**`, een **afgeleide constante**
uit het materiaal-grid ([panelization.js:718,726](src/lib/panelization.js#L718)); `w = 1972` is
**UI** (`panelen.breedte`, [panelization.js:705](src/lib/panelization.js#L705)). `panelizeZone` splitst
1972 → **990 / 877 / 99** (`nCols = round(1972/1090) = 2`, breaks op stootvoegen + `PANEL_GAP` 3,
[panelization.js:523,529-535,447](src/lib/panelization.js#L523)). Dit is **dezelfde** `panelizeZone`
(geen tweede panelisator) en het **brick-grid-raster**, **niet** de fysieke mal-plaatbreedte
(`moldLengte = 3400` staat er los van, [panelization.js:659](src/lib/panelization.js#L659)).

---

## V11..V13 — KOPPELSTRIP-CONTRACT

### V11 — detectKoppelstrippen 🟢 (telt/tagt, knipt NIET)
Input `(panels, facadeRows, mat, verband)`, output een **apart `koppel[]`-array** van objecten
`{ x, y, width, height, label, strip_type:'koppelstrip', …, crosses_panel_boundary:true, panelIds }`
([panelization.js:608-641](src/lib/panelization.js#L608)). Een naad-kruisende piece wordt **niet
geknipt en niet gewijzigd** — de `row.pieces`-lijst blijft onaangeroerd; de piece wordt alleen
**verzameld/getagd** als hij ≥2 panelen overspant ([panelization.js:626-636](src/lib/panelization.js#L626)).
**Minimale striplengte / klezoor-regel: ONBEKEND/afwezig** hier (geen lengte-drempel in de functie;
`return []` voor wildverband [panelization.js:609](src/lib/panelization.js#L609)).

### V12 — wildverbandKoppelstrip.js: markeert, knipt niet 🟢 (niet voor halfsteens)
De koppelstrip is een **ontworpen, hele strip** (kol 0 op rij 2/4/6 van het volgpaneel) die de naad
**bij ontwerp** overspant; `buildTruthFacade` **markeert** hem met `koppelstrip:true` en knipt niets
([wildverbandKoppelstrip.js:117,125](src/lib/wildverbandKoppelstrip.js#L117); de stenen liggen
doorlopend, [regel 127](src/lib/wildverbandKoppelstrip.js#L127)). Contract = **vast 6-rij-waarheids-
paneel met exact 3 koppelstrippen** ([WILDVERBAND_TRUTH](src/lib/wildverbandKoppelstrip.js#L45-64));
**niet bruikbaar voor halfsteens** — halfsteens is een lopend verband zonder vaste koppelkolommen, dus
daar bestaat geen ontworpen koppelstrip (die moet post-hoc gedetecteerd, zie V11).

### V13 — naad x=990, halfsteens 1972×434 🟢
Gemeten (spike): **2 lagen doorlopend, 2 lagen stootvoeg-op-990**:
- laag 0 (y=0) & laag 2 (y=220): **DOORLOPEND** — steen `(start=880, length=210, Strek)` kruist 990.
- laag 1 (y=110) & laag 3 (y=330): **STOOTVOEG** exact op 990 (volgende steen start=990).

De naad snapt op de stootvoeg van de **oneven** rijen en snijdt de **even** rijen middendoor — bewijs
dat de halfsteens-verspringing een naad onmogelijk voor álle rijen op een voeg kan leggen.

---

## V14 — IFC-NAAD 🟢
Bevestigd [ifc.js:2078](src/lib/ifc.js#L2078): de strip-emissie loopt `for (const piece of row.pieces)`
over **`group.facadeData.rows`** ([ifc.js:2068,2077](src/lib/ifc.js#L2068)); per piece wordt **één**
`IFCRECTANGLEPROFILEDEF(...,piece.length,...)` ([ifc.js:2084](src/lib/ifc.js#L2084)) en **één**
`IFCBUILDINGELEMENTPROXY` ([ifc.js:2089](src/lib/ifc.js#L2089)) aangemaakt. **De paneelgrens speelt
hier niet mee** omdat `panels`/`panelizeZone` niet aan deze lus worden doorgegeven (strips = de
doorlopende `facadeData.rows`, panelen zijn een aparte laag). Dus een naad-kruisende piece
(bv. V13: start=880, length=210 over naad 990) wordt als **één** IfcElement geëxporteerd —
alleen vastgesteld, geen voorstel.

---

## SLOT
De **oorzaak** is een telformule-mismatch op één regel: de gevel telt lagen met **`ceil`**
([pattern.js:616](src/lib/pattern.js#L616)) en het mal-recept met **`floor`+clamp**
([panelization.js:664](src/lib/panelization.js#L664)), terwijl de fysiek-correcte telling
**`floor((H + lint) / laagmaat)`** is (V6, 0 schendingen). Voor H=434 (`mod 110 = 104 ≥ 100`) geeft dat
**4** lagen, maar `floor(434/110) = 3` → het bereikbare **"⬇ Mal recept CSV"** ([App.jsx:6144](src/App.jsx#L6144))
levert een mal met **3 i.p.v. 4 sleuven** en dropt de bovenste laag (hart 380). `ceil` is **niet** de
juiste reparatie (weerlegd in V7: fout bij `H%110 ∈ [1,99]`); de correcte fix is de n_ref-formule.
Daarnaast tel ik **twee** naast-elkaar verborgen afleidingen die het vulschema nu vertroebelen: de
`floor`-rijtelling (V5/V7) én het brick-grid sub-panel-raster dat 1972 in 990/877/99 hakt (V10),
beide los van de canonieke `facadeData.rows`. Koppelstrippen worden alleen **getagd, niet geknipt**
(V11/V12), en in de IFC blijft een naad-kruisende strip **één** element (V14) — het vulschema moet die
realiteit dus expliciet modelleren, niet de piece opsplitsen.
