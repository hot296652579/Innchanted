import { ImageAsset, Texture2D, macro } from 'cc';

let patched = false;

/**
 * WeChat (and other mini-games) enable CLEANUP_IMAGE_CACHE by default.
 * KayKit FBX models share one atlas ImageAsset across many Texture2D @7d6ab
 * sub-assets. After the first GPU upload the engine nulls `_nativeData`, and
 * later Texture2D.initialize -> extractMipmaps crashes with Error 16352
 * (`mipmapLevelDataSize` of null).
 */
export function patchWechatTexture(): void {
    if (patched) {
        return;
    }
    patched = true;

    macro.CLEANUP_IMAGE_CACHE = false;

    const imageProto = ImageAsset.prototype as unknown as Record<string, unknown>;
    const mipDesc = Object.getOwnPropertyDescriptor(imageProto, 'mipmapLevelDataSize');
    if (mipDesc?.get) {
        Object.defineProperty(imageProto, 'mipmapLevelDataSize', {
            configurable: true,
            enumerable: mipDesc.enumerable ?? false,
            get(this: { _nativeData?: { mipmapLevelDataSize?: number[] } | null }) {
                const native = this._nativeData;
                return native ? native.mipmapLevelDataSize : undefined;
            },
        });
    }

    const origExtract = imageProto.extractMipmaps as ((this: ImageAsset) => ImageAsset[]) | undefined;
    if (typeof origExtract === 'function') {
        imageProto.extractMipmaps = function (this: ImageAsset) {
            try {
                if (!(this as unknown as { _nativeData?: unknown })._nativeData) {
                    return [this];
                }
                return origExtract.call(this);
            } catch {
                return [this];
            }
        };
    }

    const origExtract0 = imageProto.extractMipmap0 as ((this: ImageAsset) => ImageAsset) | undefined;
    if (typeof origExtract0 === 'function') {
        imageProto.extractMipmap0 = function (this: ImageAsset) {
            try {
                if (!(this as unknown as { _nativeData?: unknown })._nativeData) {
                    return this;
                }
                return origExtract0.call(this);
            } catch {
                return this;
            }
        };
    }

    const texProto = Texture2D.prototype as unknown as { initialize?: () => void };
    const origInit = texProto.initialize;
    if (typeof origInit === 'function') {
        texProto.initialize = function (this: Texture2D) {
            try {
                origInit.call(this);
            } catch (err) {
                console.warn('[Texture2D] initialize skipped', this.uuid, err);
            }
        };
    }
}

patchWechatTexture();
