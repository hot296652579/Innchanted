import { instantiate, Node, Prefab } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { allGuestDefs, guestOrders } from "../app/GuestCatalog";

const ORDER_NAME = "OrderPoint";
const ORDER_Y = 2.5;

/** 客人头顶订单：按配置加载对应食物预设。 */
export class GuestOrderView {
    private readonly _prefabs = new Map<string, Prefab>();
    private readonly _points = new Map<string, Node>();

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        const defs = allGuestDefs();
        const seen = new Set<string>();
        for (let i = 0; i < defs.length; i++) {
            const orders = guestOrders(defs[i]);
            for (let j = 0; j < orders.length; j++) {
                const order = orders[j];
                if (seen.has(order.orderId)) {
                    continue;
                }
                seen.add(order.orderId);
                const prefab = await res.loadPrefab(order.orderPrefab, BundlesEnum.Game);
                if (!prefab) {
                    console.warn("[Guest] 未找到订单预设", order.orderPrefab);
                    continue;
                }
                this._prefabs.set(order.orderId, prefab);
            }
        }
    }

    bind(guestId: string, guest: Node): void {
        let point = guest.getChildByName(ORDER_NAME);
        if (!point) {
            point = new Node(ORDER_NAME);
            guest.addChild(point);
            point.setPosition(0, ORDER_Y, 0);
        }
        this._points.set(guestId, point);
    }

    show(guestId: string, itemId: string): void {
        const point = this._points.get(guestId);
        const prefab = this._prefabs.get(itemId);
        if (!point || !prefab) {
            return;
        }
        this.hide(guestId);
        const icon = instantiate(prefab);
        icon.name = itemId;
        point.addChild(icon);
        icon.setPosition(0, 0, 0);
        icon.setScale(1, 1, 1);
    }

    hide(guestId: string): void {
        const point = this._points.get(guestId);
        if (!point) {
            return;
        }
        const kids = point.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
    }

    followPoint(guestId: string): Node | null {
        return this._points.get(guestId) ?? null;
    }
}
