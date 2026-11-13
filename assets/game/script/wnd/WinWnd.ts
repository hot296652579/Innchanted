import { _decorator, director, Label, Node } from 'cc';
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

    @property(Label)
    lbUsedTime: Label = null!;

    windowLayer = UILayerType.TOP_POPUP;

    private _entering = false;

    protected onLoad(): void {
        AudioPlayer.getInstance().playEffect(BundlesEnum.Game, AudioEnum.MUSIC_REWARD);
        this.btNext.on(Node.EventType.TOUCH_END, this.onBtnNextClick, this);
    }

    protected onOpenRefresh(): void {
        const stars = Math.max(1, Math.min(3, Math.floor(Number(this._openParam?.stars) || 1)));
        const usedTime = Math.max(0, Math.floor(Number(this._openParam?.usedTime) || 0));
        if (this.lbUsedTime) {
            this.lbUsedTime.string = `用时:${usedTime}S`;
        }
        for (let i = 0; i < 3; i++) {
            const star = this.findNamed(this.node, `Star${i}`);
            if (star) {
                star.active = i < stars;
            }
        }
    }

    private findNamed(node: Node, name: string): Node | null {
        if (node.name === name) {
            return node;
        }
        for (let i = 0; i < node.children.length; i++) {
            const found = this.findNamed(node.children[i], name);
            if (found) {
                return found;
            }
        }
        return null;
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
        const uiMgr = UIManager.getInstance();
        const node = this.hideNow(uiMgr);
        uiMgr.registerWindow(
            UIConfig.LoadingWnd.name,
            UIConfig.LoadingWnd.path,
            UIConfig.LoadingWnd.cache,
        );
        await uiMgr.openWindow(UIConfig.LoadingWnd.name, {
            bundles: [BundlesEnum.Table],
            levelId: nextId,
        });
        if (node?.isValid && !this.isCache) {
            node.destroy();
        }
    }

    /** 胜利界面在弹窗层，关闭动画结束前会一直盖住加载界面。 */
    private hideNow(uiMgr: UIManager): Node | null {
        uiMgr.discardWindow(this.windowKey || UIConfig.WinWnd.name);
        if (!this.node?.isValid) {
            return null;
        }
        this.node.active = false;
        return this.node;
    }
}
