import { _decorator, Component, Node, tween, Tween, Vec3 } from "cc";
import { AudioEnum } from "db://assets/define/AudioEnum";
import { BundlesEnum } from "db://assets/define/BundlesEnum";
import AudioPlayer from "db://assets/framework/resource/AudioPlayer";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
const { ccclass, property } = _decorator;

const OPEN_SEC = 1;
const LEAF_NAME = "door_A";

@ccclass("Door")
export class Door extends Component {
    @property
    openAngle = 90;

    private readonly _closed = new Vec3();
    private _leaf: Node | null = null;
    private _opened = false;

    onEnable(): void {
        this._leaf = this.node.getChildByName(LEAF_NAME);
        if (this._leaf) {
            this._closed.set(this._leaf.eulerAngles);
        }
        EventManager.getInstance().on(GameEvent.SHIFT_READY, this.open, this);
    }

    onDisable(): void {
        EventManager.getInstance().off(GameEvent.SHIFT_READY, this.open, this);
        if (this._leaf) {
            Tween.stopAllByTarget(this._leaf);
        }
    }

    open(): void {
        if (this._opened || !this._leaf) {
            return;
        }
        this._opened = true;
        Tween.stopAllByTarget(this._leaf);
        const to = new Vec3(this._closed.x, this._closed.y + this.openAngle, this._closed.z);
        tween(this._leaf)
            .to(OPEN_SEC, { eulerAngles: to }, { easing: "quadOut" })
            .start();
        AudioPlayer.getInstance().playEffect(BundlesEnum.Game, AudioEnum.OPEN_DOOR);
    }

    close(): void {
        if (!this._opened || !this._leaf) {
            return;
        }
        this._opened = false;
        Tween.stopAllByTarget(this._leaf);
        tween(this._leaf)
            .to(OPEN_SEC, { eulerAngles: this._closed.clone() }, { easing: "quadIn" })
            .start();
    }
}
