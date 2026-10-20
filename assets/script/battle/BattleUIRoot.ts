import { _decorator, Camera, Canvas, Component } from "cc";
const { ccclass } = _decorator;

import { UIConfig } from "../../define/UIEnum";
import { UILayerRoot } from "../../framework/ui/UILayer";
import { UIManager } from "../../framework/ui/UIManager";

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
        uiMgr.openWindow(UIConfig.TopWnd.name);
    }

    protected onDestroy(): void {

    }
}
