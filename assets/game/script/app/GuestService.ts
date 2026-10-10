import { instantiate, Node, Prefab, SkeletalAnimation, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { Guest } from "../domain/Guest";
import { GridAgent } from "../sim/GridAgent";
import { RecastPathfinder } from "../sim/RecastPathfinder";
import { findNamedDescendant, StationBinding, StationRegistry } from "../sim/StationRegistry";
import { PlayerView } from "../view/PlayerView";

const ORDER_NAME = "OrderPoint";
const DEFAULT_ORDER = "burgerbaked";
const SEAT_ARRIVE = 1.0;

export class GuestService {
    private _orderPrefab: Prefab | null = null;
    private _guest: Guest | null = null;
    private _node: Node | null = null;
    private _view: PlayerView | null = null;
    private _agent: GridAgent | null = null;
    private _table: StationBinding | null = null;
    private _seat: Node | null = null;
    private _leave: Node | null = null;
    private _orderPoint: Node | null = null;
    private _yawOffset = 0;

    constructor(
        private readonly pathfinder: RecastPathfinder,
        private readonly registry: StationRegistry,
    ) {}

    async load(): Promise<void> {
        this._orderPrefab = await ResourceManager.getInstance().loadPrefab(
            "prefab/items/BurgerBaked",
            BundlesEnum.Game,
        );
        if (!this._orderPrefab) {
            console.warn("[Guest] 未找到 prefab/items/BurgerBaked");
        }
    }

    start(levelRoot: Node, stationRoot: Node, yawOffset: number): void {
        this._yawOffset = yawOffset;
        this._leave = findNamedDescendant(levelRoot, "LeavePoint");
        this._node = findNamedDescendant(levelRoot, "Guest");
        this._table = this.registry.all.find((b) => b.station.type === "table") ?? null;
        this._seat = this.findSeat(stationRoot);
        if (!this._node || !this._table || !this._seat || !this._leave) {
            console.warn("[Guest] 缺少 Guest / Table / SeatPoint / LeavePoint");
            return;
        }

        this._guest = new Guest(this._node.name);
        this._guest.orderId = DEFAULT_ORDER;
        this._orderPoint = this.ensureOrderPoint(this._node);

        this._node.mobility = 2;
        const startPos = this._node.worldPosition.clone();
        const agentId = this.pathfinder.addAgent(startPos, {
            radius: 0.4,
            height: 1.6,
            maxAcceleration: 10,
            maxSpeed: 3.2,
            collisionQueryRange: 1.2,
            pathOptimizationRange: 4,
            separationWeight: 1,
        });
        const agentPos = this.pathfinder.getPosition(agentId);
        const yOffset = startPos.y - agentPos.y;
        this._agent = new GridAgent(this.pathfinder, agentId, SEAT_ARRIVE);
        this._view = this._node.getComponent(PlayerView) ?? this._node.addComponent(PlayerView);
        this._view.bind(this.pathfinder, agentId, yOffset, yawOffset, 8);

        this._agent.goto(this._seat.worldPosition);
        this.setAnimPlaying(true);
        console.log("[Guest] 前往入座", this._seat.parent?.name);
    }

    update(): void {
        const guest = this._guest;
        const agent = this._agent;
        if (!guest || !agent) {
            return;
        }
        if (guest.state === "entering" && agent.arrived()) {
            this.sit();
        } else if (guest.state === "leaving" && agent.arrived()) {
            this.finishLeave();
        }
    }

    /** 桌上刚放下的食物若是客人订单，则收餐并离席。 */
    tryServe(binding: StationBinding): boolean {
        const guest = this._guest;
        const slot = binding.station.slot;
        if (!guest || guest.state !== "seated" || !this._table || binding.station.id !== this._table.station.id) {
            return false;
        }
        if (!slot || slot.itemId !== guest.orderId) {
            return false;
        }
        this.clearHold(binding.holdPoint);
        binding.station.slot = null;
        this.clearHold(this._orderPoint);
        this.leave();
        return true;
    }

    private sit(): void {
        const guest = this._guest;
        const node = this._node;
        const seat = this._seat;
        const table = this._table;
        if (!guest || !node || !seat || !table) {
            return;
        }
        this._agent?.stop();
        if (this._view) {
            this._view.enabled = false;
        }
        const pos = seat.worldPosition;
        node.setWorldPosition(pos.x, pos.y, pos.z);
        this.face(node, table.node.worldPosition);
        this.setAnimPlaying(false);
        this.showOrder();
        guest.state = "seated";
        console.log("[Guest] 入座，要", guest.orderId);
        this.tryServe(table);
    }

    seatedOrder(): string | null {
        return this._guest?.state === "seated" ? this._guest.orderId : null;
    }

    private leave(): void {
        const guest = this._guest;
        const leave = this._leave;
        if (!guest || !leave || !this._agent) {
            return;
        }
        guest.state = "leaving";
        if (this._view) {
            this._view.enabled = true;
        }
        this.setAnimPlaying(true);
        this._agent.goto(leave.worldPosition);
        console.log("[Guest] 上菜完成，前往 LeavePoint");
    }

    private finishLeave(): void {
        const guest = this._guest;
        if (!guest || !this._node) {
            return;
        }
        this._agent?.stop();
        guest.state = "gone";
        this._node.active = false;
        console.log("[Guest] 已离开");
    }

    private showOrder(): void {
        if (!this._orderPoint || !this._orderPrefab || !this._guest) {
            return;
        }
        this.clearHold(this._orderPoint);
        const icon = instantiate(this._orderPrefab);
        icon.name = this._guest.orderId;
        this._orderPoint.addChild(icon);
        icon.setPosition(0, 0, 0);
        icon.setScale(0.7, 0.7, 0.7);
        const torus = this._node?.getChildByName("Torus");
        if (torus) {
            torus.active = false;
        }
    }

    private ensureOrderPoint(guest: Node): Node {
        let point = guest.getChildByName(ORDER_NAME);
        if (!point) {
            point = new Node(ORDER_NAME);
            guest.addChild(point);
            point.setPosition(0, 2.15, 0);
        }
        return point;
    }

    private findSeat(stationRoot: Node): Node | null {
        for (let i = 0; i < stationRoot.children.length; i++) {
            const node = stationRoot.children[i];
            if (!node.name.toLowerCase().startsWith("chair")) {
                continue;
            }
            const seat = findNamedDescendant(node, "SeatPoint");
            if (seat) {
                return seat;
            }
        }
        return findNamedDescendant(stationRoot, "SeatPoint");
    }

    private face(node: Node, world: Vec3): void {
        const p = node.worldPosition;
        const dx = world.x - p.x;
        const dz = world.z - p.z;
        if (dx * dx + dz * dz < 1e-6) {
            return;
        }
        node.setRotationFromEuler(0, Math.atan2(dx, dz) * 180 / Math.PI + this._yawOffset, 0);
    }

    private setAnimPlaying(playing: boolean): void {
        const anim = this._node?.getComponentInChildren(SkeletalAnimation);
        if (!anim) {
            return;
        }
        if (playing) {
            anim.play();
        } else {
            anim.stop();
        }
    }

    private clearHold(hold: Node | null): void {
        if (!hold) {
            return;
        }
        const kids = hold.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
    }
}
