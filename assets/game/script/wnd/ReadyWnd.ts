import { _decorator, tween, Tween, Vec3, view } from "cc";
import BaseWindow from "db://assets/framework/ui/BaseWindow";
import { UILayerType } from "db://assets/framework/ui/UILayer";
import { UIManager } from "db://assets/framework/ui/UIManager";
const { ccclass } = _decorator;

const POP_SEC = 0.25;
const SHOW_SEC = 1;
const TOP_INSET = 200;

@ccclass("ReadyWnd")
export class ReadyWnd extends BaseWindow {
    windowLayer = UILayerType.TOP_POPUP;

    protected onOpenRefresh(): void {
        this.playPop();
    }

    protected playPop(): void {
        Tween.stopAllByTarget(this.node);
        const size = view.getVisibleSize();
        const z = this.node.position.z;
        this.node.setPosition(0, size.height * 0.5 - TOP_INSET, z);
        this.node.setScale(0, 0, 1);
        tween(this.node)
            .to(POP_SEC, { scale: new Vec3(1, 1, 1) }, { easing: "backOut" })
            .delay(SHOW_SEC)
            .call(() => this.finishShow())
            .start();
    }

    private finishShow(): void {
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
