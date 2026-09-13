# BasiDraft

BasiDraft is developed directly from the QCAD Community Edition source tree.

Upstream baseline: qcad/qcad commit 1bf8d0c6f83b7bb034cfd62b7346255370b9ddca (QCAD 3.33.1).

## Product purpose

BasiDraft is not a replacement for BAZIS-Mebelshchik and is not a parallel CAD reimplementation.
It is the drawing/documentation layer between geometry prepared in BAZIS and the final human-readable drawing set / PDF.

The 3D model, orthogonal views, sections and exploded representations remain authored in BAZIS.
BasiDraft imports the prepared LDW geometry and concentrates on drawing composition, dimensions, annotations, revision control and output.
Reverse transfer from BasiDraft back into BAZIS is not required.

Primary goals:
- remove repetitive manual dimensioning work;
- preserve compact, human-oriented drawing sets instead of generating one sheet per part;
- reduce errors after model revisions;
- progressively add reliable associative behaviour to imported 2D geometry.

## Development principles

- modify the original CAD source tree directly, not a parallel reimplementation;
- Windows x64 is the primary target;
- Russian is the primary UI language;
- preserve upstream GPLv3 and all third-party license notices;
- preserve a working baseline and add features incrementally;
- never silently guess when geometry matching is ambiguous: automate confident matches and mark the rest for review;
- first establish a reproducible clean build, then simplify the UI and add BasiDraft automation.

## Target workflow

1. Build and revise the furniture model in BAZIS-Mebelshchik.
2. Prepare the required perspective view, front / side / top views, sections, detail nodes and exploded view in BAZIS.
3. Import prepared LDW drawings into BasiDraft.
4. Compose a compact multi-sheet document using reusable sheet / title-block templates.
5. Apply manual, semi-automatic or automatic dimensions and annotations.
6. On a revised LDW import, compare geometry with the previous revision and update reliable associative dimensions.
7. Clearly flag changed views, unresolved geometry links and dimensions that require verification.
8. Export the complete drawing set to one PDF.

## Core object model

A placed drawing view must become a first-class BasiDraft object rather than an anonymous collection of lines.
Each view stores at least:
- view identity and type (front, side, top, section, detail, exploded view, part);
- source geometry and source revision fingerprint;
- sheet position, scale and transform;
- semantic geometry anchors;
- attached dimensions and leaders;
- revision / matching status (`current`, `changed`, `review_required`, `broken_link`).

A dimension should reference semantic geometry whenever possible instead of fixed screen coordinates.
Examples include outer left/right edges, top/bottom edges, shelf centre lines, hole centres, groove edges and characteristic contour vertices.

## Main functional requirements

### LDW import
- import BAZIS LDW geometry as faithfully as possible;
- preserve layers and all structural information useful for later analysis;
- keep imported geometry available for semantic recognition instead of flattening it into pixels.

### Sheets and documentation
- multi-sheet documents;
- reusable sheet / frame / title-block templates;
- automatic sheet numbering and editable description fields;
- compact composition of several details or views on one sheet;
- export the complete set to a single PDF.

### Dimensions
- BasiDraft-owned dimension appearance and editing, independent of BAZIS-Draw limitations;
- configurable arrow / terminator styles;
- overall dimensions;
- dimension chains;
- dimensions to shelf centres for drilling information;
- dimensions for holes, grooves, cut-outs and characteristic contour geometry;
- manual, semi-automatic and automatic dimensioning modes;
- collision-aware placement where practical.

### Associativity and revision control
- store semantic anchors for dimensions and leaders;
- compare an updated LDW view with its previous revision;
- detect and highlight changed geometry;
- preserve sheet position, scale and presentation while replacing matched source geometry;
- automatically recalculate dimensions whose anchors are matched with high confidence;
- mark uncertain, missing or broken links for explicit user review;
- never present an uncertain automatic update as verified.

### Exploded views and leaders
- retain manual control over the exploded representation itself;
- provide semi-automatic leader / part-number layout;
- move labels into readable free space;
- reduce leader crossings and geometry overlaps;
- leave final correction to the user when several layouts are equally plausible.

## Implementation roadmap

### M0 — foundation
- keep the current QCAD-based BasiDraft build working;
- locate the correct extension points in `io`, `entity`, `operations` and `gui`;
- implement LDW import inside the existing source tree;
- establish regression samples for known LDW files.

### M1 — first useful automation
- reliably open LDW geometry;
- identify the geometry of one selected view;
- compute its characteristic / overall bounds;
- create a correct BasiDraft overall dimension automatically.

**Milestone 1 acceptance test:** open an LDW, select one drawing view and automatically place the correct overall dimension.

### M2 — furniture-oriented dimensioning
- dimension chains;
- semantic edge / centre recognition;
- shelf-centre dimensions;
- semi-automatic dimensions for holes, grooves and cut-outs.

### M3 — drawing views and semantic anchors
- introduce persistent drawing-view identity;
- persist semantic geometry anchors and their confidence;
- attach dimensions and leaders to those anchors.

### M4 — revision matching
- compare old and new LDW revisions;
- recognise the same view after geometry changes;
- highlight modifications;
- update confidently matched associative dimensions;
- report everything that requires verification.

**Milestone 2 acceptance test:** load a changed version of the same view, recognise it as the previous view and automatically update a dimension whose semantic anchors still match.

### M5 — production-document automation
- semi-automatic exploded-view leader layout;
- smarter multi-detail sheet composition;
- further furniture-specific recognition and checking.

## Non-goals for the first stages

- replacing BAZIS 3D modelling;
- editing the BAZIS model from BasiDraft;
- reverse LDW transfer back into BAZIS;
- pretending to provide full SolidWorks-level parametric associativity before reliable geometry matching exists.
