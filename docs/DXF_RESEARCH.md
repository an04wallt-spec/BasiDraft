# BAZIS DXF research notes

This document records facts verified against a real BAZIS drawing exported as both LDW and DXF. The production drawing itself is not committed to the public repository.

## Architectural conclusion

DXF is the preferred primary geometry transport from BAZIS into BasiDraft.

Reasons:

- QCAD already has a mature native DXF data model and importer;
- the tested BAZIS DXF reproduces the visible sheet very closely;
- dimensions, text and graphic groups arrive as typed CAD objects instead of opaque binary records;
- ordinary graphic blocks and dimension graphic blocks are structurally separated;
- this lets BasiDraft spend engineering effort on geometry interpretation, automatic dimensions and revision tracking instead of reverse-engineering every LDW record.

LDW research remains useful as an optional metadata / fallback path because LDW retains BAZIS-specific structure that is not necessarily exposed as ordinary DXF layers.

## Verified DXF characteristics

Tested DXF version: AC1027 (AutoCAD 2013).

Model space contained 688 top-level entities:

- 549 LINE
- 77 DIMENSION
- 54 INSERT
- 8 TEXT

The file contained 131 anonymous blocks. Their use was cleanly separated:

- 77 blocks were referenced only by DIMENSION entities;
- 54 blocks were referenced only by ordinary INSERT entities;
- no anonymous block was shared between those two groups.

This is valuable because dimension graphics can be distinguished from drawing-view geometry without geometric guessing.

## Layer loss / flattening

The tested DXF exposed only three standard layers:

- `0`
- one BAZIS content layer
- `Defpoints`

All 688 model-space entities were placed on the same BAZIS content layer.

The paired LDW contains view / layer-related strings that are not reproduced as equivalent standard DXF layer structure. Therefore DXF must not be assumed to preserve the complete BAZIS hierarchy.

Possible future strategy:

- DXF = primary geometry and visible document transport;
- LDW = optional companion source for BAZIS-specific view/layer metadata where useful;
- BasiDraft project = authoritative internal structure after import.

## View / block structure

The tested drawing contains useful grouping through INSERT blocks.

One large block corresponds visually to the main cabinet elevation. Other blocks correspond to graphic groups, detail geometry and hatch-like content. However, one INSERT is not guaranteed to equal one logical BasiDraft view; some logical views are composed from several blocks.

Therefore view recognition should use block structure as a strong hint, combined with spatial grouping, connectivity, annotation proximity and scale inference.

## Dimensions

The tested file contains 77 native DXF DIMENSION entities.

They are useful, but they are not SolidWorks-style associative dimensions tied to source model entities. No usable DIMASSOC structure was found in the tested export.

The displayed dimension text is frequently an explicit value while the DXF geometry is drawn at paper scale. Comparing displayed values with measured DXF distances revealed stable scale groups:

- 17 dimensions correspond to approximately 1:2 detail geometry;
- 59 dimensions correspond to approximately 1:13 main-view geometry;
- one special overridden value was excluded from scale inference.

This is very useful: BasiDraft can infer a view scale statistically from nearby imported dimensions even when the scale is not represented as an associative model relationship.

Imported BAZIS dimensions should therefore be treated as:

1. visual/reference annotations;
2. evidence for recovering view scale;
3. possible evidence for semantic feature matching;
4. not trusted as BasiDraft's long-term associative bindings.

BasiDraft should create and maintain its own semantic dimension bindings after import.

## Hatching

No native HATCH entities were found in the tested DXF. Hatch appearance is exported as groups / blocks containing many short LINE segments.

Therefore DXF preserves hatch appearance but does not necessarily preserve editable hatch semantics.

If BasiDraft needs editable / regenerable hatching, hatch regions must be reconstructed from cleaned presentation geometry rather than relying on the exported hatch lines.

## Dirty projected geometry remains a problem

DXF solves the file-format problem, not the visibility / projection problem.

After expanding ordinary INSERT geometry, the tested drawing contained 4,479 line segments, with 4,439 unique exact segments. There were 40 exact duplicate extras across 35 duplicate groups.

A visually simple main cabinet view alone contained roughly:

- 842 LINE entities;
- 820 unique exact line segments;
- 22 exact duplicate extras;
- hundreds of very short segments.

This confirms the practical observation from BAZIS: model-derived views can contain fragmented, overlapping and otherwise unnecessary projected geometry even though the sheet looks visually correct.

Therefore the BasiDraft geometry pipeline remains:

`DXF raw geometry -> normalization -> visible/presentation geometry -> semantic features -> dimensions / hatch / revision bindings`

Normalization must handle at least:

- exact duplicates;
- collinear overlaps;
- fragmented collinear segments;
- micro-gaps;
- tiny artifact segments;
- internal geometry that must not define an outer contour;
- ambiguous regions where user confirmation is safer than guessing.

## Real-file comparison versus LDW

The complex real LDW disproved an assumption derived from the minimal LDW fixtures: the byte marker previously used as a provisional entity-stream boundary occurs many times in a real production file. Therefore the current minimal LDW parser is valid only for controlled fixtures and must not be treated as a complete production LDW reader.

This strengthens the decision to use DXF as the primary geometry path while keeping LDW work focused on metadata / fallback research.

## Current recommended import architecture

### Primary path

`BAZIS -> DXF -> QCAD native entities -> BasiDraft import analysis -> BasiDraft project`

### Optional companion path

`BAZIS LDW -> metadata extractor -> merge BAZIS-specific hierarchy / identifiers when confidently decoded`

### BasiDraft project owns

- logical views;
- source geometry snapshot;
- cleaned presentation geometry;
- inferred / confirmed scale;
- semantic anchors;
- BasiDraft dimensions and leaders;
- revision fingerprints;
- ambiguity / review status.

## Next implementation target

Build a BAZIS DXF analysis layer on top of QCAD's existing DXF importer. It should:

1. distinguish dimension-owned blocks from normal graphic blocks;
2. identify sheet frame / title-block geometry;
3. cluster ordinary geometry into candidate logical views;
4. infer scale from nearby imported dimensions;
5. retain raw geometry unchanged;
6. derive normalized presentation geometry;
7. expose duplicate / overlap / micro-segment diagnostics;
8. feed the first automatic overall-dimension workflow from cleaned or user-confirmed view geometry.
