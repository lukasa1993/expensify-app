# Base and dependency record

- Repository: `Expensify/App`
- Local branch: `fix/98624-attachment-paths`
- Recorded base: `e9e328bf3f6e72f59d5b32116ae4c8c4a69aacde`
- Base subject: `Merge pull request #100498 from Expensify/claude-docsMovedExpenseSystemMessageDestination`
- Base commit date: `2026-09-15T12:21:51+10:00`

## Isolated checkout record

Two detached worktrees were created from the recorded base:

| Checkout | Revision | Contents |
| --- | --- | --- |
| `/tmp/expensify-98624-base` | `e9e328bf3f6e72f59d5b32116ae4c8c4a69aacde` | Clean base checkout |
| `/tmp/expensify-98624-final` | `e9e328bf3f6e72f59d5b32116ae4c8c4a69aacde` plus this local patch | Final source and test changes |

Each checkout received a fresh `npm ci` using the locked dependency graph and the required toolchain:

- Node `v26.5.0`
- npm `11.17.0`
- Bun `1.3.14`
- `package-lock.json` SHA-256: `667594cb0f4b74f4adb4a384da6d582489019816212c174933b14abc4ad0cd63`
- Installed patched `react-native-fs` Android `RNFSManager.java` SHA-256: `859e3bc95d258ba7fae8fbd293b9dfe3e575aab2e6917e71d3740b06aff7f209`

The final delivery patch is checked against this recorded base in `TEST_EVIDENCE.md`.

No commit, pull request, issue comment, push, or other publication was made from this checkout.
