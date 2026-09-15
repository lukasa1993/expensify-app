import RNFS from 'react-native-fs';

import fileURIToPath from './fileURIToPath';
import ReceiptStorage from './ReceiptStorage';

type ReadableAttachmentSource = {
    /** URI for fetch/rendering, encoded from the exact selected native path. */
    readURI: string;

    /** Filesystem path for RNFS. Never decode this value again. Absent for non-file sources. */
    nativePath?: string;
};

/** Keep the selected filesystem identity and its URI together. */
function fromNativePath(nativePath: string): ReadableAttachmentSource {
    return {
        nativePath,
        readURI: `file://${nativePath
            .split('/')
            .map((segment) => encodeURIComponent(segment))
            .join('/')}`,
    };
}

/** Try each exact path once, retaining the one that actually names a file. */
async function findExistingFile(paths: string[], checkedPaths: Set<string>): Promise<string | undefined> {
    const path = paths.find((candidate) => !checkedPaths.has(candidate));
    if (!path) {
        return;
    }

    checkedPaths.add(path);
    try {
        const stat = await RNFS.stat(path);
        if (stat.isFile()) {
            return path;
        }
    } catch {
        // Try the next legacy representation. If none exists, the caller's actual read/copy
        // still reports failure through its existing error path rather than throwing here.
    }

    return findExistingFile(paths, checkedPaths);
}

/**
 * Select the exact attachment file before converting between filesystem paths and URIs.
 *
 * For legacy file:// sources, prefer the decoded path and then the raw path, matching the
 * existing file checker. If neither survives, re-root BOTH native candidates via receipt
 * storage. Passing bare paths to resolve() prevents another percent-decoding pass.
 * Remote/blob/content sources pass through without filesystem work.
 */
async function getReadableAttachmentSource(source: string): Promise<ReadableAttachmentSource> {
    if (!source.startsWith('file://') && !source.startsWith('/')) {
        return {readURI: source};
    }

    const rawPath = source.startsWith('file://') ? source.slice('file://'.length) : source;
    const decodedPath = fileURIToPath(source);
    const storedPaths = [...new Set([decodedPath, rawPath])];
    const checkedPaths = new Set<string>();
    const storedPath = await findExistingFile(storedPaths, checkedPaths);
    if (storedPath !== undefined) {
        return fromNativePath(storedPath);
    }

    const currentPaths = storedPaths.map((path) => {
        // resolve() receives an already-native path and returns an unencoded file URI.
        // Strip the scheme only: a literal %23 in that result is a filename, not an escape.
        const resolved = ReceiptStorage.resolve(path) ?? path;
        return resolved.startsWith('file://') ? resolved.slice('file://'.length) : resolved;
    });
    const currentPath = await findExistingFile(currentPaths, checkedPaths);

    // Preserve existing read/copy failure handling when no candidate is available. Prefer
    // the current-container decoded candidate, but do not claim it exists or retry a request.
    return fromNativePath(currentPath ?? currentPaths.at(0) ?? decodedPath);
}

export default getReadableAttachmentSource;
export type {ReadableAttachmentSource};
