# Opstartgids — IFC Brickslip Planner

## Wat heb je nodig?

- **Windows 10/11**
- **Node.js** geïnstalleerd (controleer via `node --version` in de opdrachtprompt, minimaal v18)
- De projectmap: `C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1`

---

## Stap 1 — Opdrachtprompt openen in de projectmap

1. Open **Verkenner** en ga naar de projectmap
2. Klik in de adresbalk bovenaan, typ `cmd` en druk op **Enter**
3. Er opent een zwart venster (opdrachtprompt) in de juiste map

Of via het Startmenu:
1. Druk op **Win + R**, typ `cmd`, druk Enter
2. Typ het volgende en druk Enter:
   ```
   cd /d "C:\Users\MurkAnneKooistraKooi\.zenflow\worktrees\multi-element-ifc-import-met-pat-e7f1"
   ```

---

## Stap 2 — Server starten

Typ in de opdrachtprompt:
```
npm run dev
```

Je ziet na een paar seconden:
```
VITE ready in ... ms
➜  Local:   http://localhost:5173/
```

De server draait nu. **Sluit dit venster NIET** — de server stopt dan.

---

## Stap 3 — App openen in de browser

Open **Microsoft Edge** of **Google Chrome** en ga naar:
```
http://localhost:5173/
```

De app laadt nu.

---

## App stoppen

Klik in het opdrachtprompt-venster en druk op **Ctrl + C**.  
Typ `J` als gevraagd wordt of je wilt stoppen.

---

## Problemen?

### "npm wordt niet herkend"
Node.js is niet geïnstalleerd. Download via: https://nodejs.org (kies de LTS-versie)

### "poort 5173 al in gebruik"
Er draait al een server. Sluit eerst alle opdrachtprompt-vensters en probeer opnieuw.
Of stop de bestaande node-processen via Taakbeheer (zoek op `node.exe`).

### App laadt niet / wit scherm
Ververs de pagina met **Ctrl + F5**.

---

## Workflow in de app

1. **IFC importeren** — klik op "Wandtype selecteren" of sleep een IFC-bestand
2. **Wandtype kiezen** — filter op het gewenste type (bijv. `Basic Wall:21.10_WA_LB_HSB_272.5`)
3. **Elementen selecteren** — klik op wanden in 3D, of gebruik de box-selectietool (↖ knop)
4. **Groep maken** — klik op "Groepeer selectie"
5. **2D configureren** — klik op "2D Gevel" voor patroon, zetwerk, panelen, latten, penanten
6. **Project opslaan** — klik op "💾 Project opslaan" → download een `.json` bestand
7. **Project herladen** — laad eerst het IFC, daarna "📂 Project laden" → open het `.json` bestand
8. **Exporteren** — klik op "⬇ Exporteer gevelbekleding IFC" voor een IFC met alleen de gevelbekleding

---

## Projectbestand opslaan en herladen

Het programma slaat GEEN gegevens automatisch op bij afsluiten.  
Sla altijd op via **"💾 Project opslaan"** voordat je de browser sluit of de server stopt.

Bij het herladen:
1. Start de server opnieuw (Stap 2)
2. Open de app (Stap 3)
3. Laad het IFC-bestand opnieuw
4. Klik op **"📂 Project laden"** en selecteer je opgeslagen `.json`

---

## Azure webversie (online)

De app is ook beschikbaar via:
```
https://orange-wave-02817151e.7.azurestaticapps.net
```

Op de webversie hoef je geen server te starten. Het IFC-bestand duurt langer om te laden dan lokaal.
