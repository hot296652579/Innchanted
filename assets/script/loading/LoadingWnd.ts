
import { _decorator, director, Label, ProgressBar } from "cc";
import { ResourceManager } from "../../framework/resource/ResourceManager";
import BaseWindow from "../../framework/ui/BaseWindow";
import { UILayerType } from "../../framework/ui/UILayer";
import { UIManager } from "../../framework/ui/UIManager";
const { ccclass, property } = _decorator;

/** Loading 打开参数 */
export interface LoadingOpenParam {
    /** 需要加载的 bundle 名 */
    bundles?: string[];
    /** 加载完成后切场景 */
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
        this.setProgress(0);

        const param = (this._openParam ?? {}) as LoadingOpenParam;
        const bundles = param.bundles ?? [];
        const ok = await ResourceManager.getInstance().loadBundles(bundles, (p) => {
            this.setProgress(p);
        });
        if (!ok) {
            console.error("LoadingWnd: 资源分包加载失败", bundles);
        }

        this.setProgress(1);
        await this.finish(param);
        this._loading = false;
    }

    private async finish(param: LoadingOpenParam): Promise<void> {
        if (param.nextScene) {
            director.loadScene(param.nextScene);
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
