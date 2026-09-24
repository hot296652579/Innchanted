import { Node, Prefab, instantiate } from 'cc';
import BaseSingleton from '../base/BaseSingleton';
import { PoolObj } from './PoolObj';

interface PoolCache {
    prefab: Prefab;
    cache: Node[];
    maxCount: number;
}

export class PoolManager extends BaseSingleton {
    private _poolMap: Map<string, PoolCache> = new Map();

    public async init(): Promise<void> {
        this._poolMap.clear();
    }

    public destroy(): void {
        this._poolMap.forEach(pool => {
            pool.cache.forEach(node => node.destroy());
        });
        this._poolMap.clear();
    }

    /** 注册对象池 */
    public registerPool(key: string, prefab: Prefab, max = 50): void {
        if (this._poolMap.has(key)) return;
        this._poolMap.set(key, {
            prefab,
            cache: [],
            maxCount: max
        });
    }

    /** 从池取出对象 */
    public spawn(key: string, ...args: any[]): Node | null {
        const pool = this._poolMap.get(key);
        if (!pool) return null;

        let node: Node | null = null;
        if (pool.cache.length > 0) {
            node = pool.cache.pop()!;
        } else {
            node = instantiate(pool.prefab);
            const comp = node.getComponent(PoolObj) || node.addComponent(PoolObj);
            comp.poolKey = key;
        }

        const poolComp = node.getComponent(PoolObj);
        poolComp?.onSpawn(...args);
        return node;
    }

    /** 回收对象 */
    public despawn(node: Node): void {
        if (!node?.isValid) {
            return;
        }
        const poolComp = node.getComponent(PoolObj);
        if (!poolComp) {
            node.destroy();
            return;
        }
        const key = poolComp.poolKey;
        const pool = this._poolMap.get(key);
        if (!pool) {
            node.destroy();
            return;
        }
        poolComp.onDespawn();
        if (pool.cache.length < pool.maxCount) {
            pool.cache.push(node);
        } else {
            node.destroy();
        }
    }

    /** 清空指定池子缓存 */
    public clearPool(key: string): void {
        const pool = this._poolMap.get(key);
        if (!pool) return;
        pool.cache.forEach(n => n.destroy());
        pool.cache.length = 0;
    }
}