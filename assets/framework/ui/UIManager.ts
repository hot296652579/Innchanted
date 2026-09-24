import { instantiate } from "cc";
import BaseSingleton from "../base/BaseSingleton";
import { ResourceManager } from "../resource/ResourceManager";
import BaseWindow, { WindowOpenParam } from "./BaseWindow";
import { UILayerRoot, UILayerType } from "./UILayer";

/** 窗口配置注册结构 */
interface WindowCfg {
    prefabPath: string;
    bundle?: string;
    cache: boolean;
}

export class UIManager extends BaseSingleton {
    /** 窗口注册表：key -> 资源路径+缓存配置 */
    private _windowRegister: Map<string, WindowCfg> = new Map();
    /** 已实例化窗口缓存 key -> window脚本（仅 cache=true） */
    private _windowCache: Map<string, BaseWindow> = new Map();
    /** 当前已打开的窗口（含不缓存的） */
    private _openedWindows: Map<string, BaseWindow> = new Map();
    /** 当前栈顶弹窗 */
    private _popupStack: string[] = [];

    public async init(): Promise<void> {
        this._windowRegister.clear();
        this._windowCache.clear();
        this._openedWindows.clear();
        this._popupStack = [];
    }

    public destroy(): void {
        this._openedWindows.forEach(win => win.node.destroy());
        this._windowCache.forEach(win => {
            if (win.node?.isValid) {
                win.node.destroy();
            }
        });
        this._openedWindows.clear();
        this._windowCache.clear();
        this._windowRegister.clear();
        this._popupStack = [];
    }

    //#region 注册窗口（初始化统一注册所有UI）
    /** 注册窗口，必须先注册才能openWindow */
    public registerWindow(key: string, prefabPath: string, cache = false, bundle?: string): void {
        this._windowRegister.set(key, {
            prefabPath,
            bundle,
            cache
        });
    }
    //#endregion

    //#region 打开窗口核心接口
    public async openWindow(key: string, param: WindowOpenParam = null): Promise<BaseWindow | null> {
        this.pruneInvalidWindows();
        console.log(`UIManager: 打开窗口key = ${key}`);
        const cfg = this._windowRegister.get(key);
        if (!cfg) {
            console.error(`UIManager: 未注册窗口key = ${key}`);
            return null;
        }

        // 缓存存在直接复用
        if (this._windowCache.has(key)) {
            const win = this._windowCache.get(key)!;
            this._openedWindows.set(key, win);
            win.onOpen(param);
            this.pushPopupStack(key, win.windowLayer);
            return win;
        }

        // 加载prefab
        const prefab = await ResourceManager.getInstance().loadPrefab(cfg.prefabPath, cfg.bundle);
        if (!prefab) {
            console.error(`UIManager: 加载窗口prefab失败 ${cfg.prefabPath}`);
            return null;
        }

        // 实例化窗口节点
        const node = instantiate(prefab);
        const win = node.getComponent(BaseWindow);
        if (!win) {
            console.error(`UIManager: Prefab未挂载BaseWindow脚本 ${key}`);
            node.destroy();
            return null;
        }

        // 设置窗口基础信息
        win.windowKey = key;
        win.isCache = cfg.cache;
        const parent = UILayerRoot.getRootByLayer(win.windowLayer);
        if (!parent?.isValid) {
            console.error("UIManager: UI分层根节点未初始化");
            node.destroy();
            return null;
        }
        node.setParent(parent);
        node.setPosition(0, 0, 0);

        this._openedWindows.set(key, win);
        if (cfg.cache) {
            this._windowCache.set(key, win);
        }

        // 打开窗口
        win.onOpen(param);
        node.active = true;
        this.pushPopupStack(key, win.windowLayer);
        return win;
    }
    //#endregion

    /** 根据key获取窗口实例 */
    public getWindow<T extends BaseWindow>(key: string): T | null {
        return this._windowCache.get(key) as T;
    }

    //#region 关闭窗口
    /** 根据key关闭窗口 */
    public closeWindow(key: string): void {
        const win = this._openedWindows.get(key) ?? this._windowCache.get(key);
        if (!win) return;
        win.closeWindow();
        this.popPopupStack(key);
        this._openedWindows.delete(key);
    }

    /** 关闭栈顶弹窗（只关闭POPUP/TOP_POPUP层级） */
    public closeTopPopup(): void {
        if (this._popupStack.length === 0) return;
        const topKey = this._popupStack[this._popupStack.length - 1];
        this.closeWindow(topKey);
    }

    /** 清空所有弹窗栈 */
    public clearAllPopup(): void {
        [...this._popupStack].forEach(key => this.closeWindow(key));
        this._popupStack = [];
    }
    //#endregion

    /** 切场景后清掉已销毁的窗口引用 */
    private pruneInvalidWindows(): void {
        for (const [key, win] of this._windowCache) {
            if (!win.node?.isValid) {
                this._windowCache.delete(key);
            }
        }
        for (const [key, win] of this._openedWindows) {
            if (!win.node?.isValid) {
                this._openedWindows.delete(key);
            }
        }
    }
    private pushPopupStack(key: string, layer: UILayerType): void {
        if (layer >= UILayerType.POPUP_WIN) {
            this._popupStack.push(key);
        }
    }

    private popPopupStack(key: string): void {
        const idx = this._popupStack.findIndex(k => k === key);
        if (idx !== -1) {
            this._popupStack.splice(idx, 1);
        }
    }
}
