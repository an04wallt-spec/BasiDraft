# BasiDraft

BasiDraft is a personal Windows 2D drafting application based directly on the open-source QCAD Community Edition codebase.

## Base

- Upstream: `qcad/qcad`
- Target baseline: QCAD Community Edition 3.33.1
- Platform: Windows x64
- Purpose: a simplified, Russian-first drafting environment with strong automation for generating and dimensioning production drawings.

## Development rule

We modify the original QCAD codebase directly. We do not build a separate CAD engine "inspired by" QCAD.

## Planned first stage

1. Import the official QCAD Community Edition source tree.
2. Confirm a clean Windows x64 build.
3. Keep and verify the Russian locale.
4. Establish BasiDraft branding without removing required upstream license notices.
5. Reduce the interface to the tools needed for the target workflow.
6. Add project-specific automation incrementally on top of the working CAD base.

## License

QCAD Community Edition source is distributed under GPLv3 with its published exceptions and third-party licenses. BasiDraft will retain the upstream license files and notices.
