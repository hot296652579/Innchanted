import { _decorator, Button } from "cc";
import { UIConfig } from "db://assets/define/UIEnum";
import { UIManager } from "db://assets/framework/ui/UIManager";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
const { ccclass, property } = _decorator;

@ccclass
export class DailyTaskWnd extends BaseWindow {
    windowLayer = UILayerType.TOP_POPUP;

    @property(Button)
    backBtn: Button = null!;

    protected onLoad(): void {
        this.backBtn.node.on(Button.EventType.CLICK, this.onBack, this);
    }

    private async onBack(): Promise<void> {
        await UIManager.getInstance().closeWindow(UIConfig.DailyTaskWnd.name);
    }

}



