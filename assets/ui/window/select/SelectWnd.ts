import { _decorator, Button, Node } from "cc";
import { AudioEnum } from "db://assets/define/AudioEnum";
import { BattleContext } from "db://assets/define/BattleContext";
import { BundlesEnum } from "db://assets/define/BundlesEnum";
import { UIConfig } from "db://assets/define/UIEnum";
import AudioPlayer from "db://assets/framework/resource/AudioPlayer";
import { UIManager } from "db://assets/framework/ui/UIManager";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
import { SelectItem, SelectItemState } from "./SelectItem";
const { ccclass, property } = _decorator;

@ccclass
export class SelectWnd extends BaseWindow {
    windowLayer = UILayerType.MAIN_WIN;

    @property(Node)
    bgNode: Node = null!;

    @property(Button)
    backBtn: Button = null!;

    selectItems: SelectItem[] = [];

    private _entering = false;

    protected onLoad(): void {
        this.collectItems();
        this.backBtn.node.on(Button.EventType.CLICK, this.onBack, this);
    }

    protected onOpenRefresh(): void {
        this._entering = false;
        this.collectItems();
        this.refreshItems();
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

    private async onSelectLevel(levelId: number): Promise<void> {
        if (this._entering || !BattleContext.isLevelUnlocked(levelId)) {
            return;
        }
        this._entering = true;
        BattleContext.selectedLevelId = levelId;
        void AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        await this.onBattle();
    }

    private async onBattle(): Promise<void> {
        await UIManager.getInstance().closeWindow(UIConfig.SelectWnd.name);
        const uiMgr = UIManager.getInstance();
        uiMgr.registerWindow(
            UIConfig.LoadingWnd.name,
            UIConfig.LoadingWnd.path,
            UIConfig.LoadingWnd.cache,
        );
        await uiMgr.openWindow(UIConfig.LoadingWnd.name, {
            bundles: [BundlesEnum.Game, BundlesEnum.Table],
            nextScene: "scene/Battle",
        });
    }

    private async onBack(): Promise<void> {
        await UIManager.getInstance().closeWindow(UIConfig.SelectWnd.name);
        await UIManager.getInstance().openWindow(UIConfig.StartWnd.name);
    }

}
