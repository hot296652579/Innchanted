import { ImageAsset, Texture2D, macro } from 'cc';

let patched = false;

/**
 * 微信小游戏贴图 16352 补丁（Error: mipmapLevelDataSize of null）。
 *
 * 原因：
 * KayKit 很多 FBX 不带独立贴图，材质里的 @7d6ab 都指向同一张 atlas（如 forest_texture.png）。
 * 引擎侧是「多个 Texture2D → 同一个 ImageAsset」。
 * 微信默认 CLEANUP_IMAGE_CACHE = true：第一张 Texture2D 上传 GPU 后会把 Image 像素清掉，
 * 后面的模型再 initialize / extractMipmaps 时 _nativeData 已是 null，于是报 16352。
 *
 * 本脚本只改运行时行为，不改 PNG 压缩。压缩要在贴图 .meta 里关。
 */
export function patchWechatTexture(): void {
    if (patched) {
        return;
    }
    patched = true;

    // 真正解决问题的开关：不要在首张图上传后清掉共用 Image 缓存。
    macro.CLEANUP_IMAGE_CACHE = false;

    const imageProto = ImageAsset.prototype as unknown as Record<string, unknown>;

    // 引擎 getter：return this._nativeData.mipmapLevelDataSize
    // _nativeData 为 null 时这里会直接抛，先判空。
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

    // Texture2D.mipmaps setter 会调 extractMipmaps 拆 mip。
    // 像素已被清掉时返回自身，避免再去读 null。
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

    // 兜底：initialize 仍抛 16352 时跳过这张 Texture2D，不阻断关卡加载。
    // 只防崩溃，贴图空了模型还是可能没颜色。
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
