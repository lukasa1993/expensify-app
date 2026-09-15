import {checkFileExistsWithReason} from '@libs/fileDownload/checkFileExists';
import {readFileAsync} from '@libs/fileDownload/FileUtils';
import ReceiptStorage from '@libs/ReceiptStorage';
import {logReceiptDropped} from '@libs/telemetry/ReceiptObservability';
import validateFormDataParameter from '@libs/validateFormDataParameter';

import type {Receipt} from '@src/types/onyx/Transaction';

import type PrepareRequestPayload from './types';

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
                const {source, name, type, receiptTraceId} = value as Omit<File, 'source'> & Pick<Receipt, 'receiptTraceId' | 'source'>;

                if (source) {
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
                        formData.append(key, receiptFormData as File);
                    });
                }
            }

            if (key === 'file' && initiatedOffline) {
                const {uri: path = '', source, name, type, receiptTraceId} = value as File & {receiptTraceId?: string};
                if (!source) {
                    validateFormDataParameter(command, key, value);
                    formData.append(key, value as string | Blob);

                    return Promise.resolve();
                }
                // Use the actual file name if available, otherwise fall back to extracting from path/uri
                const fileName = name || (path ? (path.split('/').pop() ?? '') : '') || '';
                const resolvedURI = ReceiptStorage.resolve(source) ?? source;
                const currentURI = resolvedURI.startsWith('file://')
                    ? `file://${resolvedURI
                          .slice('file://'.length)
                          .split('/')
                          .map((pathSegment) => encodeURIComponent(pathSegment))
                          .join('/')}`
                    : resolvedURI;

                return (resolvedURI === source ? Promise.resolve(source) : checkFileExistsWithReason(source).then(({exists}) => (exists ? source : currentURI))).then((sourceToRead) => {
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
                        formData.append(key, file);
                    });
                });
            }

            validateFormDataParameter(command, key, value);
            formData.append(key, value as string | Blob);

            return Promise.resolve();
        });
    }

    return promiseChain.then(() => formData);
};

export default prepareRequestPayload;
