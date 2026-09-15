## Proposal

> **Do not submit:** this retained local draft is a substantial duplicate of existing resolver/offline-drop proposals, especially [5615141371](https://github.com/Expensify/App/issues/98624#issuecomment-5615141371). See `ISSUE_RESEARCH.md` for the overlap evidence. It is kept only to describe the completed local patch accurately.

### What is the root cause of that problem?

Native receipt files are stored under the app container. After an iOS container move, a queued absolute receipt URI can still name the old container even though the receipt survives in the current `Receipts-Upload` folder. The attachment cache and offline `file` payload branch can consume that saved URI directly.

There is a second boundary issue: renderers and `fetch` use encoded `file://` URIs, while RNFS opens native filesystem paths. RNFS removes the scheme but does not decode percent escapes. Passing an encoded URI to `copyFile` therefore asks it to open a filename containing the encoded text instead of the real filename. A second decode would be equally wrong for a literal `%23` filename.

The cache can therefore copy from a missing old or encoded path, return a stale fallback, or try a remote HEAD/GET for a local file when re-caching without a MIME type. The offline `file` branch can read no file, omit the attachment, and send the rest of the request without recording why it was dropped. A valid saved URI must remain preferred because resolving it can change percent-encoded filename text.

### What changes do you think we should make in order to solve the problem?

- Select an exact native receipt path before copying or rebuilding a native attachment cache. Keep that path paired with a URI encoded once for reading/rendering. Check valid stored decoded/raw candidates before re-rooting both candidates through receipt storage. Leave a cache entry's `attachment.source` alone because it belongs under `Caches`, not receipt storage.
- At the RNFS copy boundary, convert exactly one generated encoded `file://` URI layer with `fileURIToPath(currentURI)`. This lets `percent%2523.jpg` select the on-disk `percent%23.jpg`; it does not decode it again to `percent#.jpg`.
- Treat supported local images as local during re-cache even when the call omits `mimeType`: derive the image MIME type from the URI with the repository helper and copy into the cache. Skip unsupported local files rather than sending `file://` through remote HEAD/GET validation. Preserve remote HEAD validation and download behavior.
- In the offline `file` branch, keep a readable saved source. If it is gone, re-root the receipt URI to the current storage folder before reading it. Pass a failure callback to `readFileAsync`; when it returns no file after recovery fails, keep the existing omission behavior and emit one `logReceiptDropped` event with the available trace ID, transaction ID, command, source, filename, and callback error.

This is intentionally limited to stale receipt-container paths, encoded filesystem boundaries, purged cache recovery, and silent offline attachment drops. It does not change image flicker behavior, upload ordering, request retries, cache-directory creation, cache checks, or Android's `file://` cache prefix.

### What alternative solutions did you explore? (Optional)

- Always use `ReceiptStorage.resolve`: rejected because a valid stored URI may have deliberate encoding that the resolver normalizes.
- Pass the encoded URI directly to RNFS: rejected because the installed RNFS wrapper does not decode percent escapes while opening a local file.
- Decode repeatedly: rejected because a literal `%23` on disk would incorrectly become `#`.
- Resolve a cached `attachment.source`: rejected because that file is in `Caches`, not the receipts folder.
- Treat `file://` like a remote URL on MIME-less re-cache: rejected because a mocked or platform-specific HEAD/GET response cannot prove the local source exists or that its bytes reached the cache.
- Throw or retry when the offline file cannot be read: rejected because the existing behavior intentionally sends the remaining request without the attachment.
- Include the flicker work: rejected because the September issue discussion separates it from these paths.
