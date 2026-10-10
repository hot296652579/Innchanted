import { instantiate, Node } from "cc";
import { StationRegistry } from "../sim/StationRegistry";

const STACK_Y = 0.12;

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

    take(stationId: string): void {
        this.transfer(this.hold(stationId), this.playerHold, -1);
    }

    place(stationId: string, count = -1): void {
        this.transfer(this.playerHold, this.hold(stationId), count);
    }

    stack(stationId: string, moved: number): void {
        this.transfer(this.playerHold, this.hold(stationId), moved);
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
        this.layout(to);
    }

    private layout(hold: Node): void {
        const kids = hold.children;
        for (let i = 0; i < kids.length; i++) {
            if (kids[i].isValid) {
                kids[i].setPosition(0, i * STACK_Y, 0);
            }
        }
    }
}
