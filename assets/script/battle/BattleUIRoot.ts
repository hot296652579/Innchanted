import { _decorator, Camera, Canvas, Component } from "cc";
const { ccclass } = _decorator;

import { BundlesEnum } from "../../define/BundlesEnum";
import { UIConfig } from "../../define/UIEnum";
import { EventManager } from "../../framework/event/EventManager";
import { GameEvent } from "../../framework/event/EventName";
import { UILayerRoot } from "../../framework/ui/UILayer";
import { UIManager } from "../../framework/ui/UIManager";
import { UIUtils } from "../UIUtils";

@ccclass
export default class BattleUIRoot extends Component {

    async start() {
        const canvas = this.node.parent?.getComponent(Canvas);
        const uiCam = canvas?.cameraComponent;
        if (uiCam) {
            uiCam.priority = 1;
            uiCam.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
        }
        UILayerRoot.initRoot(this.node);

        const uiMgr = UIManager.getInstance();
        uiMgr.registerWindow(UIConfig.TipWnd.name, UIConfig.TipWnd.path, UIConfig.TipWnd.cache, BundlesEnum.UI);
        uiMgr.openWindow(UIConfig.TopWnd.name);
        EventManager.getInstance().on(GameEvent.SHOW_TIPS, this.onShowTips, this);
    }

    private onShowTips(text: string): void {
        void UIUtils.showTips(text);
    }

    protected onDestroy(): void {
        EventManager.getInstance().off(GameEvent.SHOW_TIPS, this.onShowTips, this);
    }
}
