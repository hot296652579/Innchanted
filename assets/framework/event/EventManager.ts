import BaseSingleton from "../base/BaseSingleton";

type EventCallback = (...args: any[]) => void;

interface EventData {
    callback: EventCallback;
    target: unknown;
}

export class EventManager extends BaseSingleton {
    private _eventMap: Map<string, EventData[]> = new Map();

    public async init(): Promise<void> {
        this._eventMap.clear();
    }

    public destroy(): void {
        this._eventMap.clear();
    }

    /** 注册事件 */
    public on(eventName: string, cb: EventCallback, target: unknown): void {
        if (!this._eventMap.has(eventName)) {
            this._eventMap.set(eventName, []);
        }
        const list = this._eventMap.get(eventName)!;
        // 去重
        const exist = list.find(v => v.callback === cb && v.target === target);
        if (!exist) {
            list.push({ callback: cb, target });
        }
    }

    /** 移除单个监听 */
    public off(eventName: string, cb: EventCallback, target: unknown): void {
        const list = this._eventMap.get(eventName);
        if (!list) return;
        const idx = list.findIndex(v => v.callback === cb && v.target === target);
        if (idx !== -1) list.splice(idx, 1);
        if (list.length === 0) this._eventMap.delete(eventName);
    }

    /** 解绑某个对象所有事件（核心防泄漏接口） */
    public offAllByTarget(target: unknown): void {
        this._eventMap.forEach((list, key) => {
            const newList = list.filter(item => item.target !== target);
            if (newList.length === 0) {
                this._eventMap.delete(key);
            } else {
                this._eventMap.set(key, newList);
            }
        });
    }

    /** 派发事件，支持任意参数 */
    public emit(eventName: string, ...args: any[]): void {
        const list = this._eventMap.get(eventName);
        if (!list) return;
        const copy = [...list];
        copy.forEach(item => item.callback.apply(item.target, args));
    }

    /** 清空全部事件（切换场景调用） */
    public clearAll(): void {
        this._eventMap.clear();
    }
}