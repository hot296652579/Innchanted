import { Node, SkeletalAnimation, Vec3 } from "cc";
import { GameEvent } from "../../../framework/event/EventName";
import { EventManager } from "../../../framework/event/EventManager";
import { Guest } from "../domain/Guest";
import { GuestFsm } from "../fsm/GuestFsm";
import { DiningLayout, scanDining } from "../sim/DiningHall";
import { GridAgent } from "../sim/GridAgent";
import { RecastPathfinder } from "../sim/RecastPathfinder";
import { StationBinding, StationRegistry } from "../sim/StationRegistry";
import { GuestOrderView } from "../view/GuestOrderView";
import { PlayerView } from "../view/PlayerView";

const SEAT_ARRIVE = 1.0;

/** 一局里的客人编排：入座 → 出单 → 上菜 → 离店。不是 Manager。 */
export class GuestLoop {
    private readonly _orders = new GuestOrderView();
    private _layout: DiningLayout | null = null;
    private _guest: Guest | null = null;
    private _fsm: GuestFsm | null = null;
    private _view: PlayerView | null = null;
    private _agent: GridAgent | null = null;
    private _yawOffset = 0;

    constructor(
        private readonly pathfinder: RecastPathfinder,
        private readonly registry: StationRegistry,
    ) {}

    async load(): Promise<void> {
        await this._orders.load();
    }

    start(levelRoot: Node, stationRoot: Node, yawOffset: number): void {
        this._yawOffset = yawOffset;
        this._layout = scanDining(levelRoot, stationRoot, this.registry);
        if (!this._layout) {
            console.warn("[Guest] 缺少 Guest / Table / SeatPoint / LeavePoint");
            return;
        }

        const { guestNode, seatPoint, table } = this._layout;
        this._guest = new Guest(guestNode.name);
        this._guest.tableId = table.station.id;
        this._fsm = new GuestFsm(this._guest);
        this._orders.bind(guestNode);

        guestNode.mobility = 2;
        const startPos = guestNode.worldPosition.clone();
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
        this._agent = new GridAgent(this.pathfinder, agentId, SEAT_ARRIVE);
        this._view = guestNode.getComponent(PlayerView) ?? guestNode.addComponent(PlayerView);
        this._view.bind(this.pathfinder, agentId, startPos.y - agentPos.y, yawOffset, 8);
        this._agent.goto(seatPoint.worldPosition);
        this.setAnimPlaying(true);
        console.log("[Guest] 前往入座", seatPoint.parent?.name);
    }

    update(): void {
        const fsm = this._fsm;
        const agent = this._agent;
        if (!fsm || !agent) {
            return;
        }
        if (fsm.state === "entering" && agent.arrived()) {
            this.sit();
        } else if (fsm.state === "leaving" && agent.arrived()) {
            this.finishLeave();
        }
    }

    seatedOrder(): string | null {
        return this._guest?.state === "seated" ? this._guest.orderId : null;
    }

    tryServe(binding: StationBinding): boolean {
        const guest = this._guest;
        const slot = binding.station.slot;
        if (!guest || !slot || guest.tableId !== binding.station.id || !guest.canAccept(slot.itemId)) {
            return false;
        }
        if (!this._fsm?.serve()) {
            return false;
        }
        this.clearHold(binding.holdPoint);
        binding.station.slot = null;
        this._orders.hide();
        this.walkOut();
        EventManager.getInstance().emit(GameEvent.GUEST_SERVED, guest.id, guest.orderId);
        return true;
    }

    private sit(): void {
        const layout = this._layout;
        const guest = this._guest;
        if (!layout || !guest || !this._fsm) {
            return;
        }
        this._agent?.stop();
        if (this._view) {
            this._view.enabled = false;
        }
        const pos = layout.seatPoint.worldPosition;
        layout.guestNode.setWorldPosition(pos.x, pos.y, pos.z);
        this.face(layout.guestNode, layout.table.node.worldPosition);
        this.setAnimPlaying(false);
        this._fsm.sit();
        this._orders.show(guest.orderId);
        EventManager.getInstance().emit(GameEvent.ORDER_SHOWN, guest.id, guest.orderId);
        console.log("[Guest] 入座，要", guest.orderId);
        this.tryServe(layout.table);
    }

    private walkOut(): void {
        const leave = this._layout?.leavePoint;
        if (!leave || !this._agent) {
            return;
        }
        if (this._view) {
            this._view.enabled = true;
        }
        this.setAnimPlaying(true);
        this._agent.goto(leave.worldPosition);
        console.log("[Guest] 上菜完成，前往 LeavePoint");
    }

    private finishLeave(): void {
        const guest = this._guest;
        const node = this._layout?.guestNode;
        if (!guest || !node) {
            return;
        }
        this._agent?.stop();
        this._fsm?.finish();
        node.active = false;
        EventManager.getInstance().emit(GameEvent.GUEST_LEFT, guest.id);
        console.log("[Guest] 已离开");
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
        const anim = this._layout?.guestNode.getComponentInChildren(SkeletalAnimation);
        if (!anim) {
            return;
        }
        if (playing) {
            anim.play();
        } else {
            anim.stop();
        }
    }

    private clearHold(hold: Node): void {
        const kids = hold.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
    }
}
