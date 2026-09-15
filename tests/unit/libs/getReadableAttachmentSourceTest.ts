import type * as AttachmentSourceModule from '@libs/getReadableAttachmentSource';

const mockCurrentContainer = '/Containers/Data/Application/CURRENT';
const mockReceiptsFolder = `${mockCurrentContainer}/Documents/Receipts-Upload`;
const mockOldReceiptsFolder = '/Containers/Data/Application/OLD/Documents/Receipts-Upload';
const mockOutsideFolder = `${mockCurrentContainer}/Library/PickerCache`;
const mockFiles = new Set<string>();
const mockDirectories = new Set<string>();
const mockStat = jest.fn<Promise<{isFile: () => boolean}>, [string]>();

jest.mock('react-native-fs', () => ({
    CachesDirectoryPath: `${mockCurrentContainer}/Library/Caches`,
    DocumentDirectoryPath: `${mockCurrentContainer}/Documents`,
    stat: (path: string) => mockStat(path),
}));
jest.mock('react-native-blob-util', () => ({fs: {dirs: {DocumentDir: `${mockCurrentContainer}/Documents`}}}));
jest.mock('@expensify/react-native-hybrid-app', () => ({__esModule: true, default: {isHybridApp: jest.fn(() => false)}}));
jest.mock('@libs/Log', () => ({__esModule: true, default: {warn: jest.fn()}}));
jest.mock('@libs/saveLastRoute', () => ({__esModule: true, default: jest.fn()}));
jest.mock('@libs/getReceiptsUploadFolderPath', () => ({__esModule: true, default: () => mockReceiptsFolder}));
jest.mock('@libs/ReceiptStorage', () => jest.requireActual('@libs/ReceiptStorage/index.native.ts'));

// Exercise the real selector, native receipt resolver, and URI-to-path conversion.
// The filesystem boundary checks exact native paths: it does not decode URI text.
const {default: getReadableAttachmentSource} = jest.requireActual<typeof AttachmentSourceModule>('@libs/getReadableAttachmentSource');

const fileCases = [
    {label: 'ordinary name', disk: 'photo.jpg', stored: 'photo.jpg', encoded: 'photo.jpg'},
    {label: 'encoded space', disk: 'space name.jpg', stored: 'space%20name.jpg', encoded: 'space%20name.jpg'},
    {label: 'raw space', disk: 'space name.jpg', stored: 'space name.jpg', encoded: 'space%20name.jpg'},
    {label: 'encoded hash', disk: 'hash#1.jpg', stored: 'hash%231.jpg', encoded: 'hash%231.jpg'},
    {label: 'raw hash', disk: 'hash#1.jpg', stored: 'hash#1.jpg', encoded: 'hash%231.jpg'},
    {label: 'encoded percent', disk: 'percent%23.jpg', stored: 'percent%2523.jpg', encoded: 'percent%2523.jpg'},
    {label: 'legacy raw percent', disk: 'percent%23.jpg', stored: 'percent%23.jpg', encoded: 'percent%2523.jpg'},
    {label: 'literal percent sign', disk: 'value50%.jpg', stored: 'value50%.jpg', encoded: 'value50%25.jpg'},
    {label: 'multiple literal escapes', disk: 'percent%2523.jpg', stored: 'percent%252523.jpg', encoded: 'percent%252523.jpg'},
] as const;

describe('getReadableAttachmentSource', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockFiles.clear();
        mockDirectories.clear();
        mockStat.mockImplementation(async (path) => {
            if (mockFiles.has(path)) {
                return {isFile: () => true};
            }
            if (mockDirectories.has(path)) {
                return {isFile: () => false};
            }
            throw Object.assign(new Error(`ENOENT: no such file '${path}'`), {code: 'ENOENT'});
        });
    });

    describe.each([
        {location: 'unchanged container', storedFolder: mockReceiptsFolder, diskFolder: mockReceiptsFolder},
        {location: 'moved container', storedFolder: mockOldReceiptsFolder, diskFolder: mockReceiptsFolder},
        {location: 'outside receipt storage', storedFolder: mockOutsideFolder, diskFolder: mockOutsideFolder},
    ])('$location', ({storedFolder, diskFolder}) => {
        it.each(fileCases)('retains the exact selected path and read URI for $label', async ({disk, stored, encoded}) => {
            const nativePath = `${diskFolder}/${disk}`;
            mockFiles.add(nativePath);
            if (stored === 'percent%2523.jpg') {
                // Both a zero-decode and a double-decode candidate exist; neither is the intended file.
                mockFiles.add(`${diskFolder}/percent%2523.jpg`);
                mockFiles.add(`${diskFolder}/percent#.jpg`);
            }

            const selected = await getReadableAttachmentSource(`file://${storedFolder}/${stored}`);

            expect(selected).toEqual({nativePath, readURI: `file://${diskFolder}/${encoded}`});
            expect(mockStat).toHaveBeenCalledWith(nativePath);
        });
    });

    it('preserves a surviving raw stored file before considering relocated candidates', async () => {
        const nativePath = `${mockOldReceiptsFolder}/percent%23.jpg`;
        mockFiles.add(nativePath);
        mockFiles.add(`${mockReceiptsFolder}/percent#.jpg`);

        const selected = await getReadableAttachmentSource(`file://${mockOldReceiptsFolder}/percent%23.jpg`);

        expect(selected).toEqual({nativePath, readURI: `file://${mockOldReceiptsFolder}/percent%2523.jpg`});
        expect(mockStat).not.toHaveBeenCalledWith(`${mockReceiptsFolder}/percent#.jpg`);
    });

    it('keeps decoded-then-raw precedence when both names exist', async () => {
        mockFiles.add(`${mockReceiptsFolder}/percent#.jpg`);
        mockFiles.add(`${mockReceiptsFolder}/percent%23.jpg`);

        const selected = await getReadableAttachmentSource(`file://${mockReceiptsFolder}/percent%23.jpg`);

        expect(selected).toEqual({nativePath: `${mockReceiptsFolder}/percent#.jpg`, readURI: `file://${mockReceiptsFolder}/percent%23.jpg`});
        expect(mockStat).toHaveBeenCalledTimes(1);
    });

    it('does not treat a directory as a selected file', async () => {
        mockDirectories.add(`${mockReceiptsFolder}/percent#.jpg`);
        mockFiles.add(`${mockReceiptsFolder}/percent%23.jpg`);

        expect(await getReadableAttachmentSource(`file://${mockReceiptsFolder}/percent%23.jpg`)).toEqual({
            nativePath: `${mockReceiptsFolder}/percent%23.jpg`,
            readURI: `file://${mockReceiptsFolder}/percent%2523.jpg`,
        });
    });

    it.each([mockReceiptsFolder, mockOldReceiptsFolder])('does not decode a bare native filename in %s', async (storedFolder) => {
        mockFiles.add(`${mockReceiptsFolder}/percent%23.jpg`);
        mockFiles.add(`${mockReceiptsFolder}/percent#.jpg`);

        expect(await getReadableAttachmentSource(`${storedFolder}/percent%23.jpg`)).toEqual({
            nativePath: `${mockReceiptsFolder}/percent%23.jpg`,
            readURI: `file://${mockReceiptsFolder}/percent%2523.jpg`,
        });
    });

    it('does not stat the same missing candidate twice', async () => {
        expect(await getReadableAttachmentSource(`file://${mockReceiptsFolder}/missing.jpg`)).toEqual({
            nativePath: `${mockReceiptsFolder}/missing.jpg`,
            readURI: `file://${mockReceiptsFolder}/missing.jpg`,
        });
        expect(mockStat).toHaveBeenCalledTimes(1);
    });

    it('leaves read or copy failure handling to the caller when no candidate exists', async () => {
        expect(await getReadableAttachmentSource(`file://${mockOldReceiptsFolder}/missing.jpg`)).toEqual({
            nativePath: `${mockReceiptsFolder}/missing.jpg`,
            readURI: `file://${mockReceiptsFolder}/missing.jpg`,
        });
        expect(mockStat).toHaveBeenCalledTimes(2);
    });

    it.each(['https://example.com/image.jpg?sig=a%23b', 'content://media/external/images/1', 'blob:attachment', ''])('passes through %s without filesystem access', async (source) => {
        expect(await getReadableAttachmentSource(source)).toEqual({readURI: source});
        expect(mockStat).not.toHaveBeenCalled();
    });
});
