import { _decorator, Node } from 'cc';
import { UIConfig } from 'db://assets/define/UIEnum';
import BaseWindow from 'db://assets/framework/ui/BaseWindow';
import { UILayerType } from 'db://assets/framework/ui/UILayer';
import { UIManager } from 'db://assets/framework/ui/UIManager';
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

    }

    private onBtnCancelClick(): void {
        UIManager.getInstance().closeWindow(UIConfig.RevokeWnd.name);
    }
}
