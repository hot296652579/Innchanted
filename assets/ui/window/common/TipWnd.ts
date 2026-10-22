import { _decorator, Label, tween, Tween, UIOpacity, Vec3 } from "cc";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
const { ccclass, property } = _decorator;

export type TipWindowParam = {
    msg: string;
};

const FLY_Y = 120;
const DURATION = 2;

@ccclass
export class TipWnd extends BaseWindow {
    windowLayer = UILayerType.TIPS_GUIDE;

    @property(Label)
    private msgLabel: Label = null!;

    protected onOpenRefresh(): void {
        const param = this._openParam as TipWindowParam | null;
        this.msgLabel.string = param?.msg ?? "";
        this.playFlyFade();
    }

    private playFlyFade(): void {
        Tween.stopAllByTarget(this.node);
        const opacity = this.node.getComponent(UIOpacity) ?? this.node.addComponent(UIOpacity);
        Tween.stopAllByTarget(opacity);
        opacity.opacity = 255;

        const start = this.node.position.clone();
        const end = new Vec3(start.x, start.y + FLY_Y, start.z);
        tween(this.node)
            .to(DURATION, { position: end })
            .start();
        tween(opacity)
            .to(DURATION, { opacity: 0 })
            .call(() => this.finishTip())
            .start();
    }

    private finishTip(): void {
        if (!this.isValid) {
            return;
        }
        this.node.destroy();
    }
}
