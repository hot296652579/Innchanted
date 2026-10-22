import { Camera, instantiate, Node, Prefab, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { UILayerRoot, UILayerType } from "../../../framework/ui/UILayer";
import { allGuestDefs, guestOrders } from "../app/GuestCatalog";

const ORDER_NAME = "OrderPoint";
const ORDER_Y = 2.5;
const HINT_Y = 40;
const _world = new Vec3();
const _local = new Vec3();

type Flash = { remain: number; hintPath: string };

/** 客人头顶订单：按配置加载对应食物预设。提示一次的客人 1 秒后换成问号。 */
export class GuestOrderView {
    private readonly _prefabs = new Map<string, Prefab>();
    private readonly _hintPrefabs = new Map<string, Prefab>();
    private readonly _points = new Map<string, Node>();
    private readonly _flash = new Map<string, Flash>();
    private readonly _hints = new Map<string, Node>();

    constructor(private readonly camera: Camera | null) {}

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        const defs = allGuestDefs();
        const seen = new Set<string>();
        const hints = new Set<string>();
        for (let i = 0; i < defs.length; i++) {
            const def = defs[i];
            if (def.hintPrefab) {
                hints.add(def.hintPrefab);
            }
            const orders = guestOrders(def);
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
        const hintPaths = Array.from(hints);
        for (let i = 0; i < hintPaths.length; i++) {
            const path = hintPaths[i];
            const prefab = await res.loadPrefab(path, BundlesEnum.Game);
            if (!prefab) {
                console.warn("[Guest] 未找到提示预设", path);
                continue;
            }
            this._hintPrefabs.set(path, prefab);
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

    show(guestId: string, itemId: string, hintPrefab?: string, hintTime = 0): void {
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
        if (hintPrefab && hintTime > 0 && this._hintPrefabs.has(hintPrefab)) {
            this._flash.set(guestId, { remain: hintTime, hintPath: hintPrefab });
        }
    }

    hide(guestId: string): void {
        this._flash.delete(guestId);
        const hint = this._hints.get(guestId);
        this._hints.delete(guestId);
        if (hint?.isValid) {
            hint.destroy();
        }
        const point = this._points.get(guestId);
        if (!point) {
            return;
        }
        const kids = point.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
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
            this.showHint(id, flash.hintPath);
        }
    }

    update(): void {
        this._hints.forEach((node, guestId) => {
            const point = this._points.get(guestId);
            if (!node.isValid || !point?.isValid) {
                this._hints.delete(guestId);
                return;
            }
            this.follow(node, point);
        });
    }

    followPoint(guestId: string): Node | null {
        return this._points.get(guestId) ?? null;
    }

    private showHint(guestId: string, path: string): void {
        const point = this._points.get(guestId);
        const prefab = this._hintPrefabs.get(path);
        const uiRoot = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!point || !prefab || !uiRoot) {
            return;
        }
        const kids = point.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
        const old = this._hints.get(guestId);
        if (old?.isValid) {
            old.destroy();
        }
        const node = instantiate(prefab);
        node.name = `Hint_${guestId}`;
        uiRoot.addChild(node);
        this._hints.set(guestId, node);
        this.follow(node, point);
    }

    private follow(ui: Node, world: Node): void {
        const cam3d = this.camera;
        const sceneUI = UILayerRoot.getRootByLayer(UILayerType.SCENE_UI);
        if (!cam3d || !sceneUI) {
            return;
        }
        const pos = world.worldPosition;
        _world.set(pos.x, pos.y, pos.z);
        cam3d.convertToUINode(_world, sceneUI, _local);
        ui.setPosition(_local.x, _local.y + HINT_Y, 0);
    }
}
