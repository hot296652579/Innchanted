import { _decorator, Node } from 'cc';
import { Config } from 'db://assets/Config';
import { UIConfig } from 'db://assets/define/UIEnum';
import BaseWindow from 'db://assets/framework/ui/BaseWindow';
import { UILayerType } from 'db://assets/framework/ui/UILayer';
import { UIManager } from 'db://assets/framework/ui/UIManager';
import { BattleManager } from '../battle/BattleManager';
const { ccclass, property } = _decorator;

@ccclass('RevokeWnd')
export class RevokeWnd extends BaseWindow {

    @property(Node)
    btSure: Node = null!;
    @property(Node)
    btCancel: Node = null!;

    windowLayer = UILayerType.TOP_POPUP;

    protected onLoad(): void {
        this.btSure.on(Node.EventType.TOUCH_END, this.onBtnSureClick, this);
        this.btCancel.on(Node.EventType.TOUCH_END, this.onBtnCancelClick, this);
    }

    private onBtnSureClick(): void {
        if (Config.DebugMode) {
            BattleManager.getInstance().continueWithExtraRevoke();
        } else {
            // TODO：广告播放后
        }
    }

    private onBtnCancelClick(): void {
        UIManager.getInstance().closeWindow(UIConfig.RevokeWnd.name);
    }
}
