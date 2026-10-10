import { instantiate, Node, Prefab } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";

const ORDER_NAME = "OrderPoint";

/** 客人头顶订单：只负责显示 / 销毁预设。 */
export class GuestOrderView {
    private _prefab: Prefab | null = null;
    private _point: Node | null = null;

    async load(): Promise<void> {
        this._prefab = await ResourceManager.getInstance().loadPrefab(
            "prefab/items/BurgerBaked",
            BundlesEnum.Game,
        );
        if (!this._prefab) {
            console.warn("[Guest] 未找到 prefab/items/BurgerBaked");
        }
    }

    bind(guest: Node): void {
        this._point = guest.getChildByName(ORDER_NAME);
        if (!this._point) {
            this._point = new Node(ORDER_NAME);
            guest.addChild(this._point);
            this._point.setPosition(0, 2.15, 0);
        }
        const torus = guest.getChildByName("Torus");
        if (torus) {
            torus.active = false;
        }
    }

    show(itemId: string): void {
        if (!this._point || !this._prefab) {
            return;
        }
        this.hide();
        const icon = instantiate(this._prefab);
        icon.name = itemId;
        this._point.addChild(icon);
        icon.setPosition(0, 0, 0);
        icon.setScale(0.7, 0.7, 0.7);
    }

    hide(): void {
        if (!this._point) {
            return;
        }
        const kids = this._point.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
    }
}
