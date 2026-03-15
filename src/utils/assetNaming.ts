export const getAssetBaseName = (name: string) => name.trim().replace(/\.json$/iu, '');

export const getAssetDisplayName = (fileName: string, productName: string) => {
    const trimmedProductName = productName.trim();
    return trimmedProductName || getAssetBaseName(fileName);
};

export const toAssetFileName = (baseName: string) => `${getAssetBaseName(baseName)}.json`;
