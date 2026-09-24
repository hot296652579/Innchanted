
import { _decorator, Button, director, EventTouch, Label, Node, tween, Tween, UITransform, Vec3, Widget } from "cc";
import { AudioEnum } from "db://assets/define/AudioEnum";
import { BundlesEnum } from "db://assets/define/BundlesEnum";
import AudioPlayer from "db://assets/framework/resource/AudioPlayer";
import { UIManager } from "db://assets/framework/ui/UIManager";
import { BattleContext, BattleState } from "../../../define/BattleContext";
import { UIConfig } from "../../../define/UIEnum";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
const { ccclass, property } = _decorator;

const INIT_ANIM_DURATION = 0.4;

@ccclass
export class BattleWnd extends BaseWindow {

    @property(Node)
    private topNode: Node = null!;

    @property(Node)
    private bottomNode: Node = null!;

    @property(Label)
    private lbRemain: Label = null!; //剩余挖掘次数

    @property(Label)
    private lbLevel: Label = null!;

    @property(Button)
    private btnRefresh: Button = null!;
    @property(Label)
    private lbRefreshCount: Label = null!;
    @property(Node)
    private refreshAdBtn: Node = null!; //刷新按钮+号

    @property(Button)
    private btBack: Button = null!;
    @property(Button)
    private btSet: Button = null!;
    @property(Button)
    private btRevoke: Button = null!; //撤销
    @property(Label)
    private lbRevokeCount: Label = null!;
    @property(Node)
    private revokeAdBtn: Node = null!; //撤销按钮+号

    windowLayer = UILayerType.MAIN_WIN;

    private readonly _topRestPos = new Vec3();
    private readonly _bottomRestPos = new Vec3();
    private _restPosReady = false;

    protected onLoad(): void {
        this.btnRefresh.node.on(Button.EventType.CLICK, this.onBtnRefreshClick, this);
        this.btRevoke.node.on(Button.EventType.CLICK, this.onBtnRevokeClick, this);
        this.btBack.node.on(Button.EventType.CLICK, this.onBtnBackClick, this);
        this.btSet.node.on(Button.EventType.CLICK, this.onBtnSetClick, this);
        this.refreshAdBtn?.on(Node.EventType.TOUCH_END, this.onRefreshAdClick, this);
        this.revokeAdBtn?.on(Node.EventType.TOUCH_END, this.onRevokeAdClick, this);
        EventManager.getInstance().on(GameEvent.BATTLE_STATE_CHANGE, this.onBattleStateChange, this);
    }

    protected onOpenRefresh(): void {
        this.playInitAnim();
    }

    /** 上栏从窗口上方外滑入，下栏从窗口下方外滑入 */
    private playInitAnim(): void {
        this.captureRestPos();
        this.slideIn(this.topNode, this._topRestPos, true);
        this.slideIn(this.bottomNode, this._bottomRestPos, false);
    }

    private captureRestPos(): void {
        if (this._restPosReady) {
            return;
        }
        this.syncWidget(this.topNode);
        this.syncWidget(this.bottomNode);
        this.topNode?.getPosition(this._topRestPos);
        this.bottomNode?.getPosition(this._bottomRestPos);
        this._restPosReady = true;
    }

    private slideIn(node: Node | null, restPos: Vec3, fromTop: boolean): void {
        if (!node?.isValid) {
            return;
        }
        const widget = node.getComponent(Widget);
        if (widget) {
            widget.enabled = false;
        }
        Tween.stopAllByTarget(node);
        node.setPosition(this.getOutsideLocalPos(restPos, fromTop));
        tween(node)
            .to(INIT_ANIM_DURATION, { position: restPos.clone() }, { easing: "cubicOut" })
            .call(() => {
                if (widget?.isValid) {
                    widget.enabled = true;
                    widget.updateAlignment();
                }
            })
            .start();
    }

    private getOutsideLocalPos(restPos: Vec3, fromTop: boolean): Vec3 {
        const winH = this.node.getComponent(UITransform)?.height ?? 1334;
        const start = restPos.clone();
        start.y += fromTop ? winH : -winH;
        return start;
    }

    private syncWidget(node: Node | null): void {
        node?.parent?.getComponent(Widget)?.updateAlignment();
        node?.getComponent(Widget)?.updateAlignment();
    }

    private onBattleStateChange(state: BattleState): void {
        this.applyState(state);
    }

    private applyState(state: BattleState): void {
        if (this.lbRemain) {
            this.lbRemain.string = `${state.shovels}`;
        }
        if (this.lbLevel) {
            this.lbLevel.string = `第${state.levelId}关`;
        }
        this.applyCount(this.lbRefreshCount, this.refreshAdBtn, state.refreshCount);
        this.applyCount(this.lbRevokeCount, this.revokeAdBtn, state.revokeCount);
    }

    private applyCount(label: Label | null, plusNode: Node | null, count: number): void {
        if (label) {
            label.string = `${count}`;
            label.node.parent.active = count > 0;
        }
        if (plusNode) {
            plusNode.active = count <= 0;
        }
    }

    private async onBtnRefreshClick(): Promise<void> {
        await AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        EventManager.getInstance().emit(GameEvent.BATTLE_REFRESH_CLICK);
    }

    private async onBtnRevokeClick(): Promise<void> {
        await AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        EventManager.getInstance().emit(GameEvent.BATTLE_UNDO_CLICK);
    }

    private async onRefreshAdClick(evt: EventTouch): Promise<void> {
        await AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        evt.propagationStopped = true;
        EventManager.getInstance().emit(GameEvent.BATTLE_REFRESH_CLICK);
    }

    private async onRevokeAdClick(evt: EventTouch): Promise<void> {
        await AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        evt.propagationStopped = true;
        EventManager.getInstance().emit(GameEvent.BATTLE_UNDO_CLICK);
    }

    private async onBtnBackClick(): Promise<void> {
        await AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        BattleContext.pendingStartWindow = UIConfig.SelectWnd.name;
        director.loadScene("scene/Start");
    }

    private async onBtnSetClick(): Promise<void> {
        await AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        UIManager.getInstance().openWindow(UIConfig.SettingWnd.name);
    }

}
