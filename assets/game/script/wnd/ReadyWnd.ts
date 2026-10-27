import { _decorator, tween, Tween, Vec3, view } from "cc";
import BaseWindow from "db://assets/framework/ui/BaseWindow";
import { UILayerType } from "db://assets/framework/ui/UILayer";
import { UIManager } from "db://assets/framework/ui/UIManager";
const { ccclass } = _decorator;

const SLIDE_SEC = 1;
const TOP_INSET = 260;

@ccclass("ReadyWnd")
export class ReadyWnd extends BaseWindow {
    windowLayer = UILayerType.TOP_POPUP;

    protected onOpenRefresh(): void {
        this.playSlide();
    }

    protected playSlide(): void {
        Tween.stopAllByTarget(this.node);
        const size = view.getVisibleSize();
        const z = this.node.position.z;
        const top = size.height * 0.5 - TOP_INSET;
        this.node.setPosition(-size.width * 0.5, top, z);
        tween(this.node)
            .to(SLIDE_SEC, { position: new Vec3(0, top, z) })
            .call(() => this.finishSlide())
            .start();
    }

    private finishSlide(): void {
        if (!this.isValid) {
            return;
        }
        if (this.windowKey) {
            UIManager.getInstance().closeWindow(this.windowKey);
            return;
        }
        this.closeWindow();
    }
}
