import { _decorator, Node } from 'cc';
import BaseWindow from 'db://assets/framework/ui/BaseWindow';
import { UILayerType } from 'db://assets/framework/ui/UILayer';
const { ccclass, property } = _decorator;

@ccclass('RestartUseUp')
export class RestartUseUp extends BaseWindow {

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
        this.closeWindow();
    }
}
