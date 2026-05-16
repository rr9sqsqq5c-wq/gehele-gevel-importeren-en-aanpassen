# Exploration Report: SlimFort Rendering and Styling System

## 1. SVG Drawing Code for SlimFort Cross-Sections
Cross-sections (coupes) are primarily rendered as SVGs within `.\src\DetailBoek.jsx` and `.\src\SlimFortWerktekening.jsx`.

- **`.\src\DetailBoek.jsx`**:
  - `SystemSectionSVG`: Renders vertical and horizontal system sections.
  - `OpeningDetailSVG`: Renders details for headers (lintelbalk), sills (dorpel), and jambs (dagkant).
  - `CornerDetailSVG`: Renders outside corners and returns.
  - `TerminationDetailSVG`: Renders ground (maaiveld) and top (dakrand/parapet) terminations.
  - `SlimFortEpsSVG`: Renders EPS element cross-sections.
  - `SlimFortBracketSVG`: Renders bracket (beugel) details.
  - `SlimFortProfileSVG`: Renders profile (verbindingsprofiel) details.
- **`.\src\SlimFortWerktekening.jsx`**:
  - `SheetOverzicht`: Renders a system overview cross-section including the concrete wall, cavity, EPS core, and tongue & groove (T&G) details.

## 2. Material Fill and Stroke Colors
Colors are defined both globally and locally within rendering components.

- **Global Material Colors** (`.\src\lib\systemDefinitions.js`):
  - `concrete`: `#b0bec5`
  - `wood`: `#c8a96a`
  - `fiber_cement`: `#b0bfc8`
  - `ceramic`: `#dc6b4a`
  - `eps`: `#fde68a`
  - `aluminium`: `#9ca3af`
  - `air`: `#dbeafe`
  - `membrane`: `#a5f3fc`
  - `adhesive`: `#fcd34d`
  - `thermal_break`: `#bbf7d0`
- **SlimFort Specific Colors** (`.\src\SlimFortWerktekening.jsx`):
  - `Betonwand`: `#e2e8f0`
  - `Achterspouw`: `#fef3c7`
  - `EPS kern`: `#dbeafe`
  - `T&G`: `#ede9fe`
- **Panel Legend Colors** (`.\src\SlimFortWerktekening.jsx`):
  - `start`: `#16a34a`
  - `standard`: `#2563eb`
  - `end`: `#dc2626`
  - `clipped`: `#ea580c`
  - `return`: `#7c3aed`

## 3. Label, Annotation, and Dimension Text
Rendering and collision handling for annotations are centralized in helper components.

- **Components** (`.\src\DetailBoek.jsx`, `.\src\Werktekening.jsx`, `.\src\SlimFortWerktekening.jsx`):
  - `DimH` & `DimV`: Horizontal and vertical dimension lines with arrows and text.
  - `DimChain`: Chained dimensions for multiple layers.
  - `LayerLabel`: Rotated text labels for material layers.
  - `ScrewSymbol` & `AnchorSymbol`: Visual markers for fixings.
- **Collision Handling**:
  - `buildLeaderAnchors` in `.\src\lib\sectionOrientation.js`: Calculates non-overlapping positions for leader lines and labels based on layer thicknesses.

## 4. Print/Export-Specific CSS
Print styling is handled via injected styles and media queries.

- **`.\src\Werktekening.jsx`**: Injects CSS into new windows for printing:
  - `body { margin:0; padding:16px; background:#fff }`
  - `svg { max-width:100%; height:auto }`
  - `@media print { body { padding:0 } }`
- **`.\src\DetailBoek.jsx`**:
  - `@media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } .page-section { page-break-after: always; } }`
- **`.\src\Uittrekstaat.jsx`**:
  - `@media print { .no-print { display: none !important; } body { font-size: 10pt; } }`

## 5. Werktekening.jsx Export Flow and SVG-to-PDF Pipeline
The application uses a "Print to PDF" strategy rather than a direct PDF generation library.

- **Flow**:
  1. User clicks an export button (e.g., `Afdrukken`, `Productie export`).
  2. Component opens a new browser window using `window.open('', '_blank')`.
  3. SVG content is serialized and written into the new window's document.
  4. CSS is injected for layout and page breaks.
  5. `window.print()` is triggered on load, allowing the user to select "Save as PDF".

## 6. Major Sections Components
The following sections are managed in `.\src\DetailBoek.jsx` via the `TABS` configuration (Line 136):

- **Systemen**: `SystemSectionSVG`
- **Openingen**: `OpeningDetailSVG` (Header, Sill, Jamb)
- **Hoeken**: `CornerDetailSVG` (Outside, Return)
- **Maaiveld**: `TerminationDetailSVG` (variant: `ground`)
- **Dakrand**: `TerminationDetailSVG` (variant: `top`/`bovenzijde`)
- **SlimFort**: Specialized tabs for SlimFort components (`SlimFortEpsSVG`, etc.)

## 7. Overflow and Scroll CSS in Export Contexts
- **Containers**: `overflow: 'hidden'` is used on main layout wrappers to prevent scrollbars in print output.
- **Tables**: `overflowX: 'auto'` is used in the UI (e.g., `Uittrekstaat.jsx`) but typically removed or forced to 100% width in print views to ensure all data is visible.
- **SVG scaling**: `svg { max-width: 100%; height: auto }` ensures drawings fit within the page width.

## 8. Keyplan Component and Group Card Styling
- **Component**: `TabKeyplan` in `.\src\DetailBoek.jsx`.
- **Layout**: A responsive CSS grid: `display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12`.
- **Card Styling**:
  - `border`: `1px solid #e2e8f0`
  - `borderRadius`: `8px`
  - `padding`: `14px`
  - `background`: `#f8fafc`
  - Uses `buildSystemLayers` and `getSystemInfo` to display summary data for each facade group.
