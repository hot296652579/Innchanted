import { instantiate, Node, Prefab } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { allOrderItemIds } from "../app/GuestCatalog";
import { itemPrefabPath } from "../app/ItemCatalog";

const ORDER_NAME = "OrderPoint";
const ORDER_Y = 2.5;

type Flash = { remain: number; onHint: () => void };

/** 客人头顶订单：按 items.json 的 prefab 加载食物预设。提示一次的客人 1 秒后收起订单。 */
export class GuestOrderView {
    private readonly _prefabs = new Map<string, Prefab>();
    private readonly _points = new Map<string, Node>();
    private readonly _flash = new Map<string, Flash>();

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        const ids = allOrderItemIds();
        for (let i = 0; i < ids.length; i++) {
            const itemId = ids[i];
            const path = itemPrefabPath(itemId);
            if (!path) {
                console.warn("[Guest] 物品未配置预设", itemId);
                continue;
            }
            const prefab = await res.loadPrefab(path, BundlesEnum.Game);
            if (!prefab) {
                console.warn("[Guest] 未找到订单预设", path);
                continue;
            }
            this._prefabs.set(itemId, prefab);
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

    show(guestId: string, itemId: string, hintTime = 0, onHint?: () => void): void {
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
        if (hintTime > 0 && onHint) {
            this._flash.set(guestId, { remain: hintTime, onHint });
        }
    }

    hide(guestId: string): void {
        this._flash.delete(guestId);
        this.clearIcons(guestId);
    }

    tick(dt: number): void {
        const ids = Array.from(this._flash.keys());
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const flash = this._flash.get(id);
            if (!flash) {
                continue;
            }
            flash.remain -= dt;
            if (flash.remain > 0) {
                continue;
            }
            this._flash.delete(id);
            this.clearIcons(id);
            flash.onHint();
        }
    }

    followPoint(guestId: string): Node | null {
        return this._points.get(guestId) ?? null;
    }

    private clearIcons(guestId: string): void {
        const point = this._points.get(guestId);
        if (!point) {
            return;
        }
        const kids = point.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
    }
}
