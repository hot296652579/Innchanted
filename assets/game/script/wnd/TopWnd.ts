import { _decorator, director, Label, Node } from "cc";
import { BattleContext } from "db://assets/define/BattleContext";
import { UIConfig } from "db://assets/define/UIEnum";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
const { ccclass, property } = _decorator;

@ccclass("TopWnd")
export class TopWnd extends BaseWindow {

    @property(Node)
    lbTimeCount: Node = null!;

    @property(Node)
    lbLevelGold: Node = null!;

    @property(Node)
    btnBack: Node = null!;

    windowLayer = UILayerType.SCENE_UI;

    private _time: Label | null = null;
    private _gold: Label | null = null;

    protected onLoad(): void {
        this._time = this.lbTimeCount?.getComponent(Label) ?? null;
        this._gold = this.lbLevelGold?.getComponent(Label) ?? null;
        const bus = EventManager.getInstance();
        bus.on(GameEvent.LEVEL_TIME_CHANGED, this.onTime, this);
        bus.on(GameEvent.LEVEL_GOLD_CHANGED, this.onGold, this);

        this.btnBack?.on(Node.EventType.TOUCH_END, this.onBack, this);
    }

    protected onOpenRefresh(): void {
        this.onGold(0);
    }

    public onDestroy(): void {
        const bus = EventManager.getInstance();
        bus.off(GameEvent.LEVEL_TIME_CHANGED, this.onTime, this);
        bus.off(GameEvent.LEVEL_GOLD_CHANGED, this.onGold, this);
        super.onDestroy();
    }

    private onTime(remain: number): void {
        if (this._time) {
            this._time.string = `${Math.max(0, remain)}S`;
        }
    }

    private onGold(gold: number): void {
        if (this._gold) {
            this._gold.string = `x${Math.max(0, gold)}`;
        }
    }

    private onBack(): void {
        BattleContext.pendingStartWindow = UIConfig.SelectWnd.name;
        director.loadScene("scene/Start");
    }
}
