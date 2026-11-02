import { _decorator, director, Node, sp } from 'cc';
import { AudioEnum } from 'db://assets/define/AudioEnum';
import { BattleContext } from 'db://assets/define/BattleContext';
import { BundlesEnum } from 'db://assets/define/BundlesEnum';
import { UIConfig } from 'db://assets/define/UIEnum';
import AudioPlayer from 'db://assets/framework/resource/AudioPlayer';
import BaseWindow from 'db://assets/framework/ui/BaseWindow';
import { UILayerType } from 'db://assets/framework/ui/UILayer';
import { UIManager } from 'db://assets/framework/ui/UIManager';
import { hasLevel } from '../app/LevelCatalog';
const { ccclass, property } = _decorator;

//动画名
const ANIM_NAME = {
    PASS_START: 'pass_start',
    PASS_LOOP: 'pass_loop'
};

@ccclass('WinWnd')
export class WinWnd extends BaseWindow {

    @property(Node)
    btNext: Node = null!;

    windowLayer = UILayerType.TOP_POPUP;

    private _entering = false;

    protected onLoad(): void {
        AudioPlayer.getInstance().playEffect(BundlesEnum.Game, AudioEnum.MUSIC_REWARD);
        this.btNext.on(Node.EventType.TOUCH_END, this.onBtnNextClick, this);
    }

    private onBtnNextClick(): void {
        void this.goNext();
    }

    private async goNext(): Promise<void> {
        if (this._entering) {
            return;
        }
        this._entering = true;
        const nextId = BattleContext.selectedLevelId + 1;
        if (!hasLevel(nextId)) {
            BattleContext.pendingStartWindow = UIConfig.SelectWnd.name;
            this.closeWindow();
            director.loadScene("scene/Start");
            return;
        }
        BattleContext.selectedLevelId = nextId;
        this.closeWindow();
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
}
