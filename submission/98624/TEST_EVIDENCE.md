# Test evidence

## Regression proof

The regression suite exercises the actual native attachment, payload, receipt-storage, file-existence, and `readFileAsync` implementations via `jest.requireActual`. It replaces only native filesystem, blob, and fetch I/O.

Its RNFS mock mirrors the installed dependency boundary: it strips `file://` but never decodes percent escapes. It has an exact native-path-to-bytes map. A copy fails when that exact source is absent, copies actual source bytes to the destination, and makes the destination visible to later `exists` and `stat` calls.

### Red: unfinished implementation

Before the copy-boundary and local re-cache correction, the completed regression suite was run in the active checkout:

```sh
npm test -- tests/unit/libs/prepareRequestPayloadNativeTest.ts --runInBand
```

Result: **11 failed, 14 passed, 25 total**. The failures were behavioral, not test setup failures:

- Encoded space, `#`, and literal `%23` filenames could not be copied from their exact on-disk paths for unchanged or moved containers.
- A `percent%2523.jpg` URI did not produce a cache file from on-disk `percent%23.jpg` bytes.
- Purged local-image re-cache reached the remote HEAD path instead of rebuilding from the local source.
- An unsupported local file reached the remote HEAD path.

That exact-path regression body passed after the correction. The final suite then strengthened its `%23` case with different-byte zero- and double-decoding decoys; it also passes. The red run deliberately used the same exact-path filesystem model, so a prefix-only source match or a mock-added decode cannot produce a false green result.

### Green: clean locked-dependency worktrees

Both isolated worktrees described in `BASE_COMMIT.md` used fresh `npm ci` installs with Node `v26.5.0`, npm `11.17.0`, and Bun `1.3.14`.

Base command:

```sh
cd /tmp/expensify-98624-base
TASK_NODE_BIN=/home/l/.nvm/versions/node/v26.5.0/bin \
PATH="$TASK_NODE_BIN:$PATH" \
npm test -- tests/unit/libs/prepareRequestPayloadNativeTest.ts tests/unit/fileURIToPathTest.ts tests/unit/prepareRequestPayloadTest.ts --runInBand
```

Result: **3 suites passed, 21 tests passed**.

Final-patch command:

```sh
cd /tmp/expensify-98624-final
TASK_NODE_BIN=/home/l/.nvm/versions/node/v26.5.0/bin \
PATH="$TASK_NODE_BIN:$PATH" \
npm test -- tests/unit/libs/prepareRequestPayloadNativeTest.ts tests/unit/fileURIToPathTest.ts tests/unit/prepareRequestPayloadTest.ts --runInBand
```

Result: **3 suites passed, 39 tests passed**. The same command was rerun after refreshing the isolated final worktree with the complete current patch, with the same result. The additional 18 tests are the new native attachment/payload regression cases; the base suite does not contain them.

The final native suite specifically proves all of the following:

- Normal names, spaces, `#`, literal `%23`, and their encoded URI forms copy the expected bytes under unchanged and moved containers.
- `percent%2523.jpg` copies on-disk `percent%23.jpg`, not `percent%2523.jpg` or `percent#.jpg`; the latter two are seeded as different-byte decoys so an accidental zero or second decode cannot appear green.
- Onyx metadata is written only after the copied cache file exists and has the source bytes.
- A valid cache hit remains a cache hit.
- A purged local-image cache rebuild writes the source bytes and metadata; a subsequent lookup returns the rebuilt `file://` cache source.
- MIME-less re-cache infers a supported local image type; unsupported local files do not issue HEAD or GET; validated remote caching and unsupported remote validation remain covered.
- The real `readFileAsync` path reads the mocked I/O bytes and passes recovered bytes, filename, MIME type, `source`, and `uri` into FormData. The test does not return a pre-created `File` based on an expected input string.
- Missing and unreadable offline sources omit the attachment while retaining other fields and emit exactly one `logReceiptDropped` event.

## Static and broader checks

| Check | Command/result |
| --- | --- |
| Formatting | `./node_modules/.bin/oxfmt --check src/libs/actions/Attachment/index.native.ts src/libs/prepareRequestPayload/index.native.ts tests/unit/libs/prepareRequestPayloadNativeTest.ts submission/98624/*.md` — **PASS**. Oxfmt matched and checked the three supported TypeScript files. |
| Spelling | `npm run spell-changed` — **PASS**, 7 files checked and 0 issues. The wrapper fetched `origin/main`; the direct cspell invocation over the same 7 files also passed. |
| Typecheck | Full `npm run typecheck` was run in both clean worktrees with Node 26. Both exited 1 with **218 TypeScript errors** and byte-identical complete logs (SHA-256 `f9d4bd81…e6ddf5c4b`) at `/tmp/expensify-98624-base-typecheck.log` and `/tmp/expensify-98624-final-latest-typecheck.log`. This establishes no typecheck delta from the complete final patch; it does not characterize individual baseline errors as unrelated merely by path. |
| Lint | `npm run lint-changed` fetched `origin/main` then failed before lint results with `TypeError: Cannot read properties of undefined (reading 'Cjs')` in `@typescript-eslint/typescript-estree`. Direct changed-file lint in both clean worktrees fails at the same point: ESLint 9.36 / `@typescript-eslint/typescript-estree` accesses `ts.Extension.Cjs`, which is absent in locked TypeScript 7.0.2. After normalizing the worktree path, the complete logs are identical (SHA-256 `61a84d17…eb2afa016`) at `/tmp/expensify-98624-base-eslint.log` and `/tmp/expensify-98624-final-latest-eslint.log`. No manifest, lockfile, or toolchain workaround was changed. |
| Native attachment action suite | `tests/actions/AttachmentTest.ts --runInBand --no-cache` was attempted in both clean worktrees under Node 26. Neither test run started: Jest failed while the existing `__mocks__/@react-navigation/native/index.ts` re-export loaded `@react-navigation/core/lib/module/index.js`, whose package declares ESM. The same `Must use import to load ES Module` failure occurs in base and final. Repository transform configuration includes React Navigation, but Jest 29 still requires the transformed module as CommonJS. No test configuration was changed. |

## Device verification

**NOT RUN.** `adb` is installed, but an escalated `adb devices -l` check returned no attached devices. No Android emulator executable, Android SDK environment, `xcrun`, or `xcodebuild` is available. Therefore no Android or iOS container-migration test can run in this workspace. No application restart is offered as evidence of container migration.

When an authorized device environment is available, the required procedure is:

1. Use an existing controlled test account and queue a native chat attachment while offline on a build that stores an absolute `Receipts-Upload` URI.
2. Perform an in-place app upgrade with the same bundle identifier and preserved app data; do not uninstall or merely restart.
3. Confirm the queued record retains the old-container URI while the receipt exists only under the current container's `Receipts-Upload` folder.
4. Reconnect, send the queued request, and verify the attachment uploads, the cache rebuild uses the current path, and a deliberately unreadable or missing file produces exactly one dropped event.

## Patch application and publication status

The complete seven-file delivery patch at `/home/l/bugs/fix-98624-attachment-paths.patch` was generated from the final diff. In a fresh detached worktree at the recorded base, `git apply --check` passed, `git apply` succeeded, `git diff --check` passed, all four submission records appeared, and `git apply --reverse --check` passed. The patch is regenerated once more after recording this result, then the same clean-application check is repeated.

The overlap remains **SUBSTANTIAL DUPLICATE**. No proposal, PR, issue comment, push, assignment, acceptance, contract application, or payment action was published or claimed.
