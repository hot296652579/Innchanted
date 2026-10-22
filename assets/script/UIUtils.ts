import { UIConfig } from "../define/UIEnum";
import { UIManager } from "../framework/ui/UIManager";
import { TipWindowParam } from "../ui/window/common/TipWnd";

export class UIUtils {
    public static async showTips(text: string): Promise<void> {
        const param: TipWindowParam = { msg: text };
        await UIManager.getInstance().openWindow(UIConfig.TipWnd.name, param);
    }
}
