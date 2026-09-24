import { _decorator, Camera, Component, Node } from "cc";
const { ccclass, property } = _decorator;

import { BundlesEnum } from "../../define/BundlesEnum";
import { UIConfig } from "../../define/UIEnum";
import { ConfigManager } from "../../framework/config/ConfigManager";
import { ResourceManager } from "../../framework/resource/ResourceManager";
import { UILayerRoot } from "../../framework/ui/UILayer";
import { UIManager } from "../../framework/ui/UIManager";

@ccclass
export default class BattleRoot extends Component {
    @property(Node)
    public uiRoot!: Node;
    @property(Node)
    public mapRoot!: Node;
    @property(Node)
    public particle: Node | null = null;

    @property(Camera)
    public mainCamera!: Camera;

    protected onLoad(): void {

    }

    async start() {
        UILayerRoot.initRoot(this.uiRoot);

        const terrains = await ConfigManager.getInstance().loadConfig("terrains", BundlesEnum.Table);
        if (!terrains) {
            console.error("terrains 配置加载失败");
            return;
        }

        const bundle = await ResourceManager.getInstance().loadBundle(BundlesEnum.Game);
        if (!bundle) {
            console.error("game分包加载失败");
            return;
        }

        const uiMgr = UIManager.getInstance();
        uiMgr.registerWindow(UIConfig.BattleWnd.name, UIConfig.BattleWnd.path, UIConfig.BattleWnd.cache, BundlesEnum.UI);
        uiMgr.registerWindow(UIConfig.WinWnd.name, UIConfig.WinWnd.path, UIConfig.WinWnd.cache, BundlesEnum.Game);
        uiMgr.registerWindow(UIConfig.LoseWnd.name, UIConfig.LoseWnd.path, UIConfig.LoseWnd.cache, BundlesEnum.Game);
        uiMgr.registerWindow(UIConfig.CustomUseUp.name, UIConfig.CustomUseUp.path, UIConfig.CustomUseUp.cache, BundlesEnum.Game);
        uiMgr.registerWindow(UIConfig.RestartUseUp.name, UIConfig.RestartUseUp.path, UIConfig.RestartUseUp.cache, BundlesEnum.Game);
        uiMgr.registerWindow(UIConfig.RevokeWnd.name, UIConfig.RevokeWnd.path, UIConfig.RevokeWnd.cache, BundlesEnum.Game);
        await uiMgr.openWindow(UIConfig.BattleWnd.name);
    }

    protected onDestroy(): void {

    }
}
