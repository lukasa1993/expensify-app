# Issue research and overlap record

Reviewed the current issue discussion and contribution rules on 2026-09-15 before completing the local engineering work.

## Final local status

At the repository owner's direction, the implementation and local verification were completed after this overlap was documented. That technical completion does not change the duplicate conclusion below and is not a new proposal, approval, assignment, or payment claim. The final source selection keeps the exact native path paired with its once-encoded read URI; see `TEST_EVIDENCE.md` for the completed test and device record.

## Eligibility conclusion: SUBSTANTIAL DUPLICATE

This local patch is not eligible to be submitted as a new proposal. `CONTRIBUTING.md` requires every new proposal to be importantly, meaningfully, or considerably different from existing proposals. `HOW_TO_WORK_WITH_MELVINBOT.md` applies the same rule to Melvin issues: a contributor may submit only a meaningfully different approach.

### Direct overlap

| Local patch behavior | Existing proposal evidence |
| --- | --- |
| Treats an old iOS app-container path as stale and re-roots it with `ReceiptStorage.resolve` | [5615141371](https://github.com/Expensify/App/issues/98624#issuecomment-5615141371) identifies the same upgrade/container root cause and resolver. |
| Uses the selected URI for `cacheAttachment` copies, `getCachedAttachment` fallbacks, and cache rebuilds while leaving `attachment.source` under `Caches` alone | [5615141371](https://github.com/Expensify/App/issues/98624#issuecomment-5615141371) proposes those same cache changes, including leaving `localSource` untouched. |
| Prefers a readable stored offline `file.source`, then re-roots it; preserves ambiguous `%23`, `%2523`, spaces, and `#` filenames | [5615141371](https://github.com/Expensify/App/issues/98624#issuecomment-5615141371) proposes the same source-first/check-then-resolve approach specifically to avoid decoding the wrong legacy filename. |
| Reports a failed offline attachment read | [5414060689](https://github.com/Expensify/App/issues/98624#issuecomment-5414060689) identifies the same silent-drop root cause and proposes logging both the empty-file and `readFileAsync` callback exits. |

The local use of `logReceiptDropped` rather than that earlier proposal's suggested `logAttachmentDropped`, the exact encoder, and the RNFS copy-boundary correction are implementation details of the same correction. They do not create a materially different root cause, corrected behavior, or solution.

### Reviewer-decision check

- [5584733464](https://github.com/Expensify/App/issues/98624#issuecomment-5584733464) separates flicker from the two resolver/offline-drop problems; it does not select a resolver proposal.
- [5669148643](https://github.com/Expensify/App/issues/98624#issuecomment-5669148643) says the reviewer found potential source-side fixes and separately says the one proposal that looked good was the flicker proposal. It does not accept, hire, or assign a resolver/offline-drop proposal.
- The issue timeline records rejection of Melvin's original cleanup-race proposal, not a decision accepting this resolver approach.

There is no reviewer acceptance or hire for comment 5615141371 at review time. That absence does **not** establish eligibility: the proposal is still a substantial duplicate under the contribution rules. No payment, approval, assignment, or eligibility claim is made.

## Local technical scope

The implementation was completed and retained locally at the user's direction despite this documented overlap. It addresses old receipt-container paths, encoded local filenames at the RNFS copy boundary, purged attachment caches, and silent offline attachment drops. It does not address image flicker or upload ordering. No proposal was created from this implementation.

No issue comment, proposal, PR, push, contract application, or payment action was made.
