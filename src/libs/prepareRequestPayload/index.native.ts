import {checkFileExistsWithReason} from '@libs/fileDownload/checkFileExists';
import {readFileAsync} from '@libs/fileDownload/FileUtils';
import getReadableAttachmentSource from '@libs/getReadableAttachmentSource';
import {isRecord} from '@libs/ObjectUtils';
import ReceiptStorage from '@libs/ReceiptStorage';
import {logReceiptDropped} from '@libs/telemetry/ReceiptObservability';
import validateFormDataParameter from '@libs/validateFormDataParameter';

import type PrepareRequestPayload from './types';

type NativeFormDataFile = {
    name?: string;
    type?: string;
    uri: string;
};

declare global {
    // FormData is a class in lib.dom, so declaration merging must use an interface here.
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface FormData {
        append(key: string, value: NativeFormDataFile): void;
    }
}

type QueuedFileData = {
    name?: string;
    receiptTraceId?: string;
    source?: number | string;
    type?: string;
    uri?: string;
};

function getQueuedFileData(value: unknown): QueuedFileData {
    if (!isRecord(value)) {
        return {};
    }

    const source = value.source;
    return {
        name: typeof value.name === 'string' ? value.name : undefined,
        receiptTraceId: typeof value.receiptTraceId === 'string' ? value.receiptTraceId : undefined,
        source: typeof source === 'string' || typeof source === 'number' ? source : undefined,
        type: typeof value.type === 'string' ? value.type : undefined,
        uri: typeof value.uri === 'string' ? value.uri : undefined,
    };
}

/** React Native FormData accepts URI descriptors in addition to the DOM's string/Blob types. */
function appendFormDataValue(formData: FormData, key: string, value: unknown) {
    if (typeof value === 'string' || value instanceof Blob) {
        formData.append(key, value);
        return;
    }

    if (isRecord(value) && typeof value.uri === 'string') {
        formData.append(key, {
            name: typeof value.name === 'string' ? value.name : undefined,
            type: typeof value.type === 'string' ? value.type : undefined,
            uri: value.uri,
        });
        return;
    }

    formData.append(key, String(value));
}

/**
 * Prepares the request payload (body) for a given command and data.
 * This function is specifically designed for native platforms (IOS and Android) to handle the regeneration of blob files. It ensures that files, such as receipts, are properly read and appended to the FormData object before the request is sent.
 */
const prepareRequestPayload: PrepareRequestPayload = (command, data, initiatedOffline) => {
    const formData = new FormData();
    let promiseChain = Promise.resolve();

    for (const key of Object.keys(data)) {
        promiseChain = promiseChain.then(() => {
            const value = data[key];

            if (value === undefined || value === null) {
                return Promise.resolve();
            }

            if (key === 'receipt') {
                const {source, name, type, receiptTraceId} = getQueuedFileData(value);

                if (source !== undefined && source !== '') {
                    // A bundled placeholder image (distance, per diem) is a require() asset id, so no file exists on disk.
                    if (typeof source === 'number') {
                        return Promise.resolve();
                    }

                    const localUri = ReceiptStorage.resolve(source) ?? source;

                    return checkFileExistsWithReason(localUri).then(({exists, error}) => {
                        if (!exists) {
                            const transactionID = typeof data.transactionID === 'string' ? data.transactionID : undefined;
                            logReceiptDropped({receiptTraceId, transactionID, command, source, fileName: name, statError: error});
                            return;
                        }
                        const receiptFormData = {
                            uri: localUri,
                            name,
                            type,
                        };
                        validateFormDataParameter(command, key, receiptFormData);
                        appendFormDataValue(formData, key, receiptFormData);
                    });
                }
            }

            if (key === 'file' && initiatedOffline) {
                const {uri: path = '', source, name, type, receiptTraceId} = getQueuedFileData(value);
                if (typeof source !== 'string' || source.length === 0) {
                    validateFormDataParameter(command, key, value);
                    appendFormDataValue(formData, key, value);

                    return Promise.resolve();
                }
                // Use the actual file name if available, otherwise fall back to extracting from path/uri
                const fallbackFileName = path ? (path.split('/').pop() ?? '') : '';
                const fileName = name && name.length > 0 ? name : fallbackFileName;
                return getReadableAttachmentSource(source).then(({readURI: sourceToRead}) => {
                    let readError: {message: string; code?: string} | undefined;
                    return readFileAsync(
                        sourceToRead,
                        fileName,
                        () => {},
                        (error) => {
                            if (error instanceof Error) {
                                const {code} = error as Error & {code?: unknown};
                                readError = {message: error.message, code: typeof code === 'string' ? code : undefined};
                                return;
                            }
                            readError = {message: String(error)};
                        },
                        type,
                    ).then((file) => {
                        if (!file) {
                            const transactionID = typeof data.transactionID === 'string' ? data.transactionID : undefined;
                            logReceiptDropped({receiptTraceId, transactionID, command, source, fileName, statError: readError});
                            return;
                        }

                        validateFormDataParameter(command, key, file);
                        appendFormDataValue(formData, key, file);
                    });
                });
            }

            validateFormDataParameter(command, key, value);
            appendFormDataValue(formData, key, value);

            return Promise.resolve();
        });
    }

    return promiseChain.then(() => formData);
};

export default prepareRequestPayload;
