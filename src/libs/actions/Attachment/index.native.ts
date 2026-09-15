import {getImageCacheFileExtension} from '@libs/AttachmentUtils';
import {getMimeTypeFromUri} from '@libs/fileDownload/FileUtils';
import type {ReadableAttachmentSource} from '@libs/getReadableAttachmentSource';
import getReadableAttachmentSource from '@libs/getReadableAttachmentSource';
import Log from '@libs/Log';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';

import RNFetchBlob from 'react-native-blob-util';
import RNFS from 'react-native-fs';
import Onyx from 'react-native-onyx';

import type {CacheAttachmentProps, GetCachedAttachmentProps, RemoveCachedAttachmentProps} from './types';

// Cached attachments are re-downloadable, so they live in Caches, which the OS may purge
// and which is never exposed to the user via the iOS Files app (unlike Documents)
const ATTACHMENT_DIR = `${RNFS.CachesDirectoryPath}/attachments`;

async function cacheAttachmentFromSource({attachmentID, source, mimeType}: {attachmentID: string; source: ReadableAttachmentSource; mimeType?: string}) {
    const {readURI: currentURI, nativePath} = source;

    // For local file uploads, copy supported images instead of routing a file:// URI through
    // the remote HEAD/download path. Re-cache callers do not have a MIME type, so derive it
    // from the image filename in that case.
    if (nativePath !== undefined) {
        const contentType = mimeType ?? getMimeTypeFromUri(currentURI) ?? '';
        const fileExtension = getImageCacheFileExtension(contentType);
        if (!fileExtension) {
            Log.warn('[AttachmentCache] Unsupported file type, skipping cache', {attachmentID, contentType});
            return;
        }

        const fileName = `${attachmentID}.${fileExtension}`;
        const destPath = `${ATTACHMENT_DIR}/${fileName}`;

        try {
            // The OS can purge Caches wholesale, so the directory may need recreating
            await RNFS.mkdir(ATTACHMENT_DIR);
            // The source selector already chose the exact decoded-or-raw filesystem path.
            // Decoding it again would change a literal %23 filename into a different # file.
            await RNFS.copyFile(nativePath, destPath);
            await Onyx.set(`${ONYXKEYS.COLLECTION.ATTACHMENT}${attachmentID}`, {
                attachmentID,
                source: destPath,
            });
        } catch (error) {
            Log.warn('[AttachmentCache] Failed to cache attachment', {error});
        }

        return;
    }

    try {
        // HEAD first to validate size and type before downloading
        const headResponse = await fetch(currentURI, {method: 'HEAD'});
        const contentType = headResponse.headers.get('content-type') ?? '';
        const contentSize = Number(headResponse.headers.get('content-length') ?? 0);

        // Exit if the attachment size is too large
        if (contentSize > CONST.API_ATTACHMENT_VALIDATIONS.MAX_SIZE) {
            Log.warn('[AttachmentCache] Attachment is too large, skipping cache', {attachmentID, contentSize});
            return;
        }

        const attachmentFileExtension = getImageCacheFileExtension(contentType ?? '');

        // If attachmentFileExtension is not set properly / or doesn't exist in our lists, then we need to exit
        if (!attachmentFileExtension) {
            Log.warn('[AttachmentCache] Unsupported file type, skipping cache', {attachmentID, contentType});
            return;
        }

        const fileName = `${attachmentID}.${attachmentFileExtension}`;
        const filePath = `${ATTACHMENT_DIR}/${fileName}`;
        // The OS can purge Caches wholesale, so the directory may need recreating
        await RNFS.mkdir(ATTACHMENT_DIR);
        await RNFetchBlob.config({path: filePath}).fetch('GET', currentURI);

        await Onyx.set(`${ONYXKEYS.COLLECTION.ATTACHMENT}${attachmentID}`, {
            attachmentID,
            source: filePath,
            remoteSource: currentURI,
        });
    } catch (error) {
        Log.warn('[AttachmentCache] Failed to cache attachment', {error});
    }
}

async function cacheAttachment({attachmentID, uri, mimeType}: CacheAttachmentProps) {
    const source = await getReadableAttachmentSource(uri);
    return cacheAttachmentFromSource({attachmentID, source, mimeType});
}

async function getCachedAttachment({attachmentID, attachment, currentSource}: GetCachedAttachmentProps) {
    const isStale = attachment ? attachment?.remoteSource && attachment.remoteSource !== currentSource : false;
    const localSource = attachment?.source;
    if (!isStale && localSource) {
        // A valid cache hit must not depend on the original source or receipt container.
        const localFileExists = await RNFS.exists(localSource);
        if (localFileExists) {
            // RNFS stores a native path; Android's image renderer needs the file:// scheme.
            return localSource.startsWith('file://') ? localSource : `file://${localSource}`;
        }
    }

    const source = await getReadableAttachmentSource(currentSource);
    if (isStale || localSource) {
        // Pass the selected path/URI pair through unchanged, including on a purged-cache rebuild.
        void cacheAttachmentFromSource({attachmentID, source});
    }

    return source.readURI;
}

async function removeCachedAttachment({attachmentID, localSource}: RemoveCachedAttachmentProps): Promise<void> {
    if (!localSource) {
        return;
    }

    try {
        const exists = await RNFS.exists(localSource);
        if (exists) {
            await RNFS.unlink(localSource);
        }
        await Onyx.set(`${ONYXKEYS.COLLECTION.ATTACHMENT}${attachmentID}`, null);
    } catch (error) {
        Log.warn('[AttachmentCache] Failed to remove cached attachment', {attachmentID, error});
    }
}

async function clearCachedAttachments(): Promise<void> {
    try {
        const exists = await RNFS.exists(ATTACHMENT_DIR);
        if (exists) {
            await RNFS.unlink(ATTACHMENT_DIR);
        }
        await Onyx.setCollection(ONYXKEYS.COLLECTION.ATTACHMENT, {});
    } catch (error) {
        Log.warn('[AttachmentCache] Failed to clear cached attachments', {error});
    }
}

export {cacheAttachment, getCachedAttachment, removeCachedAttachment, clearCachedAttachments};
