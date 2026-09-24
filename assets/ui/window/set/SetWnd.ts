import { _decorator, Button, Toggle } from "cc";
import { UIConfig } from "../../../define/UIEnum";
import AudioPlayer from "../../../framework/resource/AudioPlayer";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
import { UIManager } from "../../../framework/ui/UIManager";
const { ccclass, property } = _decorator;

@ccclass
export class SetWnd extends BaseWindow {
    windowLayer = UILayerType.POPUP_WIN;

    @property(Toggle)
    toggleMusic: Toggle = null!;
    @property(Toggle)
    toggleSound: Toggle = null!;

    @property(Button)
    btClose: Button = null!;

    private _syncing = false;

    protected onLoad(): void {
        this.btClose.node.on(Button.EventType.CLICK, this.onBtnCloseClick, this);
        this.toggleMusic?.node.on(Toggle.EventType.TOGGLE, this.onToggleMusic, this);
        this.toggleSound?.node.on(Toggle.EventType.TOGGLE, this.onToggleSound, this);
    }

    protected onOpenRefresh(): void {
        const audio = AudioPlayer.getInstance();
        this._syncing = true;
        if (this.toggleMusic) {
            this.toggleMusic.isChecked = audio.musicOn;
        }
        if (this.toggleSound) {
            this.toggleSound.isChecked = audio.effectOn;
        }
        this._syncing = false;
    }

    private onToggleMusic(toggle: Toggle): void {
        if (this._syncing) {
            return;
        }
        AudioPlayer.getInstance().setMusicOn(toggle.isChecked);
    }

    private onToggleSound(toggle: Toggle): void {
        if (this._syncing) {
            return;
        }
        AudioPlayer.getInstance().setEffectOn(toggle.isChecked);
    }

    private onBtnCloseClick(): void {
        UIManager.getInstance().closeWindow(UIConfig.SettingWnd.name);
    }

}
