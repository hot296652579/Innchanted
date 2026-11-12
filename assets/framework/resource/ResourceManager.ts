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
     * 这些分包只打开配置，不 loadDir。
     * game 里有 10 张关卡、全部客人和约 87MB 音频；整目录载入会把网格、贴图和解码后的音频同时留在内存里，微信小游戏会报内存不足。
     * 关卡预设、界面、音效都按用到的路径单独 load。
     */
    private static readonly OPEN_ONLY_BUNDLES = new Set<string>(['game']);

    /**
     * 加载 Bundle 并加载其中资源，onProgress 范围为 0~1。
     * 已加载过的 Bundle 会立刻回调 1 并返回缓存。
     * game 只打开分包，不预载目录。
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
        if (ResourceManager.OPEN_ONLY_BUNDLES.has(bundleName)) {
            this._preloadedBundles.add(bundleName);
            report(1);
            return bundle;
        }

        report(0.1);
        const ok = await this.loadBundleDir(bundle, '', (p) => report(0.1 + 0.9 * p));
        if (!ok) {
            console.error('preload bundle fail:', bundleName);
        }
        this._preloadedBundles.add(bundleName);
        report(1);
        return bundle;
    }

    private loadBundleDir(
        bundle: AssetManager.Bundle,
        dir: string,
        onProgress: (progress: number) => void
    ): Promise<boolean> {
        return new Promise((resolve) => {
            bundle.loadDir(dir, (finished: number, total: number) => {
                onProgress(total > 0 ? finished / total : 1);
            }, (err) => {
                if (err) {
                    console.error(`load dir fail: ${bundle.name}/${dir || '(root)'}`, err);
                    resolve(false);
                    return;
                }
                onProgress(1);
                resolve(true);
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

    /** 带进度的加载。已在缓存里则直接返回。进度按依赖资源个数计算。 */
    public loadWithProgress<T extends Asset>(
        path: string,
        assetType: AssetType,
        bundleName?: string,
        onProgress?: (progress: number) => void,
    ): Promise<T | null> {
        const report = (p: number) => onProgress?.(Math.min(1, Math.max(0, p)));
        const key = bundleName ? `${bundleName}/${path}` : path;
        const cached = this._assetCache.get(key);
        if (cached) {
            cached.refCount++;
            report(1);
            return Promise.resolve(cached.asset as T);
        }

        return (async () => {
            const bundle = bundleName ? await this.loadBundle(bundleName) : resources;
            if (!bundle) {
                report(1);
                return null;
            }
            return new Promise<T | null>((resolve) => {
                bundle.load(path, assetType, (finished: number, total: number) => {
                    report(total > 0 ? finished / total : 0);
                }, (err, asset: T) => {
                    if (err || !asset) {
                        console.error(err);
                        report(1);
                        resolve(null);
                        return;
                    }
                    this._assetCache.set(key, {
                        asset,
                        bundle,
                        path,
                        type: assetType,
                        refCount: 1,
                    });
                    report(1);
                    resolve(asset);
                });
            });
        })();
    }

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
    /** 释放这条资源及其不再被引用的依赖，不管管理器里记了几次引用。 */
    public releaseAsset(path: string, bundleName?: string): void {
        const key = bundleName ? `${bundleName}/${path}` : path;
        const cache = this._assetCache.get(key);
        if (!cache) {
            return;
        }
        cache.bundle.release(cache.path, cache.type);
        this._assetCache.delete(key);
    }

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