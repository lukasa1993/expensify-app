# Base and dependency record

- Repository: `Expensify/App`
- Local branch: `fix/98624-attachment-paths`
- Recorded base: `e9e328bf3f6e72f59d5b32116ae4c8c4a69aacde`
- Final source/test revision: `2d9d91118463280ae6f5fca1c61c4b102a813e95`
- Source commit author is recorded in Git metadata.
- Locked dependency file: `package-lock.json`, SHA-256 `667594cb0f4b74f4adb4a384da6d582489019816212c174933b14abc4ad0cd63`
- Repository RNFS patch: `patches/react-native-fs/react-native-fs+2.20.0+001+encode-file-uris.patch`, SHA-256 `ea14f81b80bb415ffdfe6d43df9dc743f3897ebfaf525cc4b34efdef21873c87`

## Isolated checkout record

The final verification used detached worktrees at:

| Checkout | Revision / contents |
| --- | --- |
| `/home/l/bugs/.verification/98624-base` | Recorded base |
| `/home/l/bugs/.verification/98624-final` | Exact final five source/test files, hash-checked against `2d9d9111846` |
| Dedicated clean-application worktree | Recorded base plus the generated full patch |

All verification commands used Node `v26.5.0`, npm `11.17.0`, and Bun `1.3.14`. Fresh `npm ci` was attempted but did not complete in this VM's dependency-cache/install environment. The isolated worktrees instead used the same installed package-lock-backed dependency snapshot and re-bound local `file:` packages to each checkout. This is a recorded limitation, not a claim of a fresh clean installation.

The complete delivery artifact is `/home/l/bugs/fix-98624-attachment-paths.patch` (SHA-256 `d19434362ca6593f8e2cacebc92353f5b5400c6f26b957c01f0c0d53f5a58afa`). It was generated from the base through the final source tree and cleanly application-checked against the recorded base.

No push or external publication was made.
