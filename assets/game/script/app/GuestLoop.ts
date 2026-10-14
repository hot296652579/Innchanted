import { Camera, instantiate, Node, Prefab, SkeletalAnimation, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { Guest } from "../domain/Guest";
import { COIN_ID, ItemStack } from "../domain/ItemStack";
import { GuestFsm } from "../fsm/GuestFsm";
import { DiningLayout, scanDining } from "../sim/DiningHall";
import { GridAgent } from "../sim/GridAgent";
import { RecastPathfinder } from "../sim/RecastPathfinder";
import { StationBinding, StationRegistry } from "../sim/StationRegistry";
import { GuestExpressionView } from "../view/GuestExpressionView";
import { GuestOrderView } from "../view/GuestOrderView";
import { PlayerView } from "../view/PlayerView";
import { findGuestDef } from "./GuestCatalog";

const SEAT_ARRIVE = 1.0;

interface GuestRuntime {
    layout: DiningLayout;
    guest: Guest;
    fsm: GuestFsm;
    view: PlayerView | null;
    agent: GridAgent;
}

/** 一局里的客人编排：入座 → 等待 → 表情 → 离店。不是 Manager。 */
export class GuestLoop {
    private readonly _orders = new GuestOrderView();
    private readonly _faces: GuestExpressionView;
    private readonly _runtimes: GuestRuntime[] = [];
    private _coinPrefab: Prefab | null = null;
    private _yawOffset = 0;

    constructor(
        private readonly pathfinder: RecastPathfinder,
        private readonly registry: StationRegistry,
        camera: Camera | null,
    ) {
        this._faces = new GuestExpressionView(camera);
    }

    async load(): Promise<void> {
        await this._orders.load();
        await this._faces.load();
        this._coinPrefab = await ResourceManager.getInstance().loadPrefab("prefab/items/Coin", BundlesEnum.Game);
        if (!this._coinPrefab) {
            console.warn("[Guest] 未找到 prefab/items/Coin");
        }
    }

    start(levelRoot: Node, stationRoot: Node, yawOffset: number): void {
        this._yawOffset = yawOffset;
        this._runtimes.length = 0;
        const layouts = scanDining(levelRoot, stationRoot, this.registry);
        if (layouts.length === 0) {
            console.warn("[Guest] 缺少 Guest / Table / SeatPoint / LeavePoint");
            return;
        }
        for (let i = 0; i < layouts.length; i++) {
            this.spawn(layouts[i]);
        }
        console.log(`[Guest] 就绪 ${this._runtimes.length} 位`);
    }

    update(dt: number): void {
        this._faces.tick(dt);
        this._faces.update();
        for (let i = 0; i < this._runtimes.length; i++) {
            this.tickRuntime(this._runtimes[i], dt);
        }
    }

    wantedAt(tableId: string, itemId?: string | null): string | null {
        for (let i = 0; i < this._runtimes.length; i++) {
            const guest = this._runtimes[i].guest;
            if (guest.state !== "seated" || guest.tableId !== tableId) {
                continue;
            }
            if (!itemId || guest.orderId === itemId) {
                return guest.orderId;
            }
        }
        return null;
    }

    hasSeated(tableId: string): boolean {
        return this.wantedAt(tableId) !== null;
    }

    tryServe(binding: StationBinding): boolean {
        const slot = binding.station.slot;
        if (!slot) {
            return false;
        }
        for (let i = 0; i < this._runtimes.length; i++) {
            const runtime = this._runtimes[i];
            if (runtime.guest.tableId !== binding.station.id || !runtime.guest.canAccept(slot.itemId)) {
                continue;
            }
            if (!runtime.fsm.serve()) {
                return false;
            }
            this.clearHold(binding.holdPoint);
            this.dropCoin(binding);
            this._orders.hide(runtime.guest.id);
            this.react(runtime, "happy");
            EventManager.getInstance().emit(GameEvent.GUEST_SERVED, runtime.guest.id, runtime.guest.orderId);
            EventManager.getInstance().emit(GameEvent.SHELL_SPAWNED, binding.station.id);
            return true;
        }
        return false;
    }

    private spawn(layout: DiningLayout): void {
        const def = findGuestDef(layout.guestType);
        if (!def) {
            console.warn("[Guest] 没有配置", layout.guestNode.name);
            return;
        }
        const guest = new Guest(layout.guestNode.name, def);
        guest.tableId = layout.table.station.id;
        const fsm = new GuestFsm(guest);
        this._orders.bind(guest.id, layout.guestNode);

        const guestNode = layout.guestNode;
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
        const agent = new GridAgent(this.pathfinder, agentId, SEAT_ARRIVE);
        const view = guestNode.getComponent(PlayerView) ?? guestNode.addComponent(PlayerView);
        view.bind(this.pathfinder, agentId, startPos.y - agentPos.y, this._yawOffset, 8);
        agent.goto(layout.seatPoint.worldPosition);
        this.setAnimPlaying(guestNode, true);
        this._runtimes.push({ layout, guest, fsm, view, agent });
        console.log("[Guest] 前往入座", guest.id, "要", guest.orderId, guest.waitTime, "s", layout.seatPoint.parent?.name);
    }

    private tickRuntime(runtime: GuestRuntime, dt: number): void {
        if (runtime.fsm.state === "entering" && runtime.agent.arrived()) {
            this.sit(runtime);
            return;
        }
        if (runtime.fsm.state === "leaving" && runtime.agent.arrived()) {
            this.finishLeave(runtime);
            return;
        }
        const signal = runtime.guest.tickWait(dt);
        if (signal === "urge") {
            this.react(runtime, "urge");
        } else if (signal === "timeout" && runtime.fsm.timeout()) {
            this._orders.hide(runtime.guest.id);
            this.react(runtime, "angry");
            EventManager.getInstance().emit(GameEvent.GUEST_ANGRY, runtime.guest.id);
        }
    }

    private sit(runtime: GuestRuntime): void {
        const { layout, guest, fsm, view, agent } = runtime;
        agent.stop();
        if (view) {
            view.enabled = false;
        }
        const pos = layout.seatPoint.worldPosition;
        layout.guestNode.setWorldPosition(pos.x, pos.y, pos.z);
        this.face(layout.guestNode, layout.table.node.worldPosition);
        this.setAnimPlaying(layout.guestNode, false);
        fsm.sit();
        this._orders.show(guest.id, guest.orderId);
        EventManager.getInstance().emit(GameEvent.ORDER_SHOWN, guest.id, guest.orderId);
        console.log("[Guest] 入座", guest.id, "要", guest.orderId);
        this.tryServe(layout.table);
    }

    private react(runtime: GuestRuntime, kind: "happy" | "urge" | "angry"): void {
        const follow = this._orders.followPoint(runtime.guest.id) ?? runtime.layout.guestNode;
        const leaveAfter = kind !== "urge";
        this._faces.play(runtime.guest.id, follow, kind, () => {
            if (leaveAfter) {
                this.walkOut(runtime);
            }
        });
    }

    private walkOut(runtime: GuestRuntime): void {
        const leave = runtime.layout.leavePoint;
        runtime.fsm.leave();
        this._faces.hide(runtime.guest.id);
        if (runtime.view) {
            runtime.view.enabled = true;
        }
        this.setAnimPlaying(runtime.layout.guestNode, true);
        runtime.agent.goto(leave.worldPosition);
        console.log("[Guest] 离席", runtime.guest.id, runtime.guest.leaveReason);
    }

    private finishLeave(runtime: GuestRuntime): void {
        runtime.agent.stop();
        runtime.fsm.finish();
        runtime.layout.guestNode.active = false;
        EventManager.getInstance().emit(GameEvent.GUEST_LEFT, runtime.guest.id);
        console.log("[Guest] 已离开", runtime.guest.id);
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

    private setAnimPlaying(guestNode: Node, playing: boolean): void {
        const anim = guestNode.getComponentInChildren(SkeletalAnimation);
        if (!anim) {
            return;
        }
        if (playing) {
            anim.play();
        } else {
            anim.stop();
        }
    }

    private dropCoin(binding: StationBinding): void {
        binding.station.slot = new ItemStack(COIN_ID, 1);
        const prefab = this._coinPrefab;
        const hold = binding.holdPoint;
        if (!prefab) {
            return;
        }
        const coin = instantiate(prefab);
        coin.name = "Coin";
        hold.addChild(coin);
        coin.setPosition(0, 0, 0);
        coin.mobility = 2;
    }

    private clearHold(hold: Node): void {
        const kids = hold.children.slice();
        for (let i = 0; i < kids.length; i++) {
            kids[i].destroy();
        }
    }
}
