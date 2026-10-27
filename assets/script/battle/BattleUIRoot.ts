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
        uiMgr.registerWindow(UIConfig.ReadyWnd.name, UIConfig.ReadyWnd.path, UIConfig.ReadyWnd.cache, BundlesEnum.Game);
        uiMgr.registerWindow(UIConfig.InviteWnd.name, UIConfig.InviteWnd.path, UIConfig.InviteWnd.cache, BundlesEnum.Game);
        uiMgr.openWindow(UIConfig.TopWnd.name);
        const events = EventManager.getInstance();
        events.on(GameEvent.SHOW_TIPS, this.onShowTips, this);
        events.on(GameEvent.SHIFT_READY, this.onReady, this);
        events.on(GameEvent.GUEST_INVITE, this.onInvite, this);
    }

    private onShowTips(text: string): void {
        void UIUtils.showTips(text);
    }

    private onReady(): void {
        void UIManager.getInstance().openWindow(UIConfig.ReadyWnd.name);
    }

    private onInvite(): void {
        void UIManager.getInstance().openWindow(UIConfig.InviteWnd.name);
    }

    protected onDestroy(): void {
        const events = EventManager.getInstance();
        events.off(GameEvent.SHOW_TIPS, this.onShowTips, this);
        events.off(GameEvent.SHIFT_READY, this.onReady, this);
        events.off(GameEvent.GUEST_INVITE, this.onInvite, this);
    }
}
