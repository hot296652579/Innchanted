import { instantiate, Node, Prefab, tween, Vec3 } from "cc";
import { StationRegistry } from "../sim/StationRegistry";

export const HOLD_STACK_Y = 0.38;

export class ItemHoldView {
    private readonly _stationHold = new Map<string, Node>();

    constructor(private readonly playerHold: Node) {}

    capture(registry: StationRegistry): void {
        this._stationHold.clear();
        for (let i = 0; i < registry.all.length; i++) {
            const binding = registry.all[i];
            this._stationHold.set(binding.station.id, binding.holdPoint);
        }
    }

    take(stationId: string, count = -1): void {
        this.transfer(this.hold(stationId), this.playerHold, count);
    }

    /** 无限材料架：复制一份到手上，不销毁台上的。 */
    copyToPlayer(stationId: string, count = 1): void {
        const from = this.hold(stationId);
        const to = this.playerHold;
        if (!from || !to || count <= 0 || from.children.length === 0) {
            return;
        }
        const src = from.children[0];
        const n = Math.min(count, 8);
        for (let i = 0; i < n; i++) {
            const clone = instantiate(src);
            clone.name = src.name;
            to.addChild(clone);
            clone.mobility = 2;
        }
        this.layout(to);
    }

    place(stationId: string, count = -1): void {
        this.transfer(this.playerHold, this.hold(stationId), count);
    }

    stack(stationId: string, moved: number): void {
        this.transfer(this.playerHold, this.hold(stationId), moved);
    }

    removeFromPlayer(count: number): void {
        this.remove(this.playerHold, count);
    }

    removeFromStation(stationId: string, count: number): void {
        this.remove(this.hold(stationId), count);
    }

    spawnOnPlayer(prefab: Prefab, count: number): void {
        this.spawn(this.playerHold, prefab, count);
    }

    spawnOnStation(stationId: string, prefab: Prefab, count: number): void {
        this.spawn(this.hold(stationId), prefab, count);
    }

    /** 手里金币飞进宝箱 HoldPoint 后销毁。 */
    bankInto(stationId: string): void {
        const to = this.hold(stationId);
        const from = this.playerHold;
        if (!from || !to) {
            return;
        }
        const kids = from.children.slice();
        for (let i = 0; i < kids.length; i++) {
            const coin = kids[i];
            const world = coin.worldPosition.clone();
            to.addChild(coin);
            coin.setWorldPosition(world);
            coin.mobility = 2;
            tween(coin)
                .delay(i * 0.04)
                .to(0.35, { position: new Vec3(0, 0, 0) }, { easing: "quadIn" })
                .call(() => {
                    if (coin.isValid) {
                        coin.destroy();
                    }
                })
                .start();
        }
    }

    private remove(hold: Node | null, count: number): void {
        if (!hold || count <= 0) {
            return;
        }
        const kids = hold.children.slice();
        const n = Math.min(count, kids.length);
        for (let i = kids.length - n; i < kids.length; i++) {
            kids[i].destroy();
        }
        this.layout(hold);
    }

    private spawn(hold: Node | null, prefab: Prefab, count: number): void {
        if (!hold || count <= 0) {
            return;
        }
        for (let i = 0; i < count; i++) {
            const item = instantiate(prefab);
            item.name = prefab.name;
            hold.addChild(item);
            item.mobility = 2;
        }
        this.layout(hold);
    }

    private hold(stationId: string): Node | null {
        return this._stationHold.get(stationId) ?? null;
    }

    /** 从 from 克隆 count 个到 to，然后销毁 from 上的原节点。count < 0 表示全部。 */
    private transfer(from: Node | null, to: Node | null, count: number): void {
        if (!from || !to || count === 0) {
            return;
        }
        const kids = from.children.slice();
        const n = count < 0 ? kids.length : Math.min(count, kids.length);
        for (let i = 0; i < n; i++) {
            const clone = instantiate(kids[i]);
            clone.name = kids[i].name;
            to.addChild(clone);
            kids[i].destroy();
        }
        this.layout(from);
        this.layout(to);
    }

    private layout(hold: Node | null): void {
        if (!hold) {
            return;
        }
        const kids = hold.children;
        for (let i = 0; i < kids.length; i++) {
            if (kids[i].isValid) {
                kids[i].setPosition(0, i * HOLD_STACK_Y, 0);
            }
        }
    }
}
