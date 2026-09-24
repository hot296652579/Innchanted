import { _decorator, Component } from 'cc';
import { BattleContext } from '../define/BattleContext';
import { BundlesEnum } from '../define/BundlesEnum';
import { UIConfig } from '../define/UIEnum';
import { UILayerRoot } from '../framework/ui/UILayer';
import { UIManager } from '../framework/ui/UIManager';
import { GameMain } from '../GameMain';
const { ccclass, property } = _decorator;

@ccclass('StartScene')
export class StartScene extends Component {

    async start() {
        const gameMain = new GameMain();
        await gameMain.initAllFramework();

        UILayerRoot.initRoot(this.node);
        const uiMgr = UIManager.getInstance();

        uiMgr.registerWindow(UIConfig.StartWnd.name, UIConfig.StartWnd.path, UIConfig.StartWnd.cache, BundlesEnum.UI);
        uiMgr.registerWindow(UIConfig.SelectWnd.name, UIConfig.SelectWnd.path, UIConfig.SelectWnd.cache, BundlesEnum.UI);
        uiMgr.registerWindow(UIConfig.LoadingWnd.name, UIConfig.LoadingWnd.path, UIConfig.LoadingWnd.cache);
        uiMgr.registerWindow(UIConfig.SettingWnd.name, UIConfig.SettingWnd.path, UIConfig.SettingWnd.cache, BundlesEnum.UI);
        uiMgr.registerWindow(UIConfig.BattleWnd.name, UIConfig.BattleWnd.path, UIConfig.BattleWnd.cache, BundlesEnum.UI);
        uiMgr.registerWindow(UIConfig.WinWnd.name, UIConfig.WinWnd.path, UIConfig.WinWnd.cache, BundlesEnum.Game);
        uiMgr.registerWindow(UIConfig.LoseWnd.name, UIConfig.LoseWnd.path, UIConfig.LoseWnd.cache, BundlesEnum.Game);

        uiMgr.registerWindow(UIConfig.TipWnd.name, UIConfig.TipWnd.path, UIConfig.TipWnd.cache, BundlesEnum.UI);
        uiMgr.registerWindow(UIConfig.ConfirmWnd.name, UIConfig.ConfirmWnd.path, UIConfig.ConfirmWnd.cache, BundlesEnum.UI);

        const openWnd = BattleContext.pendingStartWindow ?? UIConfig.StartWnd.name;
        BattleContext.pendingStartWindow = null;
        await uiMgr.openWindow(UIConfig.LoadingWnd.name, {
            bundles: [BundlesEnum.Audio, BundlesEnum.UI],
            nextWindow: openWnd,
        });
    }
}
