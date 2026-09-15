# Final test evidence

## Exact filesystem regression proof

`tests/unit/libs/prepareRequestPayloadNativeTest.ts` uses an exact native-path-to-byte map. Its RNFS boundary strips `file://` but does not percent-decode, matching RNFS behavior. A copy fails for an absent exact source, copies actual source bytes, and makes the destination observable through later `exists` and `stat` calls.

The test covers ordinary names, spaces, `#`, literal `%23`, encoded forms, unchanged containers, and moved containers. It asserts copied bytes and Onyx cache metadata, not only mock arguments. Distinct-byte `%23` decoys detect both zero and repeated decoding.

| Check | Result |
| --- | --- |
| Deliberate unfinished copy boundary: `RNFS.copyFile(currentURI, destPath)` | Expected RED: 10 failed, 15 passed, 25 total. Space/hash copies were absent and `percent%2523.jpg` copied deliberately seeded wrong zero-decode bytes. |
| Restored final boundary: `RNFS.copyFile(fileURIToPath(currentURI), destPath)` | PASS: 25/25. |
| Final focused native, selector, web payload, and attachment suites | PASS: 4 suites, 76 tests. |

The purged-cache test proves source bytes reach cache storage, Onyx metadata is written, and the next lookup returns the rebuilt cache. It also proves local `file://` sources do not obtain false success from remote HEAD/GET mocks. Supported local images rebuild when MIME type is omitted; unsupported local files remain uncached. Valid remote validation/download behavior and cache hits remain covered.

Offline payload coverage invokes the real `readFileAsync` implementation while mocking only its I/O boundary. It proves recovered bytes, filename, MIME type, `source`, and `uri` reach FormData. Missing and unreadable files retain omission behavior and each produce exactly one `logReceiptDropped` event.

## Isolated comparison and static checks

| Check | Base | Final |
| --- | --- | --- |
| `NODE_OPTIONS=--max_old_space_size=16384 npm run typecheck` | PASS | PASS |
| `npm test -- --runInBand tests/unit/prepareRequestPayloadTest.ts tests/actions/AttachmentTest.ts` | PASS: 2 suites, 13 tests | PASS: 2 suites, 13 tests |

Final-only checks:

- Focused test command: `npm test -- --runInBand tests/unit/libs/getReadableAttachmentSourceTest.ts tests/unit/libs/prepareRequestPayloadNativeTest.ts tests/unit/prepareRequestPayloadTest.ts tests/actions/AttachmentTest.ts` — PASS, 4 suites / 76 tests.
- `node_modules/.bin/oxfmt --check` on all five changed source/test files — PASS.
- Direct `npx eslint --format stylish --no-warn-ignored --concurrency=1` on all five changed source/test files — PASS.
- `npm run spell-changed -- <changed source/test files>` — PASS, zero issues.
- React Navigation ESM probe: `npm test -- --runInBand tests/unit/Navigation/guards/handleNavigationGuardRedirect.test.ts` — PASS, 5/5. The existing React Navigation package patch resolves Jest's VM-module/CommonJS manifest conflict.
- `git diff --check`, `git apply --check`, actual `git apply`, and `git apply --reverse --check` from the recorded base — PASS.

Full-repository lint was not represented as green. Base/final full attempts were bounded by VM memory pressure; a one-worker run exhausted the Node heap, and a higher-memory run did not complete. The repository lint wrapper also reproducibly exits 2 with `Failed to parse ESLint JSON output` even for these five files while direct ESLint passes. No test, assertion, manifest, or linter configuration was weakened to obtain a pass.

The no-argument spelling wrapper's branch-discovery fetch could not resolve its host in the VM. The explicit changed-file spelling check above completed successfully.

## Android / ARM64 verification

- Device: Samsung `SM-A225F`; reported ABIs `arm64-v8a,armeabi-v7a,armeabi`; installed app primary ABI `arm64-v8a`.
- Final build: `./gradlew app:assembleDevelopmentDebug -x lint -PreactNativeArchitectures=arm64-v8a` with the existing Android SDK, Node, Bun, and host-tool environment. PASS: `BUILD SUCCESSFUL`; 1512 tasks; CMake arm64 targets configured and built.
- APK: `/home/l/bugs/App/android/app/build/outputs/apk/development/debug/app-development-debug.apk`; confirmed to contain `arm64-v8a` native libraries.
- Installation: `adb install -r -d <APK>` — PASS. The package reports version `9.4.78-0` and primary ABI `arm64-v8a`.
- Launch smoke: `com.expensify.chat.dev/com.expensify.chat.MainActivity` was resumed/focused and its ARM64 process remained alive through a 15-second check. The sampled process log had no fatal exception or script-load failure.

NOT RUN: a real persisted-container migration containing a queued attachment. The supplied device did not have a controlled signed-in, pre-upgrade queued-attachment state. No restart was used as a substitute.

An optional Metro DevTools launch was blocked by the VM's missing Linux ATK shared library. That host-only limitation prevents a current live-bundle smoke, not the completed unit, type, Gradle, installation, or native process checks.

## Publication status

The overlap remains documented as **SUBSTANTIAL DUPLICATE** in `ISSUE_RESEARCH.md`. No proposal, PR, issue comment, push, approval, contract application, or payment action was made or claimed.
