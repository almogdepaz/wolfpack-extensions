# Release checklist

- [ ] Confirm the exact target package/version is unpublished before attempting a new release. Changes `0.1.0` and `0.1.1` are already published; Agent Context and Notes `0.1.0` remain unpublished. This repository has no publish workflow or credentials.
- [ ] Run root typecheck/build/test/package/negative/pack gates from this repository, then inspect each actual archive and SHA-512 receipt.
- [ ] Confirm package allowlists: Changes/Notes ship only package metadata, README, LICENSE and `dist/ui.js`; Agent Context additionally ships its schema and skill/reference files.
- [ ] Verify the selected host explicitly implements Extensions APIv1. `wolfpack-bridge@1.6.24` is not compatible.
- [ ] Use exact `npm:package@version` commands for published versions, or an absolute unpacked package directory; do not represent archives or URLs as direct install sources.
- [ ] Before publishing Agent Context, independently verify its schema/skill and scoped revision/CAS behavior against the approved APIv1 host.

## Published Changes 0.1.1

Published to the public npm registry as `latest` on 2026-10-26. Only Changes was published; no live extension installation was performed.

- Package: `wolfpack-extension-changes@0.1.1`
- Source: `31e6d3d05e73cc3dca86f7efbd624fb769956a14` (diff line numbers no longer stick outside the scrolling file list; untracked files and summarized untracked directories are diffed as new files).
- Archive SHA256: `85f86754f84bc967c5b1728afcf693fba9c7677a4da1f93a07a3adcad6b1751b`
- npm integrity: `sha512-4zU0GivLH1IeHRTF2rvEDaha/3QnDFsscQxN+/xaCN1cLPz1o++8RHPHO3cATtoFNrKng5Ou/hsJo1W6W2eUbg==` (shasum `33a074cbebe6e1e6b06961cab88873321e0901bc`)
- Changes checks at the source commit: 13 passing Playwright UI tests, typecheck, build, package, negative, pack and offline portability gates. Root build/package/pack gates passed; root typecheck/test and the Notes negative fixture failed only for pre-existing reasons in untouched packages (stage/sketch tests, missing TypeScript in the Notes fixture), identical on the 0.1.0-era baseline.
- Strict APIv1 host-types, host-compat and isolated exact-archive install proof used Wolfpack branch `feat/extension-untracked-diff` at `d5a51a939405cf01df50f2b5cba2fdb1af963661` (adds the optional `untracked` diff section; `0b20277171210cfcd6b44f968c49c037dc864680` on top changes a comment only). Host-compat also passed against `c0854195da6ca4788d532bbe77ea0600b3cf8a86`, which lacks `untracked`; untracked rows show the older-host note there.
- Public registry metadata, `latest`, integrity and downloaded archive bytes were independently verified against the exact tested artifact.

## Published Changes 0.1.0

Published to the public npm registry as `latest` on 2026-10-04. Only Changes was published; no live extension installation was performed.

- Package: `wolfpack-extension-changes@0.1.0`
- Source: `2dd36f9d44475344a3fc609397172c00b1b41e18`, with only the obsolete Changes README publication banner removed.
- Archive SHA256: `c351f840d5ff01e838d872af056a0732c39d16d8b92a6db633166e0839f45e1c`
- npm integrity: `sha512-v/9aab3TTr7jB0Tm2NLgoPxNmTxJ9kuBNBlFQYwRBQPEO+1QLUm58tizZJ5RPZl42bFwND5WiTp/Cvxa6ugzpA==`
- Fresh root checks: 19 passing tests, offline portability, build/types/package/negative/pack gates. The Notes negative fixture required an owned package-local link to the hoisted pinned tools; its initial missing-TypeScript failure was retained, not treated as a pass.
- Independent Changes checks on the publishing host: 4 passing tests plus package and negative controls.
- Strict APIv1 host-types and isolated exact-archive install proof used Wolfpack `06d4251d2dd3b2702fce3f9e1bd9b97229133871`.
- Public registry metadata, `latest`, integrity and downloaded archive bytes were independently verified against the exact tested artifact.
