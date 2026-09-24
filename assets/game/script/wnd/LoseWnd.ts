import { _decorator, Node } from 'cc';
import { AudioEnum } from 'db://assets/define/AudioEnum';
import { BundlesEnum } from 'db://assets/define/BundlesEnum';
import AudioPlayer from 'db://assets/framework/resource/AudioPlayer';
import BaseWindow from 'db://assets/framework/ui/BaseWindow';
import { UILayerType } from 'db://assets/framework/ui/UILayer';
const { ccclass, property } = _decorator;

@ccclass('LoseWnd')
export class LoseWnd extends BaseWindow {

    @property(Node)
    btRestart: Node = null!;

    @property(Node)
    btAdVideo: Node = null!;

    windowLayer = UILayerType.TOP_POPUP;

    protected onLoad(): void {
        AudioPlayer.getInstance().playEffect(BundlesEnum.Game, AudioEnum.MUSIC_LEVEL_FAILED);
        this.btRestart.on(Node.EventType.TOUCH_END, this.onBtnRestartClick, this);
        this.btAdVideo.on(Node.EventType.TOUCH_END, this.onBtnAdVideoClick, this);
    }

    private onBtnRestartClick(): void {
        // BattleManager.getInstance().restart();
    }

    private onBtnAdVideoClick(): void {

    }
}
