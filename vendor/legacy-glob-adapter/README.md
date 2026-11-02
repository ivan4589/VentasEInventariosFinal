# Legacy glob entrypoints for ExcelJS

This first-party adapter replaces glob 7 for the audited ExcelJS consumers:
archiver-utils 2/3 (glob.sync) and rimraf 2 (glob callback, sync, hasMagic).
It delegates all pattern parsing and filesystem traversal to official glob
14.0.2; it does not contain the old glob or minimatch implementations.

It is intentionally not a general replacement for every historical glob API
(for example the old EventEmitter Glob constructor). Review consumers when
updating ExcelJS or adding a new dependency on glob 7.

The npm install-links setting packs the local package during npm ci. Docker
copies its source and the postinstall adaptation script before installing.
The version-checked, idempotent script redirects only the three audited glob
imports to this adapter; any unexpected dependency version or source fails
installation instead of silently accepting an untested API. Installs using
--ignore-scripts must run node scripts/patch-excel-glob.cjs before use.

Regression tests cover the legacy entrypoints and real XLSX and ZIP generation.
The production audit threshold is unchanged; no advisory is suppressed.
