// assets/ui/window/start/StartWnd.ts
import { _decorator, Button } from "cc";
import { AudioEnum } from "db://assets/define/AudioEnum";
import { BundlesEnum } from "db://assets/define/BundlesEnum";
import { UIConfig } from "db://assets/define/UIEnum";
import AudioPlayer from "../../../framework/resource/AudioPlayer";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
import { UIManager } from "../../../framework/ui/UIManager";
const { ccclass, property } = _decorator;

@ccclass
export class StartWnd extends BaseWindow {
    windowLayer = UILayerType.MAIN_WIN;

    @property(Button)
    public enterGameBtn: Button = null!;

    protected onLoad(): void {
        this.enterGameBtn.node.on(Button.EventType.CLICK, this.onClickEnterGame, this);
    }

    protected onOpenRefresh(): void {
        void AudioPlayer.getInstance().playMusic(BundlesEnum.Audio, AudioEnum.BG);
    }

    async onClickEnterGame(): Promise<void> {
        await AudioPlayer.getInstance().playEffect(BundlesEnum.Audio, AudioEnum.Click);
        await UIManager.getInstance().closeWindow(UIConfig.StartWnd.name);
        // director.loadScene("scene/EarthMap");
        await UIManager.getInstance().openWindow(UIConfig.SelectWnd.name);
    }
}
