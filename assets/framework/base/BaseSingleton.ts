/**
 * 全局单例管理器基类。
 * 必须用构造函数当 key：微信小游戏压缩后 class.name 会重名
 */
export default abstract class BaseSingleton {
    private static _instance = new Map<Function, BaseSingleton>();

    constructor() { }

    public static getInstance<T extends BaseSingleton>(this: new (...args: any[]) => T): T {
        const ctor = this as Function;
        let ins = BaseSingleton._instance.get(ctor);
        if (!ins) {
            ins = new (this as new () => T)();
            BaseSingleton._instance.set(ctor, ins);
        }
        return ins as T;
    }

    /** 框架初始化，main.ts 统一调用 */
    public abstract init(...args: any[]): Promise<void>;

    /** 游戏销毁/切场景释放资源 */
    public abstract destroy(): void;

    /** 销毁所有单例（游戏退出调用） */
    public static destroyAll(): void {
        BaseSingleton._instance.forEach(ins => ins.destroy());
        BaseSingleton._instance.clear();
    }
}
