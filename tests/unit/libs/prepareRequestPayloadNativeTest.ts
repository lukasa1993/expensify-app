import type * as AttachmentNativeModule from '@libs/actions/Attachment/index.native';
import fileURIToPath from '@libs/fileURIToPath';
import type PrepareRequestPayload from '@libs/prepareRequestPayload/types';

import ONYXKEYS from '@src/ONYXKEYS';
import type {Attachment} from '@src/types/onyx';

import Onyx from 'react-native-onyx';

import waitForBatchedUpdates from '../../utils/waitForBatchedUpdates';

type MockFileStat = {
    isFile: () => boolean;
};

type MockRemoteFile = {
    bytes: Uint8Array;
    mimeType: string;
};

type FileWithMockBytes = File & {
    mockBytes?: Uint8Array;
    source?: unknown;
    uri?: unknown;
};

const mockNativeFile = global.File;

// Jest's React Native File polyfill has no byte-reading API. Retain the bytes that the real
// readFileAsync passes into its File constructor so FormData can be checked without replacing it.
class MockFileWithBytes extends mockNativeFile {
    constructor(parts: Array<Blob | string>, name: string, options?: {type?: string}) {
        super(parts, name, options);
        const bytes = (parts.find((part): part is Blob & {mockBytes?: Uint8Array} => part instanceof Blob && 'mockBytes' in part) as (Blob & {mockBytes?: Uint8Array}) | undefined)
            ?.mockBytes;
        Object.defineProperty(this, 'mockBytes', {value: bytes ? Uint8Array.from(bytes) : new Uint8Array()});
    }
}

const mockOldContainer = '/Containers/Data/Application/OLD';
const mockCurrentContainer = '/Containers/Data/Application/CURRENT';
const mockReceiptsFolder = `${mockCurrentContainer}/Documents/Receipts-Upload`;
const mockAttachmentCacheFolder = `${mockCurrentContainer}/Library/Caches/attachments`;
const mockFileContents = new Map<string, Uint8Array>();
const mockFileMimeTypes = new Map<string, string>();
const mockDirectories = new Set<string>();
const mockUnreadablePaths = new Set<string>();
const mockRemoteFiles = new Map<string, MockRemoteFile>();

const mockStat = jest.fn<Promise<MockFileStat>, [string]>();
const mockExists = jest.fn<Promise<boolean>, [string]>();
const mockCopyFile = jest.fn<Promise<void>, [string, string]>();
const mockMkdir = jest.fn<Promise<void>, [string]>();
const mockBlobFetch = jest.fn<Promise<void>, [string, string, string]>();
const mockFetch = jest.fn();

function mockNormalizeRNFSPath(path: string) {
    // react-native-fs removes the scheme in JS before the native module opens the path. It does
    // not decode percent escapes; production must hand it the native filesystem path itself.
    return path.startsWith('file://') ? path.slice('file://'.length) : path;
}

function mockDirectoryName(path: string) {
    return path.slice(0, path.lastIndexOf('/'));
}

function mockBytes(value: string) {
    return new TextEncoder().encode(value);
}

function mockWriteFile(path: string, contents: string, mimeType = 'image/jpeg') {
    mockFileContents.set(path, mockBytes(contents));
    mockFileMimeTypes.set(path, mimeType);
}

function mockReadFileText(path: string) {
    const bytes = mockFileContents.get(path);
    return bytes ? new TextDecoder().decode(bytes) : undefined;
}

function mockBlobFromBytes(bytes: Uint8Array, mimeType: string) {
    const blob = new Blob([new TextDecoder().decode(bytes)], {type: mimeType}) as Blob & {mockBytes?: Uint8Array};
    Object.defineProperty(blob, 'mockBytes', {value: Uint8Array.from(bytes)});
    return blob;
}

function oldReceiptURI(fileName: string) {
    return `file://${mockOldContainer}/Documents/Receipts-Upload/${fileName}`;
}

function currentReceiptURI(fileName: string) {
    return `file://${mockReceiptsFolder}/${fileName}`;
}

function createFileError(message: string, code: string) {
    return Object.assign(new Error(message), {code});
}

async function getCachedMetadata(attachmentID: string) {
    let cachedAttachment: Attachment | undefined;
    const attachmentKey = `${ONYXKEYS.COLLECTION.ATTACHMENT}${attachmentID}`;
    const connection = Onyx.connect({
        key: ONYXKEYS.COLLECTION.ATTACHMENT,
        callback: (attachments) => {
            cachedAttachment = (attachments as Record<string, Attachment | undefined> | undefined)?.[attachmentKey];
        },
    });

    await waitForBatchedUpdates();
    Onyx.disconnect(connection);
    return cachedAttachment;
}

async function fileText(file: FileWithMockBytes) {
    return new TextDecoder().decode(file.mockBytes ?? new Uint8Array());
}

function getUploadedFile(formData: FormData, key: string): FileWithMockBytes {
    const value = formData.get(key);
    if (!(value instanceof File)) {
        throw new Error(`Expected FormData '${key}' to contain a File`);
    }

    return value;
}

jest.mock('react-native-fs', () => ({
    CachesDirectoryPath: `${mockCurrentContainer}/Library/Caches`,
    DocumentDirectoryPath: `${mockCurrentContainer}/Documents`,
    stat: (path: string) => mockStat(path),
    exists: (path: string) => mockExists(path),
    copyFile: (source: string, destination: string) => mockCopyFile(source, destination),
    mkdir: (path: string) => mockMkdir(path),
    unlink: jest.fn(),
}));

jest.mock('react-native-blob-util', () => ({
    config: ({path}: {path?: string}) => ({fetch: (method: string, uri: string) => mockBlobFetch(method, uri, path ?? '')}),
    fs: {dirs: {DocumentDir: `${mockCurrentContainer}/Documents`}},
}));

jest.mock('@expensify/react-native-hybrid-app', () => ({__esModule: true, default: {isHybridApp: jest.fn(() => false)}}));
jest.mock('@libs/Log', () => ({__esModule: true, default: {warn: jest.fn()}}));
jest.mock('@libs/saveLastRoute', () => ({__esModule: true, default: jest.fn()}));

const mockValidateFormDataParameter = jest.fn();
jest.mock('@libs/validateFormDataParameter', () => ({
    __esModule: true,
    default: mockValidateFormDataParameter,
}));

const mockLogReceiptDropped = jest.fn();
jest.mock('@libs/telemetry/ReceiptObservability', () => ({
    logReceiptDropped: mockLogReceiptDropped,
}));

jest.mock('@libs/getReceiptsUploadFolderPath', () => ({
    __esModule: true,
    default: () => mockReceiptsFolder,
}));

// Bypass the global Jest mock to exercise the actual native payload, attachment, receipt-storage,
// checkFileExists, and readFileAsync implementations. Only native filesystem and fetch I/O are mocked.
const {default: prepareRequestPayload}: {default: PrepareRequestPayload} = jest.requireActual('@libs/prepareRequestPayload/index.native.ts');
const {cacheAttachment, getCachedAttachment} = jest.requireActual<typeof AttachmentNativeModule>('@libs/actions/Attachment/index.native.ts');

const attachmentFileCases = [
    {description: 'ordinary filename', diskName: 'photo.jpg', encodedName: 'photo.jpg'},
    {description: 'spaces', diskName: 'space name.jpg', encodedName: 'space%20name.jpg'},
    {description: 'hash', diskName: 'hash#1.jpg', encodedName: 'hash%231.jpg'},
    {description: 'literal percent-23', diskName: 'percent%23.jpg', encodedName: 'percent%2523.jpg'},
] as const;

function writePercentEncodingDecoys() {
    // The exact-path map makes an accidental zero or second decode observable as wrong bytes,
    // rather than only as a missing-source failure.
    mockWriteFile(`${mockReceiptsFolder}/percent%2523.jpg`, 'wrong zero-decode bytes');
    mockWriteFile(`${mockReceiptsFolder}/percent#.jpg`, 'wrong double-decode bytes');
}

describe('native attachment caching and payload recovery', () => {
    beforeAll(() => {
        Object.defineProperty(global, 'File', {configurable: true, value: MockFileWithBytes, writable: true});
    });

    afterAll(() => {
        Object.defineProperty(global, 'File', {configurable: true, value: mockNativeFile, writable: true});
    });

    beforeEach(async () => {
        jest.clearAllMocks();
        mockFileContents.clear();
        mockFileMimeTypes.clear();
        mockDirectories.clear();
        mockUnreadablePaths.clear();
        mockRemoteFiles.clear();
        await Onyx.clear();
        await waitForBatchedUpdates();

        mockStat.mockImplementation(async (path) => {
            const nativePath = mockNormalizeRNFSPath(path);
            if (mockFileContents.has(nativePath)) {
                return {isFile: () => true};
            }
            throw createFileError(`ENOENT: no such file, stat '${nativePath}'`, 'ENOENT');
        });
        mockExists.mockImplementation(async (path) => {
            const nativePath = mockNormalizeRNFSPath(path);
            return mockFileContents.has(nativePath) || mockDirectories.has(nativePath);
        });
        mockMkdir.mockImplementation(async (path) => {
            mockDirectories.add(mockNormalizeRNFSPath(path));
        });
        mockCopyFile.mockImplementation(async (source, destination) => {
            const sourcePath = mockNormalizeRNFSPath(source);
            const destinationPath = mockNormalizeRNFSPath(destination);
            const sourceBytes = mockFileContents.get(sourcePath);

            if (!sourceBytes) {
                throw createFileError(`ENOENT: no such file, copy '${sourcePath}'`, 'ENOENT');
            }
            if (!mockDirectories.has(mockDirectoryName(destinationPath))) {
                throw createFileError(`ENOENT: no such directory, copy '${destinationPath}'`, 'ENOENT');
            }

            mockFileContents.set(destinationPath, Uint8Array.from(sourceBytes));
            mockFileMimeTypes.set(destinationPath, mockFileMimeTypes.get(sourcePath) ?? 'application/octet-stream');
        });
        mockBlobFetch.mockImplementation(async (method, uri, destinationPath) => {
            if (method !== 'GET' || uri.startsWith('file://')) {
                throw createFileError(`Unsupported native blob fetch '${method} ${uri}'`, 'EINVAL');
            }

            const remoteFile = mockRemoteFiles.get(uri);
            if (!remoteFile) {
                throw createFileError(`ENOENT: no remote file '${uri}'`, 'ENOENT');
            }
            if (!mockDirectories.has(mockDirectoryName(destinationPath))) {
                throw createFileError(`ENOENT: no such directory, copy '${destinationPath}'`, 'ENOENT');
            }

            mockFileContents.set(destinationPath, Uint8Array.from(remoteFile.bytes));
            mockFileMimeTypes.set(destinationPath, remoteFile.mimeType);
        });
        mockFetch.mockImplementation((input: string | {url?: string}, init?: RequestInit) => {
            const uri = typeof input === 'string' ? input : (input.url ?? '');
            if (init?.method === 'HEAD') {
                const remoteFile = mockRemoteFiles.get(uri);
                if (!remoteFile) {
                    return Promise.reject(createFileError(`Unsupported HEAD '${uri}'`, 'EINVAL'));
                }
                return Promise.resolve({
                    headers: {
                        get: (header: string) => {
                            if (header.toLowerCase() === 'content-type') {
                                return remoteFile.mimeType;
                            }
                            if (header.toLowerCase() === 'content-length') {
                                return String(remoteFile.bytes.byteLength);
                            }
                            return null;
                        },
                    },
                });
            }

            const remoteFile = mockRemoteFiles.get(uri);
            if (remoteFile) {
                return Promise.resolve({ok: true, blob: () => Promise.resolve(mockBlobFromBytes(remoteFile.bytes, remoteFile.mimeType))});
            }

            // Fetch is the I/O boundary used by the real readFileAsync. file:// URLs resolve one
            // URI layer to their native path; a bare path is already a native path.
            const nativePath = uri.startsWith('file://') ? fileURIToPath(uri) : uri;
            if (mockUnreadablePaths.has(nativePath)) {
                return Promise.reject(createFileError(`EACCES: unable to read '${nativePath}'`, 'EACCES'));
            }

            const bytes = mockFileContents.get(nativePath);
            if (!bytes) {
                return Promise.reject(createFileError(`ENOENT: unable to read '${nativePath}'`, 'ENOENT'));
            }
            return Promise.resolve({ok: true, blob: () => Promise.resolve(mockBlobFromBytes(bytes, mockFileMimeTypes.get(nativePath) ?? 'application/octet-stream'))});
        });
        global.fetch = mockFetch as typeof fetch;
    });

    it.each(attachmentFileCases)('copies exact bytes and writes cache metadata for an unchanged $description URI', async ({diskName, encodedName}) => {
        const sourcePath = `${mockReceiptsFolder}/${diskName}`;
        const sourceURI = currentReceiptURI(encodedName);
        const attachmentID = `unchanged-${encodedName}`;
        const destinationPath = `${mockAttachmentCacheFolder}/${attachmentID}.jpg`;
        const bytes = `unchanged bytes for ${diskName}`;
        mockWriteFile(sourcePath, bytes);
        if (diskName === 'percent%23.jpg') {
            writePercentEncodingDecoys();
        }

        await cacheAttachment({attachmentID, uri: sourceURI, mimeType: 'image/jpeg'});

        expect(mockReadFileText(destinationPath)).toBe(bytes);
        await expect(mockExists(destinationPath)).resolves.toBe(true);
        expect((await mockStat(destinationPath)).isFile()).toBe(true);
        expect(await getCachedMetadata(attachmentID)).toEqual({attachmentID, source: destinationPath});
        expect(mockCopyFile).toHaveBeenCalledWith(sourcePath, destinationPath);
    });

    it.each(attachmentFileCases)('copies exact bytes and writes cache metadata after the container moves for $description', async ({diskName, encodedName}) => {
        const sourcePath = `${mockReceiptsFolder}/${diskName}`;
        const attachmentID = `moved-${encodedName}`;
        const destinationPath = `${mockAttachmentCacheFolder}/${attachmentID}.jpg`;
        const bytes = `moved bytes for ${diskName}`;
        mockWriteFile(sourcePath, bytes);
        if (diskName === 'percent%23.jpg') {
            writePercentEncodingDecoys();
        }

        await cacheAttachment({attachmentID, uri: oldReceiptURI(encodedName), mimeType: 'image/jpeg'});

        expect(mockReadFileText(destinationPath)).toBe(bytes);
        await expect(mockExists(destinationPath)).resolves.toBe(true);
        expect((await mockStat(destinationPath)).isFile()).toBe(true);
        expect(await getCachedMetadata(attachmentID)).toEqual({attachmentID, source: destinationPath});
        expect(mockCopyFile).toHaveBeenCalledWith(sourcePath, destinationPath);
    });

    it('keeps a readable stored literal-hash URI intact while copying its on-disk bytes', async () => {
        const sourcePath = `${mockReceiptsFolder}/literal#hash.jpg`;
        const sourceURI = currentReceiptURI('literal#hash.jpg');
        const attachmentID = 'literal-hash';
        const destinationPath = `${mockAttachmentCacheFolder}/${attachmentID}.jpg`;
        mockWriteFile(sourcePath, 'literal hash bytes');

        await cacheAttachment({attachmentID, uri: sourceURI, mimeType: 'image/jpeg'});

        expect(mockReadFileText(destinationPath)).toBe('literal hash bytes');
        expect(await getCachedMetadata(attachmentID)).toEqual({attachmentID, source: destinationPath});
        expect(mockCopyFile).toHaveBeenCalledWith(sourcePath, destinationPath);
    });

    it('returns a valid cache hit unchanged', async () => {
        const attachmentID = 'valid-cache';
        const cachePath = `${mockAttachmentCacheFolder}/${attachmentID}.jpg`;
        mockWriteFile(cachePath, 'cached bytes');

        const source = await getCachedAttachment({
            attachmentID,
            attachment: {attachmentID, source: cachePath},
            currentSource: oldReceiptURI('photo.jpg'),
        });

        expect(source).toBe(`file://${cachePath}`);
        expect(mockCopyFile).not.toHaveBeenCalled();
        expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rebuilds a purged local image cache with bytes and metadata, then uses the rebuilt cache', async () => {
        const attachmentID = 'purged-cache';
        const cachePath = `${mockAttachmentCacheFolder}/${attachmentID}.jpg`;
        const sourcePath = `${mockReceiptsFolder}/purged%23.jpg`;
        const currentSource = oldReceiptURI('purged%2523.jpg');
        const sourceBytes = 'purged cache source bytes';
        mockWriteFile(sourcePath, sourceBytes);

        const fallbackSource = await getCachedAttachment({
            attachmentID,
            attachment: {attachmentID, source: cachePath},
            currentSource,
        });
        await waitForBatchedUpdates();

        expect(fallbackSource).toBe(currentReceiptURI('purged%2523.jpg'));
        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockBlobFetch).not.toHaveBeenCalled();
        expect(mockReadFileText(cachePath)).toBe(sourceBytes);
        const rebuiltMetadata = await getCachedMetadata(attachmentID);
        expect(rebuiltMetadata).toEqual({attachmentID, source: cachePath});

        const cacheHit = await getCachedAttachment({attachmentID, attachment: rebuiltMetadata, currentSource});

        expect(cacheHit).toBe(`file://${cachePath}`);
        expect(mockCopyFile).toHaveBeenCalledTimes(1);
    });

    it('does not issue a remote HEAD or GET for an unsupported local file', async () => {
        const attachmentID = 'unsupported-local';
        mockWriteFile(`${mockReceiptsFolder}/unsupported.pdf`, 'not an image', 'application/pdf');

        await cacheAttachment({attachmentID, uri: currentReceiptURI('unsupported.pdf')});

        expect(mockFetch).not.toHaveBeenCalled();
        expect(mockBlobFetch).not.toHaveBeenCalled();
        expect(await getCachedMetadata(attachmentID)).toBeUndefined();
    });

    it('preserves validated remote download caching', async () => {
        const attachmentID = 'remote-image';
        const uri = 'https://example.com/remote-image.jpg';
        const destinationPath = `${mockAttachmentCacheFolder}/${attachmentID}.jpg`;
        mockRemoteFiles.set(uri, {bytes: mockBytes('remote image bytes'), mimeType: 'image/jpeg'});

        await cacheAttachment({attachmentID, uri});

        expect(mockFetch).toHaveBeenCalledWith(uri, {method: 'HEAD'});
        expect(mockBlobFetch).toHaveBeenCalledWith('GET', uri, destinationPath);
        expect(mockReadFileText(destinationPath)).toBe('remote image bytes');
        expect(await getCachedMetadata(attachmentID)).toEqual({attachmentID, source: destinationPath, remoteSource: uri});
    });

    it('keeps unsupported remote files out of the cache after HEAD validation', async () => {
        const attachmentID = 'remote-pdf';
        const uri = 'https://example.com/remote.pdf';
        mockRemoteFiles.set(uri, {bytes: mockBytes('remote pdf bytes'), mimeType: 'application/pdf'});

        await cacheAttachment({attachmentID, uri});

        expect(mockFetch).toHaveBeenCalledWith(uri, {method: 'HEAD'});
        expect(mockBlobFetch).not.toHaveBeenCalled();
        expect(await getCachedMetadata(attachmentID)).toBeUndefined();
    });

    it('keeps receipt branch recovery behavior unchanged', async () => {
        mockWriteFile(`${mockReceiptsFolder}/receipt.jpg`, 'receipt bytes');
        const receipt = {
            source: oldReceiptURI('receipt.jpg'),
            uri: oldReceiptURI('receipt.jpg'),
            name: 'receipt.jpg',
            type: 'image/jpeg',
        };

        const formData = await prepareRequestPayload('RequestMoney', {receipt, amount: '100'}, false);

        expect(formData.has('receipt')).toBe(true);
        expect(formData.get('amount')).toBe('100');
        expect(mockLogReceiptDropped).not.toHaveBeenCalled();
    });

    it('keeps receipt missing-file telemetry unchanged', async () => {
        const receipt = {
            source: currentReceiptURI('gone.jpg'),
            uri: currentReceiptURI('gone.jpg'),
            name: 'gone.jpg',
            type: 'image/jpeg',
            receiptTraceId: 'receipt-trace-123',
        };

        const formData = await prepareRequestPayload('RequestMoney', {receipt, transactionID: 'receipt-transaction-456', amount: '100'}, false);

        expect(formData.has('receipt')).toBe(false);
        expect(formData.get('amount')).toBe('100');
        expect(mockLogReceiptDropped).toHaveBeenCalledWith({
            receiptTraceId: 'receipt-trace-123',
            transactionID: 'receipt-transaction-456',
            command: 'RequestMoney',
            source: currentReceiptURI('gone.jpg'),
            fileName: 'gone.jpg',
            statError: {message: `ENOENT: no such file, stat '${mockReceiptsFolder}/gone.jpg'`, code: 'ENOENT'},
        });
    });

    it('keeps bundled placeholder receipt handling unchanged', async () => {
        const formData = await prepareRequestPayload('AddTrackedExpenseToPolicy', {receipt: {source: 686, name: 'receipt-generic.png', type: 'image/png'}, amount: '100'}, false);

        expect(mockStat).not.toHaveBeenCalled();
        expect(mockLogReceiptDropped).not.toHaveBeenCalled();
        expect(formData.has('receipt')).toBe(false);
        expect(formData.get('amount')).toBe('100');
    });

    it.each(attachmentFileCases)('uses real readFileAsync to put recovered $description bytes, filename, and MIME type in FormData', async ({diskName, encodedName}) => {
        const sourcePath = `${mockReceiptsFolder}/${diskName}`;
        const sourceBytes = `offline payload bytes for ${diskName}`;
        mockWriteFile(sourcePath, sourceBytes);

        const formData = await prepareRequestPayload(
            'AddTextAndAttachment',
            {
                file: {source: oldReceiptURI(encodedName), name: 'upload.jpg', type: 'image/jpeg'},
                reportComment: 'Photo from yesterday',
            },
            true,
        );

        const uploadedFile = getUploadedFile(formData, 'file');
        expect(uploadedFile).toBeInstanceOf(File);
        expect(await fileText(uploadedFile)).toBe(sourceBytes);
        expect(uploadedFile.name).toBe('upload.jpg');
        expect(uploadedFile.type).toBe('image/jpeg');
        expect(uploadedFile.source).toBe(currentReceiptURI(encodedName));
        expect(uploadedFile.uri).toBe(currentReceiptURI(encodedName));
        expect(formData.get('reportComment')).toBe('Photo from yesterday');
        expect(mockLogReceiptDropped).not.toHaveBeenCalled();
    });

    it('preserves a readable encoded source for real readFileAsync', async () => {
        const sourceURI = currentReceiptURI('percent%2523.jpg');
        const sourcePath = `${mockReceiptsFolder}/percent%23.jpg`;
        mockWriteFile(sourcePath, 'readable literal percent-23 bytes');

        const formData = await prepareRequestPayload('AddAttachment', {file: {source: sourceURI, name: 'upload.jpg', type: 'image/jpeg'}}, true);

        const uploadedFile = getUploadedFile(formData, 'file');
        expect(await fileText(uploadedFile)).toBe('readable literal percent-23 bytes');
        expect(uploadedFile.source).toBe(sourceURI);
        expect(mockFetch).toHaveBeenCalledWith(sourceURI);
    });

    it('omits a missing offline attachment and logs exactly one failure event', async () => {
        const storedURI = oldReceiptURI('missing.jpg');

        const formData = await prepareRequestPayload(
            'AddTextAndAttachment',
            {
                file: {source: storedURI, name: 'missing.jpg', type: 'image/jpeg', receiptTraceId: 'trace-123'},
                transactionID: 'transaction-456',
                reportComment: 'Still send the comment',
            },
            true,
        );

        expect(formData.has('file')).toBe(false);
        expect(formData.get('reportComment')).toBe('Still send the comment');
        expect(mockLogReceiptDropped).toHaveBeenCalledTimes(1);
        expect(mockLogReceiptDropped).toHaveBeenCalledWith({
            receiptTraceId: 'trace-123',
            transactionID: 'transaction-456',
            command: 'AddTextAndAttachment',
            source: storedURI,
            fileName: 'missing.jpg',
            statError: {message: `ENOENT: unable to read '${mockReceiptsFolder}/missing.jpg'`, code: 'ENOENT'},
        });
    });

    it('omits an unreadable offline attachment and logs exactly one failure event', async () => {
        const sourceURI = currentReceiptURI('locked.jpg');
        const sourcePath = `${mockReceiptsFolder}/locked.jpg`;
        mockWriteFile(sourcePath, 'locked bytes');
        mockUnreadablePaths.add(sourcePath);

        const formData = await prepareRequestPayload('AddAttachment', {file: {source: sourceURI, name: 'locked.jpg', type: 'image/jpeg'}}, true);

        expect(formData.has('file')).toBe(false);
        expect(mockLogReceiptDropped).toHaveBeenCalledTimes(1);
        expect(mockLogReceiptDropped).toHaveBeenCalledWith(
            expect.objectContaining({
                command: 'AddAttachment',
                source: sourceURI,
                fileName: 'locked.jpg',
                statError: {message: `EACCES: unable to read '${sourcePath}'`, code: 'EACCES'},
            }),
        );
    });

    it('keeps remote offline sources, missing source handling, online uploads, and ordinary parameters unchanged', async () => {
        const remoteURI = 'https://example.com/offline-image.jpg';
        mockRemoteFiles.set(remoteURI, {bytes: mockBytes('remote payload bytes'), mimeType: 'image/jpeg'});
        const upload = new File(['already available'], 'attachment.jpg', {type: 'image/jpeg'});

        const remoteFormData = await prepareRequestPayload('AddAttachment', {file: {source: remoteURI, name: 'attachment.jpg', type: 'image/jpeg'}}, true);
        const offlineFormData = await prepareRequestPayload('AddAttachment', {file: upload}, true);
        const onlineFormData = await prepareRequestPayload('AddAttachment', {file: upload}, false);
        const ordinaryFormData = await prepareRequestPayload('SomeCommand', {amount: '100', currency: 'USD', undefinedField: undefined}, false);

        expect(await fileText(getUploadedFile(remoteFormData, 'file'))).toBe('remote payload bytes');
        expect(offlineFormData.get('file')).toBe(upload);
        expect(onlineFormData.get('file')).toBe(upload);
        expect(ordinaryFormData.get('amount')).toBe('100');
        expect(ordinaryFormData.get('currency')).toBe('USD');
        expect(ordinaryFormData.has('undefinedField')).toBe(false);
    });
});
