import BaseSingleton from '../base/BaseSingleton';
import { ResourceManager } from '../resource/ResourceManager';

export type TableData = Record<string, any>;

export class ConfigManager extends BaseSingleton {
    private _tableMap: Map<string, TableData[]> = new Map();
    private _configMap: Map<string, unknown> = new Map();

    public async init(): Promise<void> {
        this._tableMap.clear();
        this._configMap.clear();
    }

    public destroy(): void {
        this._tableMap.clear();
        this._configMap.clear();
    }

    /** 预加载表格json（数组表，可用 getRowById） */
    public async loadTable(tableName: string, bundle = "table"): Promise<boolean> {
        const jsonAsset = await ResourceManager.getInstance().loadJson(tableName, bundle);
        if (!jsonAsset) return false;
        const data = jsonAsset.json as TableData[];
        this._tableMap.set(tableName, data);
        return true;
    }

    /** 预加载任意结构配置（对象/数组均可） */
    public async loadConfig<T = unknown>(name: string, bundle = "table"): Promise<T | null> {
        const jsonAsset = await ResourceManager.getInstance().loadJson(name, bundle);
        if (!jsonAsset) return null;
        const data = jsonAsset.json as T;
        this._configMap.set(name, data);
        return data;
    }

    public getConfig<T = unknown>(name: string): T | null {
        return (this._configMap.get(name) as T) ?? null;
    }

    /** 获取整张表 */
    public getTable<T = TableData>(tableName: string): T[] | null {
        return (this._tableMap.get(tableName) as T[]) || null;
    }

    /** 根据id查找单行数据 */
    public getRowById<T = TableData>(tableName: string, id: number | string): T | null {
        const table = this.getTable<T>(tableName);
        if (!table) return null;
        return table.find((row: any) => row.id === id) || null;
    }

    /** 清空所有表格缓存 */
    public clearAllTable(): void {
        this._tableMap.clear();
        this._configMap.clear();
    }
}