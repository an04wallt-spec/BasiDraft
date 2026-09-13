# BAZIS DXF research notes

This document records facts verified against real BAZIS drawings exported as DXF, plus paired LDW files where useful. Production drawings themselves are not committed to the public repository.

## Architectural conclusion

DXF is the preferred primary geometry transport from BAZIS into BasiDraft.

Reasons:

- QCAD already has a mature native DXF data model and importer;
- tested BAZIS DXF files reproduce visible geometry closely;
- geometry arrives as typed CAD objects instead of opaque binary records;
- ordinary block structure is available without reverse-engineering every LDW record;
- this lets BasiDraft spend engineering effort on geometry interpretation, automatic dimensions and revision tracking.

LDW research remains useful as an optional metadata / fallback path because LDW retains BAZIS-specific structure that is not necessarily exposed as ordinary DXF layers.

## Production import contract

Fully annotated test drawings are useful for reverse-engineering, but production BasiDraft input must not depend on BAZIS annotations.

Normal production input may contain only geometry. BasiDraft owns dimensions, text, leaders, section/detail labels, hatching and other drafting annotations.

See `docs/IMPORT_CONTRACT.md`.

## Verified DXF characteristics

A fully annotated real test sheet used AC1027 (AutoCAD 2013). Its model space contained typed dimensions, text, inserts and lines, which confirmed that QCAD can distinguish annotation objects from ordinary geometry.

A later **clean production-style pair** contained no DIMENSION or TEXT entities at all. Each clean file contained exactly:

- 548 top-level LINE entities;
- 22 top-level INSERT entities.

This clean pair is much closer to the intended BasiDraft workflow and confirms the contract:

`BAZIS geometry -> BasiDraft annotations`

## Layer loss / flattening

Tested DXF files expose only a minimal standard layer structure (`0`, one BAZIS content layer where applicable, `Defpoints`). BAZIS-specific hierarchy must not be assumed to survive as standard DXF layers.

Therefore BasiDraft creates its own authoritative internal structure after import.

## Block names are not stable identifiers

The clean revision pair proves that BAZIS renumbers anonymous DXF blocks between exports.

A logical view that was stored in one export under one anonymous block name can appear under another anonymous block name after a model edit, while its geometry remains almost identical.

Therefore:

- `*Bxx` names are diagnostics only;
- block names must never be persistent BasiDraft view IDs;
- revision matching must be based on geometry with tolerance and ambiguity handling.

## Verified revision pair: moved shelf

The pair `Чистый.dxf` and `Чистый (смещ.полки).dxf` contains the same drawing before and after moving one shelf.

Two geometry groups were affected.

### Large view group

Both versions contain 850 primitives in the corresponding logical group.

With coordinate tolerance `1e-4`:

- 847 primitives match;
- 3 old LINE primitives disappear;
- 3 new LINE primitives appear;
- similarity = `847 / 850 = 99.647%`.

The changed lines are the shelf geometry. Their Y coordinates shift by approximately `+2.772` DXF drawing units.

### Smaller related group

Both versions contain 18 LINE primitives.

With the same tolerance:

- 14 lines match;
- 4 old lines disappear;
- 4 new lines appear;
- similarity = `14 / 18 = 77.778%`.

Those four lines form the moved shelf rectangle and shift by the same approximately `+2.772` drawing units.

This is direct evidence that BasiDraft can treat a model edit as a **localized revision inside the same logical view**, rather than replacing the whole drawing.

## Floating-point regeneration noise

The clean revision pair also proves that geometrically unchanged curved entities can be regenerated with tiny coordinate differences (on the order of millionths of a drawing unit).

Therefore exact double equality / byte equality is invalid for revision matching.

BasiDraft matching uses configurable geometric tolerance. The current core matcher starts at `1e-4` drawing units and explicitly reports ambiguous candidates instead of guessing.

## View matching policy

The core `ViewMatcher` follows these rules:

1. anonymous block names do not participate in identity;
2. primitive direction for LINE entities does not participate in identity;
3. small coordinate regeneration noise is tolerated;
4. moving the whole view on the sheet can be ignored;
5. similarity is based on common geometry relative to total geometry;
6. added and removed primitive counts are reported as localized revision diagnostics;
7. if two candidate views are similarly plausible, the result is `ambiguous` rather than silently picking one.

## Hatching

BAZIS may export hatch appearance as many short LINE segments rather than native HATCH semantics.

Therefore DXF preserves appearance but does not guarantee editable hatch semantics. BasiDraft reconstructs its own hatch regions from cleaned presentation geometry when needed.

## Dirty projected geometry remains a problem

DXF solves the file-format problem, not the visibility / projection problem.

BAZIS can export visually simple views as large collections of fragmented, duplicated or overlapping primitives. Hatching may also appear as many LINE entities instead of native HATCH semantics.

Therefore BasiDraft keeps two representations:

- raw imported geometry, never silently destroyed;
- derived presentation / analysis geometry used for contours, dimensions and hatching.

Normalization is intentionally conservative:

- exact/reversed duplicate lines may be removed from analysis geometry;
- genuinely overlapping collinear coverage may be unioned;
- a simple shared endpoint is preserved because it can be a real furniture joint and semantic dimension anchor;
- micro-gap healing is opt-in and intended for contour / hatch reconstruction, not general semantic geometry;
- short geometry is not deleted merely because it is small, since real hardware contains small features.

## Real-file comparison versus LDW

Complex real LDW files disproved assumptions derived from minimal synthetic fixtures: provisional byte markers repeat many times in production files. The minimal LDW parser therefore remains useful for controlled research, not as the primary production geometry path.

This strengthens the architecture:

### Primary path

`BAZIS -> DXF -> QCAD native entities -> BasiDraft analysis -> BasiDraft project`

### Optional companion path

`BAZIS LDW -> metadata extractor -> merge only confidently decoded BAZIS-specific metadata`

### BasiDraft project owns

- logical views;
- raw source geometry snapshot;
- cleaned presentation geometry;
- scale / confirmed scale;
- semantic anchors;
- BasiDraft dimensions, text and leaders;
- revision fingerprints and geometry-similarity state;
- localized added/removed geometry diagnostics;
- ambiguity / review status.

## Current implementation target

Build the BAZIS DXF analysis layer on top of QCAD's existing importer:

1. discard / quarantine foreign annotations when present;
2. identify sheet-frame candidates;
3. collect ordinary graphic blocks and loose geometry;
4. create geometry snapshots independent of anonymous block names;
5. normalize duplicates and safe overlaps while preserving semantic joints;
6. cluster geometry into candidate logical views;
7. match those views to previous project versions using tolerant geometry similarity;
8. expose localized added / removed geometry;
9. feed automatic BasiDraft dimensions from cleaned or user-confirmed view geometry.
