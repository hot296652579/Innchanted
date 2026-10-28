import { _decorator, Component, tween, Tween, Vec3 } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
const { ccclass, property } = _decorator;

const OPEN_SEC = 1;

@ccclass("Door")
export class Door extends Component {
    @property
    openAngle = 90;

    private readonly _closed = new Vec3();
    private _opened = false;

    onEnable(): void {
        this._closed.set(this.node.eulerAngles);
        EventManager.getInstance().on(GameEvent.SHIFT_READY, this.open, this);
    }

    onDisable(): void {
        EventManager.getInstance().off(GameEvent.SHIFT_READY, this.open, this);
        Tween.stopAllByTarget(this.node);
    }

    open(): void {
        if (this._opened) {
            return;
        }
        this._opened = true;
        Tween.stopAllByTarget(this.node);
        const to = new Vec3(this._closed.x, this._closed.y + this.openAngle, this._closed.z);
        tween(this.node)
            .to(OPEN_SEC, { eulerAngles: to }, { easing: "quadOut" })
            .start();
    }

    close(): void {
        if (!this._opened) {
            return;
        }
        this._opened = false;
        Tween.stopAllByTarget(this.node);
        tween(this.node)
            .to(OPEN_SEC, { eulerAngles: this._closed.clone() }, { easing: "quadIn" })
            .start();
    }
}
