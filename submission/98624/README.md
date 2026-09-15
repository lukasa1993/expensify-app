# Issue 98624: current branch and evidence status

Updated 2026-09-15 at the repository owner's request. The correction is now integrated into the existing branches; no download or separate correction branch is required to obtain it.

## Current branches

- Repository: `lukasa1993/expensify-app`
- Code: `fix/98624-attachment-paths`, commit `56e106cff295f4d3a8fec3357dbb6ed2d894c8db`
- Code parent: `281f0e976905fd406b4bea653eff0db6621bef0e`
- Evidence: `review/98624-submission`, containing the identical corrected source/test tree plus these submission documents.
- Recorded original base: `e9e328bf3f6e72f59d5b32116ae4c8c4a69aacde`

The code branch was advanced without force. The evidence merge preserves both the earlier submission commit `20a2d7f5b9641c687d81478188e39886d9b7babd` and correction/evidence history through `d7b390db270496d45038a19f336bfe14d56023f3`. Existing auxiliary branches were left untouched.

## Which evidence applies

Read [CORRECTION_EVIDENCE.md](CORRECTION_EVIDENCE.md) for the exact-file-source correction and its isolated source-level results: 61 passed / 14 failed before, 75 passed / 0 failed after. These results do not constitute full repository Jest or native device verification.

[TEST_EVIDENCE.md](TEST_EVIDENCE.md), [BASE_COMMIT.md](BASE_COMMIT.md), [PROPOSAL.md](PROPOSAL.md), and [ISSUE_RESEARCH.md](ISSUE_RESEARCH.md) are retained snapshots from before the exact-file-source correction. Their earlier test counts, implementation descriptions, and statements that no commits or pushes occurred describe that earlier work only. They are not claims about the current branch or fresh verification of the correction. The new shared helper retains the successful native filesystem candidate and its paired encoded read URI; it supersedes the earlier boolean-only source selection and caller-side re-decoding described in the retained proposal.

No additional tests were run merely to integrate these branches. Earlier repository-wide test results must not be attributed to commit `56e106c`.

## Remaining limits

- Full repository tests, locked-toolchain checks, and native device migration validation for the corrected revision remain outstanding.
- The implementation commits are unsigned; integrating them does not change their signature status.
- Existing proposal-overlap disclosures remain. No maintainer acceptance, hiring, payment eligibility, or device-test success is claimed.
- Only the owner's fork branches were updated. No upstream PR, issue comment, upstream branch update, contract action, or payment action was performed.
