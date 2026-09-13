# LDW reverse-engineering notes

These notes describe only facts verified against the current BAZIS test corpus. They are intentionally conservative: unknown fields are not guessed.

## Test corpus

The original controlled corpus is `Чертеж1.ldw` through `Чертеж9.ldw`. Representative real fixtures are committed under `tests/fixtures/ldw/` so regressions are reproducible in CI.

Verified results from the first reader implementation:

| File | Parsed objects |
| --- | --- |
| Чертеж1.ldw | no drawing entities |
| Чертеж2.ldw | line `(0, 0) -> (100, 0)` |
| Чертеж3.ldw | two line records |
| Чертеж4.ldw | three line records |
| Чертеж5.ldw | line `(20, 30) -> (120, 30)` |
| Чертеж6.ldw | line `(20, 30) -> (120, 80)` |
| Чертеж7.ldw | line `(0, 0) -> (100, 0)` with a non-geometric field changed versus Чертеж2 |
| Чертеж8.ldw | type-2 entity decoded as circle: center `(0, 0)`, radius `25` |
| Чертеж9.ldw | type-25 text: `ТЕСТ123.`; font: `Bahnschrift` |

## File signature

The tested files begin with byte `0x0B` followed by ASCII `*BAZIS*LDW*`.

## Current entity-stream boundary

All nine test files contain the byte sequence `D3 D4 CE 00` immediately before the drawing entity stream. The current reader uses the last occurrence of this marker as a provisional boundary. This rule is verified only for the current corpus and must be replaced if broader fixtures disprove it.

## Type 1: line

Current physical record size in the test corpus: 57 bytes.

The record starts with:
- `uint16 LE`: type = `1`
- `uint32 LE`: declared size = `56`

Verified little-endian `double` coordinates relative to the record start:
- `+25`: start X
- `+33`: start Y
- `+41`: end X
- `+49`: end Y

## Type 2: circle

Current physical record size in the test corpus: 45 bytes.

The record starts with:
- `uint16 LE`: type = `2`
- `uint32 LE`: declared size = `48`

Verified little-endian `double` values relative to the record start:
- `+21`: center X
- `+29`: center Y
- `+37`: radius

`Чертеж8.ldw` decodes to center `(0, 0)`, radius `25`.

## Type 25: text

`Чертеж9.ldw` starts with type `25`, declared size `96`.

Verified variable strings:
- `+80`: `uint32 LE` UTF-8 text byte length
- `+84`: UTF-8 text bytes
- one zero terminator byte
- next `uint32 LE`: font-name byte length
- font-name bytes

For the current fixture the values are:
- text: `ТЕСТ123.`
- font: `Bahnschrift`

The preceding 80-byte fixed payload is preserved raw until its remaining fields are identified with controlled tests.

## Safety rule

The parser stops at an unsupported entity type rather than guessing a record length and losing stream synchronization. Unknown semantics must be established through controlled LDW fixtures before production import relies on them.
