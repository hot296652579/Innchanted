import { _decorator, Node, sp } from 'cc';
import { AudioEnum } from 'db://assets/define/AudioEnum';
import { BundlesEnum } from 'db://assets/define/BundlesEnum';
import AudioPlayer from 'db://assets/framework/resource/AudioPlayer';
import BaseWindow from 'db://assets/framework/ui/BaseWindow';
import { UILayerType } from 'db://assets/framework/ui/UILayer';
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

    protected onLoad(): void {
        AudioPlayer.getInstance().playEffect(BundlesEnum.Game, AudioEnum.MUSIC_REWARD);
        this.btNext.on(Node.EventType.TOUCH_END, this.onBtnNextClick, this);
    }

    private onBtnNextClick(): void {
        this.closeWindow();
    }
}
