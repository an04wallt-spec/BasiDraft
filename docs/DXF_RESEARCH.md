# BAZIS DXF research notes

This document records facts verified against real BAZIS drawings exported as DXF, with paired LDW files retained privately for comparison. Production drawings are not committed to the public repository.

## Architectural conclusion

DXF is the preferred primary geometry transport from BAZIS into BasiDraft.

QCAD already imports DXF natively, so BasiDraft can focus on the valuable work:

`DXF raw geometry -> normalization -> logical views -> semantic features -> BasiDraft annotations`

LDW remains an optional metadata / fallback research path where BAZIS-specific hierarchy proves useful.

The import contract is authoritative: dimensions, text, leaders and other BAZIS annotations are not required production input. BAZIS provides geometry; BasiDraft creates the drawing annotation layer.

## Controlled real-file corpus

A second controlled corpus was provided as four DXF/LDW pairs from the same furniture project:

- fully annotated / information-rich sheet;
- simple geometry sheet;
- clean geometry sheet;
- the same clean geometry after moving one shelf.

All four current DXF files are AC1015 (AutoCAD 2000). This shows that BAZIS DXF version must not be hard-coded from the first sample alone.

### Top-level model-space entities

| Fixture | LINE | INSERT | DIMENSION | TEXT | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| information-rich | 15 | 48 | 59 | 12 | 134 |
| simple | 2 | 22 | 0 | 0 | 24 |
| clean | 548 | 22 | 0 | 0 | 570 |
| clean, shelf moved | 548 | 22 | 0 | 0 | 570 |

In all four files the top-level content is effectively flattened to one BAZIS content layer (`Слой1`). Standard DXF layer structure therefore cannot be treated as the logical BAZIS view hierarchy.

## Critical revision-tracking discovery: anonymous block names are unstable

The pair `clean` / `clean, shelf moved` proves that anonymous block names such as `*B12`, `*B21`, etc. are not stable identifiers across exports.

The two DXFs have the same number of ordinary INSERTs, but BAZIS renumbered anonymous block definitions after regeneration. Twenty of the twenty-two logical graphic block contents were still geometrically identical, but many of them appeared under different `*Bxx` names.

**Consequence:** BasiDraft must never use anonymous DXF block names as persistent view identity.

View identity must be based on geometry, placement context and BasiDraft's own project identifiers.

## Verified shelf-change pair

After matching block contents by geometry instead of name, only two logical graphic blocks actually changed.

### Large view block

Clean export:

- 850 primitives total;
- 842 LINE;
- 8 ARC.

Changed export:

- 850 primitives total;
- 842 LINE;
- 8 ARC.

With coordinates quantized to `1e-4` drawing units:

- 847 / 850 primitives match;
- similarity = `0.99647`;
- exactly three shelf-related line primitives moved;
- shelf displacement in the DXF is `+2.772` drawing units in Y.

Five arc coordinates also changed by roughly `1e-6` drawing units even though their geometry is visually unchanged. This is regeneration noise, not a meaningful revision.

### Companion block

- 18 LINE primitives total;
- 14 remain unchanged;
- 4 shelf rectangle lines move by the same `+2.772` drawing units;
- similarity = `14 / 18 = 0.77777...`.

This pair is the first real evidence that a geometry-similarity matcher can recognize a changed BAZIS view without relying on block names.

## Matching rules derived from the real revision pair

Revision matching must:

- ignore anonymous DXF block names;
- canonicalize line direction;
- compare primitive multisets rather than entity order;
- use a configurable coordinate tolerance;
- survive tiny regeneration noise;
- optionally normalize translation so moving a complete view on the sheet does not break identity;
- return a similarity score rather than a boolean only;
- explicitly mark ambiguous matches instead of silently choosing the closest candidate.

A first reusable `ViewMatcher` implementation and regression tests now live in `src/basidraft/geometry/`.

## Useful structure in the simple fixture

The simple DXF is valuable because it contains no DIMENSION or TEXT entities and therefore closely represents the intended production input contract.

It contains:

- 22 ordinary INSERTs;
- only 2 top-level LINEs;
- 22 anonymous graphic blocks plus model/paper-space blocks.

One block has extents exactly `420 x 297` drawing units, matching an A3 sheet. This is a strong hint for frame/title-block detection, but paper-size recognition must remain heuristic / validated rather than tied to a specific anonymous block name.

## Dimensions and text in annotated fixtures

Annotated DXF samples can still be useful for reverse-engineering and validation, but they are diagnostic material only.

Earlier testing showed that BAZIS can export native DIMENSION and TEXT objects and that dimension values can reveal paper scale statistically. However production BasiDraft logic must not require those annotations because the intended workflow imports geometry without them.

## Hatching and projected geometry

DXF solves the file-format problem, not the visibility / projection problem.

BAZIS can export visually simple views as large collections of fragmented, duplicated or overlapping primitives. Hatching may also appear as many LINE entities instead of native HATCH semantics.

Therefore BasiDraft still needs a geometry-analysis layer that preserves raw input while deriving a cleaned presentation representation.

Normalization must handle at least:

- exact duplicates;
- collinear overlaps;
- fragmented collinear segments;
- micro-gaps;
- tiny artifact segments;
- internal geometry that must not define an outer contour;
- ambiguous regions where user confirmation is safer than guessing.

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
- ambiguity / review status.

## Next implementation target

Build the BAZIS DXF analysis layer on top of QCAD's existing importer:

1. discard / quarantine foreign annotations when present;
2. identify sheet-frame candidates;
3. collect ordinary graphic blocks and loose geometry;
4. create geometry snapshots independent of anonymous block names;
5. normalize duplicates / overlaps / micro-segments;
6. cluster geometry into candidate logical views;
7. match those views to previous project versions using tolerant geometry similarity;
8. feed automatic BasiDraft dimensions from cleaned or user-confirmed view geometry.
