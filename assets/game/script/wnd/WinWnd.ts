import { _decorator, director, Label, Node, tween, Tween, Vec3 } from 'cc';
import { AudioEnum } from 'db://assets/define/AudioEnum';
import { BattleContext } from 'db://assets/define/BattleContext';
import { BundlesEnum } from 'db://assets/define/BundlesEnum';
import { UIConfig } from 'db://assets/define/UIEnum';
import AudioPlayer from 'db://assets/framework/resource/AudioPlayer';
import BaseWindow from 'db://assets/framework/ui/BaseWindow';
import { UILayerType } from 'db://assets/framework/ui/UILayer';
import { UIManager } from 'db://assets/framework/ui/UIManager';
import { findLevel, hasLevel, threeStarSeconds } from '../app/LevelCatalog';
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
    lbBestCostTime: Label = null!;

    @property(Label)
    lbUsedTime: Label = null!;

    @property(Label)
    lbScore: Label = null!;

    windowLayer = UILayerType.TOP_POPUP;

    private _entering = false;

    protected onLoad(): void {
        AudioPlayer.getInstance().playEffect(BundlesEnum.Game, AudioEnum.MUSIC_REWARD);
        this.btNext.on(Node.EventType.TOUCH_END, this.onBtnNextClick, this);
    }

    protected onOpenRefresh(): void {
        const stars = Math.max(1, Math.min(3, Math.floor(Number(this._openParam?.stars) || 1)));
        const usedTime = Math.max(0, Math.floor(Number(this._openParam?.usedTime) || 0));
        const score = Math.max(0, Math.round(Number(this._openParam?.score) || 0));
        const best = threeStarSeconds(findLevel(BattleContext.selectedLevelId));
        if (this.lbBestCostTime) {
            this.lbBestCostTime.string = this.clock(best);
        }
        if (this.lbUsedTime) {
            this.lbUsedTime.string = `你的时间:${this.clock(usedTime)}`;
        }
        if (this.lbScore) {
            this.lbScore.string = `总计:${score}分`;
        }
        this.lightStars(stars);
    }

    /** 秒数写成 00:00。 */
    private clock(total: number): string {
        const sec = Math.max(0, Math.floor(total));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        const mm = m < 10 ? `0${m}` : `${m}`;
        const ss = s < 10 ? `0${s}` : `${s}`;
        return `${mm}:${ss}`;
    }

    /** 达到的星才亮子节点，从左到右一颗颗出现。 */
    private lightStars(count: number): void {
        this.unscheduleAllCallbacks();
        for (let i = 0; i < 3; i++) {
            const star = this.findNamed(this.node, `Star${i}`);
            if (!star) {
                continue;
            }
            const marks = star.children;
            for (let c = 0; c < marks.length; c++) {
                Tween.stopAllByTarget(marks[c]);
                marks[c].active = false;
            }
            if (i >= count) {
                continue;
            }
            this.scheduleOnce(() => {
                if (!star.isValid) {
                    return;
                }
                for (let c = 0; c < star.children.length; c++) {
                    const mark = star.children[c];
                    mark.active = true;
                    mark.setScale(0, 0, 1);
                    tween(mark).to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: "backOut" }).start();
                }
            }, i * 0.28);
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
        this.unscheduleAllCallbacks();
        if (!this.node?.isValid) {
            return null;
        }
        this.node.active = false;
        return this.node;
    }
}
