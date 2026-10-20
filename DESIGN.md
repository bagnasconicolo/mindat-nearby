---
name: Mindat Nearby
description: The collection cabinet you carry. Mindat localities as ruled specimen labels, filed into steel drawers.
colors:
  steel: "#3c4b44"
  steel-deep: "#2f3c36"
  steel-line: "#556760"
  steel-ink: "#eef2ef"
  steel-muted: "#b8c6bf"
  brass: "#c49a3a"
  brass-deep: "#8a6614"
  brass-ink: "#241a03"
  brass-wash: "#fbf5e4"
  type-red: "#b3122a"
  red-wash: "#fbe9eb"
  ink: "#16202a"
  ink-2: "#47525c"
  card: "#ffffff"
  ground: "#dfe5e1"
  ground-line: "#c4cdc8"
  rule: "#cfd6d2"
  paper-hover: "#f1efe6"
typography:
  display:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 90"
  headline:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "22px"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 90"
  title:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "18px"
    fontWeight: 700
    lineHeight: 1.22
    fontVariation: "'wdth' 92"
  body:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  body-small:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    letterSpacing: "0.08em"
    fontVariation: "'wdth' 75"
  numeric:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    letterSpacing: "0.02em"
    fontFeature: "tnum"
    fontVariation: "'wdth' 88"
rounded:
  none: "0px"
  xs: "2px"
  sm: "3px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "18px"
components:
  button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "40px"
  button-hover:
    backgroundColor: "{colors.paper-hover}"
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "40px"
  button-brass:
    backgroundColor: "{colors.brass}"
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "40px"
  button-steel:
    backgroundColor: "{colors.steel}"
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.sm}"
    padding: "0 14px"
    height: "40px"
  button-filed:
    backgroundColor: "{colors.brass-wash}"
    textColor: "{colors.brass-ink}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  button-danger:
    backgroundColor: "{colors.card}"
    textColor: "{colors.type-red}"
    rounded: "{rounded.sm}"
    padding: "0 10px"
    height: "34px"
  specimen-label:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 14px"
  drawer:
    backgroundColor: "{colors.steel-deep}"
    textColor: "{colors.steel-ink}"
    rounded: "{rounded.sm}"
    padding: "8px 10px"
    height: "44px"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xs}"
    padding: "0 10px"
    height: "32px"
  chip-selected:
    backgroundColor: "{colors.brass-wash}"
  input-search:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "0 12px 0 38px"
    height: "40px"
  type-mark:
    backgroundColor: "{colors.type-red}"
    textColor: "{colors.card}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "1px 7px"
---

# Design System: Mindat Nearby

## Overview

**Creative North Star: "The Cabinet You Carry"**

Every locality is a specimen label and every list a drawer of a collection cabinet. The chrome is cabinet steel: a green-grey rail of drawer fronts with brass label holders and pulls. The content is bright white label stock, framed in blue-black ink, with printed field captions over hairline rules and the Mindat catalogue number set top-right in tabular figures. Type-specimen red marks type localities, following the museum convention of red-bordered type labels.

Density is that of a working collection, not a showcase: labels stack tightly (12px gaps), captions are condensed, numbers are tabular, and the map takes whatever room is left. One family, Archivo, carries everything; its width axis does the work other systems hand to a second face (condensed for captions and numbers, near-normal for names and prose). The world stays in light mode and reads in daylight on a phone.

The same label exists on screen and on paper. Print output produces cut-out specimen labels (two per row, 66mm tall, dashed cut lines, inner ink frame) and a catalogue list, so screen decisions must survive translation to A4.

**Key Characteristics:**
- Steel chrome, white label stock, blue-black ink, brass for what is active or filed, red for type localities.
- Square-cornered labels in a 1px ink frame with an inset hairline printed frame.
- Ruled forms: condensed uppercase field captions over hairline rules.
- One variable family (Archivo); width axis distinguishes captions, numbers and names.
- Tight corners everywhere else (2-3px); nothing pill-shaped.

## Colors

A cool steel-and-ink cabinet with one warm metal and one alarm colour, each with a narrow job.

### Primary
- **Cabinet Steel** (`steel`): the drawer rail, drawer cards on the phone, steel buttons, and the browser theme colour. The cabinet's body.
- **Drawer Shadow Steel** (`steel-deep`): drawer fronts within the rail, steel button borders and hover.
- **Rail Seam** (`steel-line`): drawer borders, rail dividers, dashed "new drawer" input.
- **Steel Light** (`steel-ink`) and **Steel Muted** (`steel-muted`): text and icons on steel; muted carries counts, captions and secondary rail text.

### Secondary
- **Brass** (`brass`): the active drawer's pull bar and border, label holders, stop numbers on route pins, saved-place pins, the primary action on a full label ("Archivia" / "Metti in un cassetto"), focus rings and selection tint.
- **Aged Brass** (`brass-deep`): brass borders, the filed state, archive icon, caret, "filed" mark; the readable brass on white.
- **Brass Shadow** (`brass-ink`): text on brass fills.
- **Brass Wash** (`brass-wash`): the background of filed buttons, selected chips and notices.

### Tertiary
- **Type-Specimen Red** (`type-red`): type-locality marks (the "Località tipo" tag, TL minerals, the 2px inner frame of a type label, the print label's heavy frame), plus error text, error toasts and destructive buttons.
- **Red Wash** (`red-wash`): hover ground of destructive buttons only.

### Neutral
- **Label Ink** (`ink`): text, label frames, search bar and input borders, the pressed radius step, ink buttons, toasts.
- **Faded Ink** (`ink-2`): secondary text, field captions on small labels, catalogue numbers, formulas.
- **Label Stock** (`card`): label, search bar, buttons, menus. Pure white, never cream.
- **Cabinet Ground** (`ground`): the panel and page behind labels; skeleton blocks.
- **Ground Seam** (`ground-line`) and **Hairline Rule** (`rule`): panel dividers and the ruled lines inside labels and fields.
- **Paper Hover** (`paper-hover`): hover ground on white controls (buttons, radius steps, menu items, suggestions).

### Named Rules
**The Red Is Earned Rule.** Red appears only for type localities and for errors or destruction. Never as decoration, accent or emphasis.

**The Brass Means Filed Rule.** Brass marks what is active or kept: the open drawer, a filed label, a saved pin, the filing action. An unfiled, inactive thing is never brass.

## Typography

**Display Font:** Archivo (variable, weight 400-800, width 62-125%), with system-ui fallback
**Body Font:** Archivo
**Label/Mono Font:** Archivo at condensed width (`wdth` 75-88) with tabular figures

**Character:** a sturdy grotesque printed on a museum label. Width does the hierarchy work: condensed captions and numbers sit against wider, heavy locality names.

### Hierarchy
- **Display** (700, 25px, 1.15, `wdth` 90): the locality name on an opened full label; 22px on phones.
- **Headline** (750, 22px, 1.2, `wdth` 90): panel headings (the current search, a drawer's name); a lighter 450-weight ink-2 run may follow inside the same heading.
- **Title** (700, 18px, 1.22, `wdth` 92): locality name on a label in the stack; 17px on phones.
- **Body** (400, 15px, 1.45): base text. Field values, mineral lists and descriptions run at 14-14.5px (body-small); description measure caps at 70ch.
- **Label** (700, 12px, 0.08em, uppercase, `wdth` 75): printed field captions (Tipo, Minerali, Coordinate, Descrizione, Note, Cassetti) and menu captions; 11.5px/600 inside small labels.
- **Numeric** (400, 12.5px, tabular, `wdth` 88): catalogue numbers ("N. 1234"), counts, radius steps, coordinates.
- **Brand** (800, 24px, `wdth` 75) for "Mindat", with "Nearby" at 500/15px in steel-muted. Rail only.

### Named Rules
**The Printed Caption Rule.** Uppercase condensed captions exist only as field captions on a ruled form or caption for a group in the rail or a menu, always directly attached to the content they name. They are never floated above a heading as a tagline.

**The Tabular Number Rule.** Every number a user compares (catalogue numbers, counts, radii, coordinates, route stops) is set in tabular figures.

## Layout

Desktop (900px and up) is a three-column cabinet: steel rail at left (236px), search bar across the top (64px), map filling the centre, and the label panel on the right (440px). Between 900 and 1180px the rail narrows to 200px and the panel to 380px.

Below 900px the shell becomes a single column: search bar on top (wrapping to two rows: place field full width, then locate button and a stretched radius stepper), the map behind, the label panel as a bottom sheet (default 66% height, draggable by a 24px handle), and the rail as a bottom bar of equal drawer buttons with counts pinned top-right and safe-area padding.

The panel's spacing rhythm is small and steady: 18px panel padding (12-14px on phones), 12px between labels, 6px between rail drawers and action buttons, 8px inside toolbars. Field grids use a fixed caption column (74px on stack labels, 96px on full labels) so values align down the label.

Print uses A4 with 12mm margins: a two-up grid of 66mm cut-out labels, or a numbered catalogue list.

## Elevation & Depth

Hybrid and restrained. Labels sit on the ground like cards on a felt tray: a 1px seam plus a soft, low ambient shadow, lifting slightly on hover. Steel drawer fronts get pressed-metal treatment (an inner top highlight and a 1px dark lip); brass holders and the drawer plate are recessed (inset shadow). Popovers (menus, suggestions) use a short soft shadow; toasts and the filing ghost use the deepest shadows because they float above everything.

### Shadow Vocabulary
- **Label rest** (`box-shadow: 0 1px 0 var(--ground-line), 0 3px 10px rgb(22 32 42 / 0.07)`): every specimen label at rest.
- **Label lift** (`box-shadow: 0 1px 0 var(--ground-line), 0 8px 22px rgb(22 32 42 / 0.13)`): hover on a stack label, with a 1px rise.
- **Drawer front** (`box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.06), 0 1px 0 rgb(0 0 0 / 0.25)`): steel drawers in the rail.
- **Holder recess** (`box-shadow: inset 0 1px 2px rgb(0 0 0 / 0.18)`): brass label holders.
- **Popover** (`box-shadow: 0 4px 10px rgb(22 32 42 / 0.18)`): menus and place suggestions.
- **Sheet** (`box-shadow: 0 -6px 18px rgb(22 32 42 / 0.16)`): phone bottom sheet.
- **Float** (`box-shadow: 0 10px 28px rgb(0 0 0 / 0.25)`): toasts; the filing ghost uses `0 18px 40px rgb(22 32 42 / 0.3)`.

### Named Rules
**The Soft Shadow Rule.** Shadows are blurred and ambient. No hard offset shadows; depth on metal comes from inset highlights and recesses, not from offset blocks.

## Shapes

Labels are square: 0 radius, 1px ink frame, and an inset printed frame (1px hairline rule, 3px in; 4px in on full labels; 2px red on type localities). Everything that is hardware rather than paper takes a tight 3px corner (buttons, inputs, drawers, menus, the radius stepper) or 2px (chips, holders, counts, stop numbers, notes field). Map pins are 16px squares in an ink border (24px when numbered); the only circle is the search-centre crosshair. Dashed borders mean "not yet": the new-drawer input and empty states.

**The Square Label Rule.** A specimen label never has rounded corners. Rounding belongs to the hardware around it, and never exceeds 3px.

## Components

### Buttons
Hardware on the label: compact, ink-framed, weight 600.
- **Shape:** tight corners (3px), 1px ink border, 40px tall (34px small), 0 14px padding (0 10px small), 7px icon gap.
- **Default:** white with ink text; hover to paper-hover; active drops 1px.
- **Ink:** filled ink, white text; for search and navigation ("Naviga", "Cerca qui intorno").
- **Brass:** the filing action on a full label and drawer creation; brass fill, aged-brass border, brass-shadow text, faint inner highlight.
- **Steel:** steel fill for locate/refresh; spins its icon while busy.
- **Archive / Filed:** "Archivia" on a stack label is a white button with an aged-brass icon; once filed it becomes a brass-wash button naming the drawer(s).
- **Quiet:** borderless, transparent; for back links and secondary actions.
- **Danger:** red text and border, red-wash hover; only in a separated danger zone.

### Chips
- **Style:** white, 1px ground-line border, 2px corners, 32px tall, 14px text.
- **State:** selected (drawer membership on a full label) turns brass-wash with an aged-brass border and 600 weight.

### Specimen Label (signature)
- **Corner Style:** square.
- **Background:** label stock white; ink frame plus inset printed frame.
- **Shadow Strategy:** label rest / label lift (see Elevation).
- **Structure:** catalogue number top-right in numeric type; locality name in title type; place hierarchy in ink-2; a field grid of condensed captions and values; elements as a run of bold condensed symbols that invert to ink on hover; actions row (Archivia, Naviga, reorder in drawers).
- **Full label:** display-size name, red "Località tipo" tag and brass "Archiviato" mark, a ruled field table (ink top rule, hairline row rules), then captioned sections (Minerali in two columns with TL in red and formulas in ink-2, Descrizione, Note on a ruled notepad textarea, Cassetti as chips).
- **Type locality:** 2px red inner frame; red TL markers.

### Drawers (signature)
- **Rail drawer:** steel-deep front, 1px seam border, 3px corners, 44px min height, icon + name + count. Active drawer: brass border and a 3px brass pull bar on its left edge (bottom edge on phones), icon in brass.
- **User drawer (cassetto):** the front carries a brass label holder: off-white slip in a 1.5px brass border, recessed. Active holders go white with a brighter brass edge.
- **Filing:** the label shrinks into its drawer as a ghost and the drawer's count bumps (scale 1.25, flashes brass). Motion is disabled under reduced-motion.
- **Drawer plate:** a drawer's header in the panel is a white plate in a 2px brass border, recessed.

### Inputs / Fields
- **Style:** white, 1px ink border, 3px corners, 40px tall; place search carries an inline search glyph at 12px. The in-panel filter uses a ground-line border that turns ink on focus.
- **Focus:** 2px brass outline (global `:focus-visible` uses 2px brass, 2px offset).
- **Notes:** ruled notepad textarea, 24px line rhythm on near-white.

### Navigation
- **Rail (desktop):** brand, the two fixed drawers (Intorno, Salvati/Archivio), a "Cassetti" caption with user drawers, a dashed new-drawer input, and a footer with email and "Esci".
- **Bottom bar (phone):** the fixed drawers as equal columns, 52px tall, 12.5px names, counts pinned top-right.
- **Radius stepper:** segmented ink-framed control, tabular steps; pressed step fills ink.

### Map Pins
- Square white pins in a 2px ink border; saved pins are brass; selected pins invert to ink with a white border and scale 1.3; numbered route stops are 24px brass squares with tabular numerals. Route lines are dashed aged brass.

## Do's and Don'ts

### Do:
- **Do** keep labels square with the 1px ink frame and inset hairline frame; switch the inset frame to 2px red for type localities.
- **Do** set field captions in Archivo at `wdth` 75, uppercase, 0.08em tracking, over hairline rules.
- **Do** set every catalogue number, count, radius and coordinate in tabular figures at `wdth` 88.
- **Do** use brass for the active drawer, filed state, saved pins and the filing action, and nowhere else.
- **Do** keep hardware corners at 3px (2px for chips and holders).
- **Do** design every label view so it can print as a 66mm cut-out label.

### Don't:
- **Don't** round specimen labels or use radii above 3px anywhere.
- **Don't** use red for anything other than type localities, errors and destructive actions.
- **Don't** tint the label stock cream; labels are pure white on a cool steel-grey ground.
- **Don't** add a second typeface; vary Archivo's width and weight instead.
- **Don't** float uppercase captions above headings as taglines; captions belong to ruled fields and groups.
- **Don't** use hard offset shadows; depth is soft ambient shadow or inset metal.
