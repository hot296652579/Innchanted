import { sys } from "cc";

/** 
 * 本地储存
 */
export default class Storage {
    private _data: Record<string, any> = {};

    constructor() {
        // 启动时从本地加载全部数据
        this.load();
    }

    // 从本地加载数据
    private load() {
        const data = sys.localStorage.getItem('game_data');
        if (data) {
            try {
                this._data = JSON.parse(data);
            } catch (e) {
                this._data = {};
            }
        }
    }

    // 保存到本地
    private save() {
        sys.localStorage.setItem('game_data', JSON.stringify(this._data));
    }

    /**
     * 存储
     * @param key 
     * @param value 
     */
    public setItem(key: string, value: any): void {
        this._data[key] = value;
        this.save();
    }

    /**
     * 获取
     * @param key 
     * @param defaultValue 默认值（没有数据时返回）
     * @returns 
     */
    public getItem(key: string, defaultValue: any = null): any {
        return this._data[key] ?? defaultValue;
    }

    /**
     * 删除
     * @param key 
     */
    public removeItem(key: string): void {
        delete this._data[key];
        this.save();
    }

    /**
     * 清空
     */
    public clearStorage(): void {
        this._data = {};
        this.save();
    }
}

export const storage = new Storage();