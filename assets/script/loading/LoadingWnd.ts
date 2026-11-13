
import { _decorator, director, Label, Prefab, ProgressBar } from "cc";
import { BundlesEnum } from "../../define/BundlesEnum";
import { ConfigManager } from "../../framework/config/ConfigManager";
import { ResourceManager } from "../../framework/resource/ResourceManager";
import { BattleMapRoot } from "../battle/BattleMapRoot";
import { levelPrefabPath } from "../battle/levelPrefab";
import { LoadingCover } from "./LoadingCover";
import BaseWindow from "../../framework/ui/BaseWindow";
import { UILayerRoot, UILayerType } from "../../framework/ui/UILayer";
import { UIManager } from "../../framework/ui/UIManager";
const { ccclass, property } = _decorator;

/** Loading 打开参数 */
export interface LoadingOpenParam {
    /** 需要加载的 bundle 名。game 只会打开分包，不会整目录载入。 */
    bundles?: string[];
    /** 只加载这一关对应的 Level 预设。已在战斗场景时直接换上，不切场景。 */
    levelId?: number;
    /** 从大厅进入战斗时才切场景 */
    nextScene?: string;
    /** 加载完成后打开的窗口 */
    nextWindow?: string;
}

@ccclass
export class LoadingWnd extends BaseWindow {
    windowLayer = UILayerType.MAIN_WIN;
    playOpenTween = false;

    @property(ProgressBar)
    public progressBar: ProgressBar = null!;

    @property(Label)
    public progressLabel: Label = null!;

    private _loading = false;

    protected onOpenRefresh(): void {
        if (this._loading) {
            return;
        }
        void this.runLoad();
    }

    private async runLoad(): Promise<void> {
        this._loading = true;
        this.bringToFront();
        this.setProgress(0);
        await this.nextFrame();

        const param = (this._openParam ?? {}) as LoadingOpenParam;
        const bundles = param.bundles ?? [];
        const loadLevel = param.levelId != null && param.levelId >= 1;
        const bundleWeight = loadLevel ? 0.15 : 1;
        try {
            const ok = await ResourceManager.getInstance().loadBundles(bundles, (p) => {
                this.setProgress(p * bundleWeight);
            });
            if (!ok) {
                console.error("LoadingWnd: 资源分包加载失败", bundles);
            }

            if (loadLevel) {
                await this.loadLevelPrefab(param.levelId!, (p) => {
                    this.setProgress(bundleWeight + (0.9 - bundleWeight) * p);
                });
            }

            await this.finish(param);
        } catch (err) {
            console.error("LoadingWnd: 加载失败", err);
            this.closeNow();
        } finally {
            if (this.isValid) {
                this._loading = false;
            }
        }
    }

    /** 盖住弹窗层。加载界面原来在主界面层，胜利弹窗还在时会被挡住。 */
    private bringToFront(): void {
        const top = UILayerRoot.getRootByLayer(UILayerType.TIPS_GUIDE);
        if (top?.isValid && this.node.parent !== top) {
            this.node.setParent(top);
        }
    }

    private nextFrame(): Promise<void> {
        return new Promise((resolve) => {
            this.scheduleOnce(() => resolve(), 0);
        });
    }

    private closeNow(): void {
        if (!this.isValid) {
            return;
        }
        UIManager.getInstance().discardWindow(this.windowKey || "LoadingWnd");
        this.node.destroy();
    }

    private async loadLevelPrefab(levelId: number, onProgress: (progress: number) => void): Promise<void> {
        const res = ResourceManager.getInstance();
        const tableReady = await res.preloadBundle(BundlesEnum.Table, (p) => onProgress(p * 0.1));
        if (!tableReady) {
            console.error("LoadingWnd: 关卡表分包加载失败");
            return;
        }
        const loaded = await ConfigManager.getInstance().loadTable("levels", BundlesEnum.Table);
        if (!loaded) {
            console.error("LoadingWnd: levels 表加载失败");
            return;
        }
        const path = levelPrefabPath(levelId);
        const prefab = await res.loadWithProgress<Prefab>(path, Prefab, BundlesEnum.Game, (p) => {
            onProgress(0.1 + 0.9 * p);
        });
        if (!prefab) {
            console.error(`LoadingWnd: 关卡预设加载失败 ${BundlesEnum.Game}/${path}`);
        }
    }

    private async finish(param: LoadingOpenParam): Promise<void> {
        if (param.levelId != null && param.levelId >= 1 && !param.nextScene) {
            const map = director.getScene()?.getComponentInChildren(BattleMapRoot) ?? null;
            if (!map) {
                console.error("LoadingWnd: 战斗场景里没有 BattleMapRoot");
            } else {
                await map.loadLevel(param.levelId);
            }
            this.setProgress(1);
            this.closeNow();
            return;
        }
        if (param.nextScene) {
            const root = LoadingCover.mount(this.node);
            const ready = LoadingCover.beginWait();
            director.loadScene(param.nextScene);
            await ready;
            LoadingCover.dismiss(root, this.windowKey || "LoadingWnd");
            return;
        }
        const uiMgr = UIManager.getInstance();
        uiMgr.closeWindow(this.windowKey || "LoadingWnd");
        if (param.nextWindow) {
            await uiMgr.openWindow(param.nextWindow);
        }
    }

    private setProgress(progress: number): void {
        const value = Math.min(1, Math.max(0, progress));
        if (this.progressBar) {
            this.progressBar.progress = value;
        }
        if (this.progressLabel) {
            this.progressLabel.string = `${Math.floor(value * 100)}%`;
        }
    }
}
