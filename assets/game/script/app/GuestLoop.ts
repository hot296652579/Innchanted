import { Camera, instantiate, Node, Prefab, SkeletalAnimation, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { Guest } from "../domain/Guest";
import { COIN_ID, ItemStack } from "../domain/ItemStack";
import { GuestFsm } from "../fsm/GuestFsm";
import { StationType } from "../domain/Station";
import { DiningLayout, DiningScan, scanDining } from "../sim/DiningHall";
import { GridAgent } from "../sim/GridAgent";
import { RecastPathfinder } from "../sim/RecastPathfinder";
import { findNamedDescendant, StationBinding, StationRegistry } from "../sim/StationRegistry";
import { EscortView } from "../view/EscortView";
import { GuestExpressionView } from "../view/GuestExpressionView";
import { GuestOrderView } from "../view/GuestOrderView";
import { PlayerView } from "../view/PlayerView";
import { findGuestDef, isEscortGuest } from "./GuestCatalog";
import { goldOf } from "./ItemCatalog";

const SEAT_ARRIVE = 1.0;
const QUEUE_ARRIVE = 0.35;
const WAIT_GAP = 1.6;
const HOLD_RANGE = 2.2;
const _waitPos = new Vec3();
const _waitBack = new Vec3();

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
    private readonly _queue: GuestRuntime[] = [];
    private readonly _freeSeats: { seat: Node; table: StationBinding }[] = [];
    private _waitPoint: Node | null = null;
    private readonly _queueDir = new Vec3(0, 0, -1);
    private _coinPrefab: Prefab | null = null;
    private _yawOffset = 0;
    private _player: Node | null = null;
    private readonly _escort: EscortView;
    private _hold: { kind: "confirm" | "seat"; guestId: string; tableId?: string; elapsed: number; duration: number } | null = null;
    private _escortId: string | null = null;

    constructor(
        private readonly pathfinder: RecastPathfinder,
        private readonly registry: StationRegistry,
        camera: Camera | null,
    ) {
        this._faces = new GuestExpressionView(camera);
        this._escort = new EscortView(camera);
    }

    async load(): Promise<void> {
        await this._orders.load();
        await this._faces.load();
        await this._escort.load();
        this._coinPrefab = await ResourceManager.getInstance().loadPrefab("prefab/items/Coin", BundlesEnum.Game);
        if (!this._coinPrefab) {
            console.warn("[Guest] 未找到 prefab/items/Coin");
        }
    }

    start(levelRoot: Node, stationRoot: Node, yawOffset: number, player?: Node | null): void {
        this._yawOffset = yawOffset;
        this._player = player ?? null;
        this._runtimes.length = 0;
        this._queue.length = 0;
        this._freeSeats.length = 0;
        this._hold = null;
        this._escortId = null;
        this._escort.clear();
        const scan = scanDining(levelRoot, stationRoot, this.registry);
        if (!scan) {
            console.warn("[Guest] 缺少 Guest / Table / SeatPoint / LeavePoint");
            return;
        }
        this._waitPoint = scan.waitPoint;
        this.captureQueueDir(scan);
        for (let i = 0; i < scan.seated.length; i++) {
            this.spawn(scan.seated[i], false);
        }
        if (scan.waiting.length > 0 && !scan.waitPoint) {
            console.warn("[Guest] 有人没座位，但缺少 WaitPoint");
        }
        for (let i = 0; i < scan.waiting.length; i++) {
            this.spawn(scan.waiting[i], true);
        }
        this.repackQueue();
        console.log(
            `[Guest] 就绪 入座 ${scan.seated.map((g) => g.guestNode.name).join(", ") || "无"}`,
            `排队 ${scan.waiting.map((g) => g.guestNode.name).join(", ") || "无"}`,
        );
    }

    update(dt: number): void {
        this._faces.tick(dt);
        this._faces.update();
        this._escort.update();
        this.tickHold(dt);
        for (let i = 0; i < this._runtimes.length; i++) {
            this.tickRuntime(this._runtimes[i], dt);
            const table = this._runtimes[i].layout.table;
            if (table) {
                this._escort.followMark(table.station.id, table.node);
            }
        }
    }

    canEscortPick(node: Node): boolean {
        const runtime = this.findByNode(node);
        if (!runtime || !isEscortGuest(runtime.layout.guestType)) {
            return false;
        }
        const state = runtime.guest.state;
        return state === "queuing" || state === "waitingEscort" || state === "escorted";
    }

    beginConfirmHold(guestId: string): boolean {
        const runtime = this.findById(guestId);
        if (!runtime || !this.canEscortPick(runtime.layout.guestNode)) {
            return false;
        }
        const def = findGuestDef(runtime.layout.guestType);
        this._hold = {
            kind: "confirm",
            guestId,
            elapsed: 0,
            duration: def?.confirmTime ?? 0.5,
        };
        this._escort.showBar(runtime.layout.guestNode, 0);
        console.log("[Guest] 引座确认", guestId, this._hold.duration, "s");
        return true;
    }

    beginSeatHold(binding: StationBinding): boolean {
        if (binding.station.type !== StationType.RoundTable) {
            return false;
        }
        const runtime = this._escortId ? this.findById(this._escortId) : null;
        if (!runtime || runtime.guest.state !== "escorted") {
            return false;
        }
        if (this.tableBusy(binding.station.id)) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "这张圆桌已经有客人了");
            return true;
        }
        const def = findGuestDef(runtime.layout.guestType);
        this._hold = {
            kind: "seat",
            guestId: runtime.guest.id,
            tableId: binding.station.id,
            elapsed: 0,
            duration: def?.seatTime ?? 1,
        };
        this._escort.showBar(binding.node, 0);
        console.log("[Guest] 圆桌引座", binding.station.id, this._hold.duration, "s");
        return true;
    }

    cancelHold(): void {
        if (!this._hold) {
            return;
        }
        this._hold = null;
        this._escort.hideBar();
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
            this.dropCoin(binding, runtime.guest.orderId);
            this._orders.hide(runtime.guest.id);
            this.react(runtime, "happy");
            EventManager.getInstance().emit(GameEvent.GUEST_SERVED, runtime.guest.id, runtime.guest.orderId);
            EventManager.getInstance().emit(GameEvent.SHELL_SPAWNED, binding.station.id);
            return true;
        }
        return false;
    }

    private spawn(layout: DiningLayout, waitInLine: boolean): void {
        const def = findGuestDef(layout.guestType);
        if (!def) {
            console.warn("[Guest] 没有配置", layout.guestNode.name, layout.guestType);
            return;
        }
        const guest = new Guest(layout.guestNode.name, def);
        if (layout.table) {
            guest.tableId = layout.table.station.id;
        }
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
        const runtime: GuestRuntime = { layout, guest, fsm, view, agent };
        this._runtimes.push(runtime);
        this.setAnimPlaying(guestNode, true);
        if (isEscortGuest(layout.guestType) && def.markPrefab) {
            void this._escort.ensureMark(def.markPrefab);
        }
        if (waitInLine) {
            fsm.queue();
            agent.arriveRadius = QUEUE_ARRIVE;
            this._queue.push(runtime);
            console.log("[Guest] 排队", guest.id, isEscortGuest(layout.guestType) ? "等引座" : "要", guest.orderId);
            return;
        }
        if (!layout.seatPoint) {
            return;
        }
        agent.goto(layout.seatPoint.worldPosition);
        console.log("[Guest] 前往入座", guest.id, "要", guest.orderId, guest.waitTime, "s", layout.seatPoint.parent?.name);
    }

    private tickRuntime(runtime: GuestRuntime, dt: number): void {
        if ((runtime.fsm.state === "queuing" || runtime.fsm.state === "waitingEscort" || runtime.fsm.state === "escorted")
            && !runtime.layout.table
            && runtime.agent.arrived()) {
            runtime.agent.stop();
            this.faceWaitLine(runtime.layout.guestNode);
            return;
        }
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
        if (!layout.seatPoint || !layout.table) {
            return;
        }
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
        const seat = runtime.layout.seatPoint;
        const table = runtime.layout.table;
        runtime.fsm.leave();
        if (this._escortId === runtime.guest.id) {
            this._escortId = null;
        }
        this._faces.hide(runtime.guest.id);
        if (runtime.view) {
            runtime.view.enabled = true;
        }
        this.setAnimPlaying(runtime.layout.guestNode, true);
        runtime.agent.goto(leave.worldPosition);
        console.log("[Guest] 离席", runtime.guest.id, runtime.guest.leaveReason);
        if (table) {
            this._escort.hideMark(table.station.id);
        }
        if (seat && table && table.station.type === StationType.Table) {
            this.admitNext(seat, table);
        }
    }

    private finishLeave(runtime: GuestRuntime): void {
        runtime.agent.stop();
        runtime.fsm.finish();
        runtime.layout.guestNode.active = false;
        EventManager.getInstance().emit(GameEvent.GUEST_LEFT, runtime.guest.id);
        console.log("[Guest] 已离开", runtime.guest.id);
    }

    private admitNext(seat: Node, table: StationBinding): void {
        this._freeSeats.push({ seat, table });
        this.flushFreeSeats();
    }

    /** 引座客人离开等待点后，把还空着的普通餐桌交给队首的普通人。 */
    private gatherEmptyRegularSeats(): void {
        const taken = new Set<string>();
        for (let i = 0; i < this._freeSeats.length; i++) {
            taken.add(this._freeSeats[i].table.station.id);
        }
        for (let i = 0; i < this._runtimes.length; i++) {
            const guest = this._runtimes[i].guest;
            const table = this._runtimes[i].layout.table;
            if (!table || table.station.type !== StationType.Table) {
                continue;
            }
            if (guest.state === "entering" || guest.state === "seated" || guest.state === "reacting") {
                taken.add(table.station.id);
            }
        }
        const all = this.registry.all;
        for (let i = 0; i < all.length; i++) {
            const binding = all[i];
            if (binding.station.type !== StationType.Table || taken.has(binding.station.id)) {
                continue;
            }
            const seat = findNamedDescendant(binding.node, "SeatPoint");
            if (seat) {
                this._freeSeats.push({ seat, table: binding });
            }
        }
    }

    /** 队首是引座客人时，后面的人不能插队去空桌。引走队首后再补位。 */
    private flushFreeSeats(): void {
        while (this._freeSeats.length > 0) {
            const head = this._queue[0];
            if (!head || isEscortGuest(head.layout.guestType)) {
                return;
            }
            const slot = this._freeSeats.shift();
            if (!slot) {
                return;
            }
            this._queue.shift();
            head.layout.seatPoint = slot.seat;
            head.layout.table = slot.table;
            head.guest.tableId = slot.table.station.id;
            head.fsm.goSeat();
            head.agent.arriveRadius = SEAT_ARRIVE;
            if (head.view) {
                head.view.enabled = true;
            }
            this.setAnimPlaying(head.layout.guestNode, true);
            head.agent.goto(slot.seat.worldPosition);
            this.repackQueue();
            console.log("[Guest] 补位入座", head.guest.id, slot.table.station.id);
        }
    }

    private repackQueue(): void {
        const wait = this._waitPoint;
        if (!wait) {
            return;
        }
        for (let i = 0; i < this._queue.length; i++) {
            this._queue[i].agent.goto(this.waitSlot(wait, i));
        }
    }

    private captureQueueDir(scan: DiningScan): void {
        const wait = scan.waitPoint;
        if (!wait) {
            return;
        }
        const tail = scan.waiting[scan.waiting.length - 1] ?? scan.seated[scan.seated.length - 1];
        const origin = wait.worldPosition;
        if (tail) {
            const p = tail.guestNode.worldPosition;
            _waitBack.set(p.x - origin.x, 0, p.z - origin.z);
        } else {
            _waitBack.set(wait.forward.x, 0, wait.forward.z);
        }
        if (_waitBack.lengthSqr() < 0.01) {
            _waitBack.set(0, 0, -1);
        } else {
            _waitBack.normalize();
        }
        this._queueDir.set(_waitBack);
    }

    private waitSlot(waitPoint: Node, index: number): Vec3 {
        const origin = waitPoint.worldPosition;
        _waitPos.set(
            origin.x + this._queueDir.x * WAIT_GAP * index,
            origin.y,
            origin.z + this._queueDir.z * WAIT_GAP * index,
        );
        return _waitPos;
    }

    private faceWaitLine(node: Node): void {
        const wait = this._waitPoint;
        if (!wait) {
            return;
        }
        const look = wait.worldPosition.clone();
        look.x -= this._queueDir.x;
        look.z -= this._queueDir.z;
        this.face(node, look);
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

    private dropCoin(binding: StationBinding, orderId: string): void {
        const gold = Math.max(1, goldOf(orderId));
        binding.station.slot = new ItemStack(COIN_ID, gold);
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

    private tickHold(dt: number): void {
        const hold = this._hold;
        if (!hold) {
            return;
        }
        const runtime = this.findById(hold.guestId);
        const follow = hold.kind === "seat"
            ? (hold.tableId ? this.registry.get(hold.tableId)?.node : null)
            : runtime?.layout.guestNode;
        if (!runtime || !follow || this.playerTooFar(follow)) {
            this.cancelHold();
            return;
        }
        hold.elapsed += dt;
        this._escort.setProgress(hold.elapsed / hold.duration);
        if (hold.elapsed < hold.duration) {
            return;
        }
        this._escort.hideBar();
        this._hold = null;
        if (hold.kind === "confirm") {
            this.confirmEscort(runtime);
            return;
        }
        if (hold.tableId) {
            this.seatEscort(runtime, hold.tableId);
        }
    }

    private confirmEscort(runtime: GuestRuntime): void {
        runtime.fsm.waitEscort();
        runtime.fsm.confirmEscort();
        runtime.agent.stop();
        this._escortId = runtime.guest.id;
        EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "已确认引座，带到空圆桌");
        console.log("[Guest] 已确认引座", runtime.guest.id);
    }

    private leaveQueue(runtime: GuestRuntime): void {
        const index = this._queue.indexOf(runtime);
        if (index >= 0) {
            this._queue.splice(index, 1);
        }
    }

    private seatEscort(runtime: GuestRuntime, tableId: string): void {
        const table = this.registry.get(tableId);
        if (!table || this.tableBusy(tableId)) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "这张圆桌已经有客人了");
            return;
        }
        const seat = findNamedDescendant(table.node, "SeatPoint");
        if (!seat) {
            console.warn("[Guest] 圆桌没有 SeatPoint", tableId);
            return;
        }
        const def = findGuestDef(runtime.layout.guestType);
        runtime.layout.seatPoint = seat;
        runtime.layout.table = table;
        runtime.guest.tableId = table.station.id;
        runtime.fsm.goSeat();
        runtime.agent.arriveRadius = SEAT_ARRIVE;
        if (runtime.view) {
            runtime.view.enabled = true;
        }
        this.setAnimPlaying(runtime.layout.guestNode, true);
        this.leaveQueue(runtime);
        runtime.agent.goto(seat.worldPosition);
        this.repackQueue();
        this.gatherEmptyRegularSeats();
        this.flushFreeSeats();
        if (def?.markPrefab) {
            this._escort.showMark(tableId, def.markPrefab, table.node);
        }
        if (this._escortId === runtime.guest.id) {
            this._escortId = null;
        }
        EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "客人正在入座");
        console.log("[Guest] 引座入座", runtime.guest.id, tableId);
    }

    private tableBusy(tableId: string): boolean {
        for (let i = 0; i < this._runtimes.length; i++) {
            const guest = this._runtimes[i].guest;
            if (guest.tableId !== tableId) {
                continue;
            }
            if (guest.state === "entering" || guest.state === "seated" || guest.state === "reacting") {
                return true;
            }
        }
        return false;
    }

    private playerTooFar(target: Node): boolean {
        const player = this._player;
        if (!player) {
            return false;
        }
        const a = player.worldPosition;
        const b = target.worldPosition;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return dx * dx + dz * dz > HOLD_RANGE * HOLD_RANGE;
    }

    private findById(guestId: string): GuestRuntime | null {
        for (let i = 0; i < this._runtimes.length; i++) {
            if (this._runtimes[i].guest.id === guestId) {
                return this._runtimes[i];
            }
        }
        return null;
    }

    private findByNode(hit: Node): GuestRuntime | null {
        let current: Node | null = hit;
        while (current) {
            for (let i = 0; i < this._runtimes.length; i++) {
                if (this._runtimes[i].layout.guestNode === current) {
                    return this._runtimes[i];
                }
            }
            current = current.parent;
        }
        return null;
    }
}
