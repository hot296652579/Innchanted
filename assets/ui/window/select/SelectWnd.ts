import { _decorator, Button, Label, Node } from "cc";
import { AudioEnum } from "db://assets/define/AudioEnum";
import { BattleContext } from "db://assets/define/BattleContext";
import { BundlesEnum } from "db://assets/define/BundlesEnum";
import { UIConfig } from "db://assets/define/UIEnum";
import AudioPlayer from "db://assets/framework/resource/AudioPlayer";
import { UIManager } from "db://assets/framework/ui/UIManager";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
import { PowerSystem } from "../../../script/power/PowerSystem";
import { UIUtils } from "../../../script/UIUtils";
import { SelectItem, SelectItemState } from "./SelectItem";
const { ccclass, property } = _decorator;

@ccclass
export class SelectWnd extends BaseWindow {
    windowLayer = UILayerType.MAIN_WIN;

    @property(Node)
    bgNode: Node = null!;

    @property(Button)
    backBtn: Button = null!;

    @property(Label)
    lbPower: Label = null!;

    @property(Button)
    dailyTaskBtn: Button = null!;

    selectItems: SelectItem[] = [];

    private _entering = false;
    private _powerTick = 0;
    private _shownPower = -1;

    protected onLoad(): void {
        this.collectItems();
        this.backBtn.node.on(Button.EventType.CLICK, this.onBack, this);
        this.dailyTaskBtn.node.on(Button.EventType.CLICK, this.onDailyTask, this);
    }

    protected onOpenRefresh(): void {
        this._entering = false;
        this._powerTick = 0;
        this.collectItems();
        this.refreshItems();
        this.refreshPower();
    }

    protected update(dt: number): void {
        this._powerTick += dt;
        if (this._powerTick < 1) {
            return;
        }
        this._powerTick = 0;
        this.refreshPower();
    }

    private collectItems(): void {
        const root = this.bgNode ?? this.node;
        this.selectItems = root.getComponentsInChildren(SelectItem);
    }

    private refreshItems(): void {
        const unlocked = BattleContext.getUnlockedLevelId();
        this.selectItems.forEach((item, index) => {
            const levelId = index + 1;
            item.bind(levelId, this.getItemState(levelId, unlocked), id => {
                void this.onSelectLevel(id);
            });
        });
    }

    private getItemState(levelId: number, unlocked: number): SelectItemState {
        if (levelId > unlocked) {
            return "locked";
        }
        if (levelId < unlocked) {
            return "completed";
        }
        return "current";
    }

    private refreshPower(): void {
        const value = PowerSystem.current;
        if (!this.lbPower || value === this._shownPower) {
            return;
        }
        this._shownPower = value;
        this.lbPower.string = `${value}`;
    }

    private async onSelectLevel(levelId: number): Promise<void> {
        if (this._entering || !BattleContext.isLevelUnlocked(levelId)) {
            return;
        }
        if (!PowerSystem.enterLevel()) {
            void UIUtils.showTips("体力不足");
            return;
        }
        this.refreshPower();
        this._entering = true;
        BattleContext.selectedLevelId = levelId;
        void AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        await this.onBattle(levelId);
    }

    private async onBattle(levelId: number): Promise<void> {
        await UIManager.getInstance().closeWindow(UIConfig.SelectWnd.name);
        const uiMgr = UIManager.getInstance();
        uiMgr.registerWindow(
            UIConfig.LoadingWnd.name,
            UIConfig.LoadingWnd.path,
            UIConfig.LoadingWnd.cache,
        );
        await uiMgr.openWindow(UIConfig.LoadingWnd.name, {
            bundles: [BundlesEnum.Table],
            levelId,
            nextScene: "scene/Battle",
        });
    }

    private onDailyTask(): void {
        UIManager.getInstance().openWindow(UIConfig.DailyTaskWnd.name);
    }

    private async onBack(): Promise<void> {
        await UIManager.getInstance().closeWindow(UIConfig.SelectWnd.name);
        await UIManager.getInstance().openWindow(UIConfig.StartWnd.name);
    }

}
