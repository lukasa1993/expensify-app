# #98624 exact-file-source correction

Recorded 2026-09-15. This is new source-level validation, not a restatement of the earlier repository-test results.

## Saved code

- Repository: `lukasa1993/expensify-app`
- Code branch: `fix/98624-exact-file-source`
- Code commit: `56e106cff295f4d3a8fec3357dbb6ed2d894c8db`
- Reviewed parent: `281f0e976905fd406b4bea653eff0db6621bef0e`
- Corrected tree: `d2f9f0867e740c4dd7c5c107396ac9ef3483c7da`
- This evidence is on a separate branch. Existing code/evidence branches were preserved. No upstream PR, upstream comment, contract or payment action was made.

## Implemented

A shared `getReadableAttachmentSource` returns the exact native path that passed stat and its consistently encoded fetch/render URI. It tries the stored decoded path, then the stored raw path; only after both fail does it re-root both native candidates through the existing receipt resolver. Bare native candidates are not decoded again. Copy and re-cache use the selected native path directly. Offline preparation uses its paired read URI. Valid cache hits do not inspect the original source first.

The remote caching/validation block and the unrelated receipt payload branch are byte-for-byte unchanged from the reviewed parent.

When both decoded and raw names exist, decoded-first precedence is retained. An ambiguous legacy string does not contain enough information to infer a different intended filename; the implementation does not claim otherwise.

## Observed verification

Identical 75-case isolated integration test body:

| Source snapshot | Passed | Failed | Total | Exit |
| --- | ---: | ---: | ---: | ---: |
| Reviewed pushed code before correction | 61 | 14 | 75 | 1 |
| Corrected code | 75 | 0 | 75 | 0 |

Commands, run from the accompanying `98624-correction` package:

```sh
node validation/run.cjs before
node validation/run.cjs after
```

Environment: Node `v22.16.0`, TypeScript `5.8.3`. No dependency versions were changed in the repository.

These tests transpile and execute the actual changed TypeScript modules. Filesystem operations create/stat/copy/read real temporary binary files. RNFS is represented by a thin native-boundary shim that strips `file://` without percent decoding. File fetch uses Node's URL parsing and real file bytes. Network, metadata services, platform constants and image-extension policy are controlled shims. Several unchanged FileUtils definitions are source excerpts, clearly identified in fixtures; they are not its complete repository module. These results are NOT full repository Jest or native device tests.

The 75 cases cover 60 combinations of copy/upload, current/moved/non-receipts location, and ten filename forms; six bare-path/original-precedence/ambiguity cases; and nine cache/error/remote/unchanged-behavior checks. Forms include ordinary names, raw/encoded spaces and hashes, encoded and legacy raw `%23`, lone percent signs, Unicode, and multiple literal escape sequences. Distinct-byte decoys detect zero or repeated decoding.

The 14 failing assertions before the correction were:

- Copy and upload of legacy raw `%23` in the unchanged container.
- Upload of a raw hash and a lone percent sign in the unchanged container.
- Copy and upload of legacy raw `%23` after a container move.
- Copy and upload of legacy raw `%23` outside receipt storage.
- Upload of a raw hash and a lone percent sign outside receipt storage.
- Copy and upload when a surviving original raw candidate must outrank a relocated decoy.
- Purged legacy-cache fallback/rebuild identity.
- Avoiding a source stat on a valid cache hit.

All 75 pass after correction. A failed assertion is not necessarily a separate production bug; the cache-hit assertion also pins the no-extra-source-I/O behavior.

## Source and delivery checks

The two reconstructed before-source files match their actual reviewed Git blobs:

| File | Reviewed Git blob |
| --- | --- |
| `src/libs/actions/Attachment/index.native.ts` | `77d623392c7f7d83c4584d12082258993e438120` |
| `src/libs/prepareRequestPayload/index.native.ts` | `692cb8faad3d27a23d9ef7033ee32299bf0f839d` |

Four complete dependency fixtures also match their pinned Git blob IDs: fileURIToPath, checkFileExists, durableFolder, and native ReceiptStorage. The FileUtils fixture is explicitly an excerpt.

Corrected files:

| File | Git blob |
| --- | --- |
| `src/libs/actions/Attachment/index.native.ts` | `e6ed4a34495e8017b6b6faa1ea8e9c4d80cc8195` |
| `src/libs/prepareRequestPayload/index.native.ts` | `5cd39074cf72858af3943131e70736ebc6937e8e` |
| `src/libs/getReadableAttachmentSource.ts` | `5d1522bb5f6f08e6ffe42d39a78fee348eddc152` |
| `tests/unit/libs/getReadableAttachmentSourceTest.ts` | `e8e31455555333374f7cb3a3bf822eb0dc94908b` |

Remote production blobs were read back and matched the local tested blobs. TypeScript transpilation reported zero syntax diagnostics for all four changed/added files. The incremental patch passed `git apply --check`, actual application plus byte comparison, and `git apply --reverse --check` against the byte-verified reviewed changed-file snapshot. That snapshot is not a complete repository checkout.

The new repository Jest file adds 38 parameterized selector checks. It was syntax-checked, NOT run with the repository's Jest installation here. The existing native test suite was not removed or weakened.

## Complete evidence hashes

The accompanying correction package contains full stdout, per-case results, source snapshots, the runner and an incremental patch. The hashes below are complete SHA-256 values:

```text
020807b1bc6d91197f4214474fa475f52cd72a1ef0c86c07ffaa942d7f9bec5e  logs/before.txt
a16d0046253319217e120f2113aed97a60a352c8d99de38a3c7e9fa30b962c1c  logs/after.txt
4ca9f2898442136f974ea97e56e8147e91aa01be018c8b13d3f624e5030831b1  logs/before.json
9d97ffc2f900a328e8069f8392d6e9cb6d2e123bf51322361d2e9d692f50074b  logs/after.json
67de8372e280390e14afd4fd660da59b9ddcf2469709aa1504e5e95992a3bab5  98624-exact-file-source.patch
55e0999f10b2865fdb2502715d559d480d48c33f2ed3d252b5abb7cba7d45bb1  validation/run.cjs
```

## Not claimed

- Full project Jest, locked-toolchain typecheck, ESLint, Oxfmt and spelling: NOT RUN in this workspace. There is no complete dependency checkout, and direct Git cloning failed DNS resolution. The isolated harness does not substitute for those checks.
- Actual iOS/Android installation, upgrade/container migration and rendering: NOT RUN.
- Current-upstream rebase compatibility: NOT REVALIDATED in this pass.
- GitHub reports the API-created correction commit and its existing parent as unsigned. Signed submission history remains unresolved; no access to the user's private signing key was requested or assumed.
- Maintainer approval, hiring and bounty eligibility remain unresolved. Technical completion does not create approval.

The earlier evidence branch remains historical. Its repository-test counts and no-publication statements must not be misrepresented as new results from this correction pass.
