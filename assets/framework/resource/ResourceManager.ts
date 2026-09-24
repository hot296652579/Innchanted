import { Asset, AssetManager, AudioClip, JsonAsset, Prefab, SpriteFrame, assetManager, resources } from 'cc';
import BaseSingleton from '../base/BaseSingleton';

type AssetType = typeof Asset;
interface CacheInfo {
    /**资源*/
    asset: Asset;
    /**所属Bundle(resources也是Bundle)*/
    bundle: AssetManager.Bundle;
    /**资源路径*/
    path: string;
    /**资源类型*/
    type: typeof Asset;
    /**引用计数*/
    refCount: number;
}

export class ResourceManager extends BaseSingleton {
    private _assetCache = new Map<string, CacheInfo>();
    private _bundleMap: Map<string, AssetManager.Bundle> = new Map();
    private _preloadedBundles = new Set<string>();

    public async init(): Promise<void> {
        this._assetCache.clear();
        this._bundleMap.clear();
        this._preloadedBundles.clear();
    }

    public destroy(): void {
        this.releaseAll();
        this._bundleMap.clear();
        this._preloadedBundles.clear();
    }

    //#region 分包加载
    public async loadBundle(bundleName: string): Promise<AssetManager.Bundle | null> {
        return new Promise((resolve) => {
            if (this._bundleMap.has(bundleName)) {
                resolve(this._bundleMap.get(bundleName)!);
                return;
            }
            assetManager.loadBundle(bundleName, (err, bundle) => {
                if (err) {
                    console.error("load bundle fail:", bundleName, err);
                    resolve(null);
                    return;
                }
                this._bundleMap.set(bundleName, bundle);
                resolve(bundle);
            });
        });
    }

    /**
     * 加载 Bundle 并预加载其中资源，onProgress 范围为 0~1。
     * 已预加载过的 Bundle 会立刻回调 1 并返回缓存。
     */
    public async preloadBundle(
        bundleName: string,
        onProgress?: (progress: number) => void
    ): Promise<AssetManager.Bundle | null> {
        const report = (p: number) => onProgress?.(Math.min(1, Math.max(0, p)));

        if (this._preloadedBundles.has(bundleName) && this._bundleMap.has(bundleName)) {
            report(1);
            return this._bundleMap.get(bundleName)!;
        }

        report(0);
        const bundle = await this.loadBundle(bundleName);
        if (!bundle) {
            report(1);
            return null;
        }
        report(0.1);

        return new Promise((resolve) => {
            bundle.preloadDir("", (finished: number, total: number) => {
                if (total <= 0) {
                    report(1);
                    return;
                }
                report(0.1 + 0.9 * (finished / total));
            }, (err) => {
                if (err) {
                    console.error("preload bundle fail:", bundleName, err);
                }
                this._preloadedBundles.add(bundleName);
                report(1);
                resolve(bundle);
            });
        });
    }

    /** 按顺序加载多个 Bundle，总进度 0~1 按 Bundle 数量均分 */
    public async loadBundles(
        bundleNames: string[],
        onProgress?: (progress: number) => void
    ): Promise<boolean> {
        const total = bundleNames.length;
        if (total === 0) {
            onProgress?.(1);
            return true;
        }

        let ok = true;
        for (let i = 0; i < total; i++) {
            const bundle = await this.preloadBundle(bundleNames[i], (inner) => {
                onProgress?.((i + inner) / total);
            });
            if (!bundle) {
                ok = false;
            }
        }
        onProgress?.(1);
        return ok;
    }
    //#endregion

    //#region 通用加载
    public async load<T extends Asset>(
        path: string,
        assetType: typeof Asset,
        bundleName?: string
    ): Promise<T | null> {

        const key = bundleName ? `${bundleName}/${path}` : path;

        // 已缓存
        const cache = this._assetCache.get(key);

        if (cache) {

            cache.refCount++;

            return cache.asset as T;
        }

        // 获取Bundle
        const bundle = bundleName ? await this.loadBundle(bundleName) : resources;

        if (!bundle) return null;

        // 加载
        return new Promise(resolve => {

            bundle.load(path, assetType, (err, asset: T) => {

                if (err) {

                    console.error(err);

                    resolve(null);

                    return;
                }

                this._assetCache.set(key, { asset, bundle, path, type: assetType, refCount: 1, });
                resolve(asset);

            });

        });

    }
    //#endregion

    // 快捷加载常用资源
    public loadPrefab(path: string, bundle?: string): Promise<Prefab | null> {
        return this.load(path, Prefab, bundle);
    }

    public loadSpriteFrame(path: string, bundle?: string): Promise<SpriteFrame | null> {
        return this.load(path, SpriteFrame, bundle);
    }

    public loadAudioClip(path: string, bundle?: string): Promise<AudioClip | null> {
        return this.load(path, AudioClip, bundle);
    }

    public loadJson(path: string, bundle?: string): Promise<JsonAsset | null> {
        return this.load(path, JsonAsset, bundle);
    }

    //#region 资源释放
    public release(path: string, bundleName?: string): void {

        const key = bundleName ? `${bundleName}/${path}` : path;
        const cache = this._assetCache.get(key);

        if (!cache) return;

        cache.refCount--;

        if (cache.refCount > 0) {
            return;
        }

        cache.bundle.release(cache.path, cache.type);

        this._assetCache.delete(key);

    }

    public releaseAll() {
        for (const cache of this._assetCache.values()) {
            cache.bundle.release(cache.path, cache.type);
        }

        this._assetCache.clear();

    }
    //#endregion
}