---
version: 1
slug: "site-index-html"
primary_target: "site/index.html"
related_targets: []
---

# Surface: Mindat Nearby web app (site/index.html)

Scope: the whole authenticated web app at mindat.chicubo.it. Mode: Operate.
Audience/job: collectors planning trips at the desk and following them on the phone; find localities around a point, read what minerals occur there and the Mindat description, save them, group them into lists ("cassetti"), export to PDF and Google Maps.
Constraints: Mindat API via server proxy (10-results caps, occasional 504s); per-user data via Cloudflare Access email; Italian UI; must work one-handed on a phone in daylight.

## Direction contract

THESIS: every locality is a specimen label and every list a drawer of the collection cabinet; the app is the cabinet you carry. Refuses the category default of a map with a generic card list and a heart icon.

OWN-WORLD: cabinet-steel green-grey chrome (drawer rail, bars), bright white label card (not cream), blue-black ink, brass for the active drawer pull and holders, type-specimen red reserved for type-locality marks (the museum convention of red-bordered type labels). Labels are ruled forms: printed field captions (Località, Tipo, Minerali, Coordinate, Fonte) over hairline rules, catalogue number top-right in tabular figures. Archivo throughout, condensed widths for captions and numbers. No rounded cards: labels have square corners and a 1px ink frame; drawers have brass label holders.

STORY: the visitor sees what is around a point as a stack of labels, opens one to read its minerals and description, files it into a drawer, and takes the drawer out as printed labels, a catalogue PDF, or a Google Maps route.

FIRST VIEWPORT: desktop: steel rail at left with drawers (Intorno, Salvati, each cassetto with count); a search bar across the top (place name / coordinates / my position, radius stepper); map fills centre; right column a scrolling stack of labels for the current search. Opening a label replaces the stack with the full label. Phone: search bar on top, map upper 40%, label stack as a draggable sheet, drawers as a bottom bar. Primary action on each label: "Archivia" (file into drawer).

FORM: specimen label and collection cabinet, my top-ranked grounded candidate (position 1), chosen by the user as pick; seed key 308b1b95.

SIGNATURE INTERACTION: filing a label: the label slides and shrinks into its drawer in the rail and the drawer count ticks; printing a drawer produces real cut-out specimen labels.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved
- Shared lists between users; offline field use.
