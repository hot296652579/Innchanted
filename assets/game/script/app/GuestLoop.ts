import { AnimationClip, Camera, instantiate, Node, Prefab, SkeletalAnimation, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { Guest } from "../domain/Guest";
import { COIN_ID, ItemStack } from "../domain/ItemStack";
import { occupyRoundTable, vacateRoundTable } from "../domain/RoundTableSeat";
import { StationType } from "../domain/Station";
import { GuestFsm } from "../fsm/GuestFsm";
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
const HOLD_RANGE_SQ = 2.2 * 2.2;
const CLIP_STAND = 0;
const CLIP_EAT = 2;
const EAT_FACE_SEC = 1;
const USING_TABLE = new Set(["entering", "seated", "reacting"]);
const AT_WAIT = new Set(["queuing", "waitingEscort", "escorted"]);
const _waitPos = new Vec3();
const _waitBack = new Vec3();

interface GuestRuntime {
    layout: DiningLayout;
    guest: Guest;
    fsm: GuestFsm;
    view: PlayerView | null;
    agent: GridAgent;
    eatLeft: number;
}

type SeatSlot = { seat: Node; table: StationBinding };
type Hold = { kind: "confirm" | "seat"; guestId: string; tableId?: string; elapsed: number; duration: number };

/** 客人：普通桌自动入座；引座客挡住队尾，入座离开等待点后普通客再去空桌。 */
export class GuestLoop {
    private readonly _orders: GuestOrderView;
    private readonly _faces: GuestExpressionView;
    private readonly _escort: EscortView;
    private readonly _runtimes: GuestRuntime[] = [];
    private readonly _queue: GuestRuntime[] = [];
    private readonly _freeSeats: SeatSlot[] = [];
    private readonly _queueDir = new Vec3(0, 0, -1);
    private _waitPoint: Node | null = null;
    private _coinPrefab: Prefab | null = null;
    private _yawOffset = 0;
    private _player: Node | null = null;
    private _hold: Hold | null = null;
    private _escortId: string | null = null;

    constructor(
        private readonly pathfinder: RecastPathfinder,
        private readonly registry: StationRegistry,
        camera: Camera | null,
    ) {
        this._orders = new GuestOrderView(camera);
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
        scan.seated.forEach((layout) => this.spawn(layout, false));
        if (scan.waiting.length > 0 && !scan.waitPoint) {
            console.warn("[Guest] 有人没座位，但缺少 WaitPoint");
        }
        scan.waiting.forEach((layout) => this.spawn(layout, true));
        this.repackQueue();
        console.log(
            `[Guest] 就绪 入座 ${scan.seated.map((g) => g.guestNode.name).join(", ") || "无"}`,
            `排队 ${scan.waiting.map((g) => g.guestNode.name).join(", ") || "无"}`,
        );
    }

    update(dt: number): void {
        this._orders.tick(dt);
        this._orders.update();
        this._faces.tick(dt);
        this._faces.update();
        this._escort.update();
        this.tickHold(dt);
        for (let i = 0; i < this._runtimes.length; i++) {
            const runtime = this._runtimes[i];
            this.tickRuntime(runtime, dt);
            const table = runtime.layout.table;
            if (table) {
                this._escort.followMark(table.station.id, table.node);
            }
        }
    }

    canEscortPick(node: Node): boolean {
        const runtime = this.findByNode(node);
        return !!runtime && isEscortGuest(runtime.layout.guestType) && AT_WAIT.has(runtime.guest.state);
    }

    beginConfirmHold(guestId: string): boolean {
        const runtime = this.findById(guestId);
        if (!runtime || !this.canEscortPick(runtime.layout.guestNode)) {
            return false;
        }
        return this.startHold("confirm", runtime, runtime.layout.guestNode, findGuestDef(runtime.layout.guestType)?.confirmTime ?? 0.5);
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
            this.tip("这张圆桌已经有客人了");
            return true;
        }
        return this.startHold("seat", runtime, binding.node, findGuestDef(runtime.layout.guestType)?.seatTime ?? 1, binding.station.id);
    }

    cancelHold(): void {
        this._hold = null;
        this._escort.hideBar();
    }

    wantedAt(tableId: string, itemId?: string | null): string | null {
        for (let i = 0; i < this._runtimes.length; i++) {
            const guest = this._runtimes[i].guest;
            if (guest.state === "seated" && guest.tableId === tableId && (!itemId || guest.orderId === itemId)) {
                return guest.orderId;
            }
        }
        return null;
    }

    hasSeated(tableId: string): boolean {
        return this.wantedAt(tableId) !== null;
    }

    tryServe(binding: StationBinding): "next" | "done" | null {
        const slot = binding.station.slot;
        if (!slot) {
            return null;
        }
        for (let i = 0; i < this._runtimes.length; i++) {
            const runtime = this._runtimes[i];
            const guest = runtime.guest;
            if (guest.tableId !== binding.station.id || !guest.canAccept(slot.itemId)) {
                continue;
            }
            this.clearKids(binding.holdPoint);
            binding.station.slot = null;
            if (guest.advanceOrder()) {
                this.showOrder(runtime);
                return "next";
            }
            if (!runtime.fsm.serve()) {
                return null;
            }
            this.dropCoin(binding, guest.orderIds);
            this._orders.hide(guest.id);
            this.eatThenLeave(runtime);
            EventManager.getInstance().emit(GameEvent.GUEST_SERVED, guest.id, guest.orderId);
            EventManager.getInstance().emit(GameEvent.SHELL_SPAWNED, binding.station.id);
            return "done";
        }
        return null;
    }

    private spawn(layout: DiningLayout, waitInLine: boolean): void {
        const def = findGuestDef(layout.guestType);
        if (!def) {
            console.warn("[Guest] 没有配置", layout.guestNode.name, layout.guestType);
            return;
        }
        const guest = new Guest(layout.guestNode.name, def);
        guest.tableId = layout.table?.station.id ?? "";
        const fsm = new GuestFsm(guest);
        this._orders.bind(guest.id, layout.guestNode);

        const node = layout.guestNode;
        node.mobility = 2;
        const startPos = node.worldPosition.clone();
        const agentId = this.pathfinder.addAgent(startPos, {
            radius: 0.4,
            height: 1.6,
            maxAcceleration: 10,
            maxSpeed: 3.2,
            collisionQueryRange: 1.2,
            pathOptimizationRange: 4,
            separationWeight: 1,
        });
        const agent = new GridAgent(this.pathfinder, agentId, SEAT_ARRIVE);
        const view = node.getComponent(PlayerView) ?? node.addComponent(PlayerView);
        view.bind(this.pathfinder, agentId, startPos.y - this.pathfinder.getPosition(agentId).y, this._yawOffset, 8);
        const runtime: GuestRuntime = { layout, guest, fsm, view, agent, eatLeft: 0 };
        this._runtimes.push(runtime);
        if (isEscortGuest(layout.guestType) && def.markPrefab) {
            void this._escort.ensureMark(def.markPrefab);
        }
        if (waitInLine) {
            fsm.queue();
            agent.arriveRadius = QUEUE_ARRIVE;
            this._queue.push(runtime);
            console.log("[Guest] 排队", guest.id, guest.orderId);
            return;
        }
        if (layout.seatPoint && layout.table) {
            this.sendToSeat(runtime, layout.seatPoint, layout.table);
        }
    }

    private tickRuntime(runtime: GuestRuntime, dt: number): void {
        if (runtime.eatLeft > 0) {
            runtime.eatLeft -= dt;
            if (runtime.eatLeft <= 0) {
                this.walkOut(runtime);
            }
            return;
        }
        if (AT_WAIT.has(runtime.guest.state) && !runtime.layout.table && runtime.agent.arrived()) {
            runtime.agent.stop();
            this.faceWaitLine(runtime.layout.guestNode);
            return;
        }
        if (runtime.guest.state === "entering" && runtime.agent.arrived()) {
            this.sit(runtime);
            return;
        }
        if (runtime.guest.state === "leaving" && runtime.agent.arrived()) {
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
        const { layout, fsm, view, agent } = runtime;
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
        this.playClip(layout.guestNode, CLIP_STAND, true);
        fsm.sit();
        this.showOrder(runtime);
        this.tryServe(layout.table);
    }

    private showOrder(runtime: GuestRuntime): void {
        const def = findGuestDef(runtime.layout.guestType);
        this._orders.show(runtime.guest.id, runtime.guest.orderId, def?.hintPrefab, def?.hintTime ?? 0);
        EventManager.getInstance().emit(GameEvent.ORDER_SHOWN, runtime.guest.id, runtime.guest.orderId);
    }

    private eatThenLeave(runtime: GuestRuntime): void {
        const eatSec = this.playClip(runtime.layout.guestNode, CLIP_EAT, false);
        runtime.eatLeft = Math.max(eatSec, EAT_FACE_SEC);
        this.react(runtime, "happy");
    }

    private react(runtime: GuestRuntime, kind: "happy" | "urge" | "angry"): void {
        const follow = this._orders.followPoint(runtime.guest.id) ?? runtime.layout.guestNode;
        this._faces.play(runtime.guest.id, follow, kind, () => {
            if (kind === "angry") {
                this.walkOut(runtime);
            }
        });
    }

    private walkOut(runtime: GuestRuntime): void {
        const { leavePoint, seatPoint, table } = runtime.layout;
        runtime.fsm.leave();
        if (this._escortId === runtime.guest.id) {
            this._escortId = null;
        }
        this._faces.hide(runtime.guest.id);
        runtime.eatLeft = 0;
        if (runtime.view) {
            runtime.view.enabled = true;
            runtime.view.resumeLoco();
        }
        runtime.agent.goto(leavePoint.worldPosition);
        if (table) {
            this._escort.hideMark(table.station.id);
            if (table.station.type === StationType.RoundTable) {
                vacateRoundTable(table.station);
            }
        }
        if (seatPoint && table?.station.type === StationType.Table) {
            this._freeSeats.push({ seat: seatPoint, table });
            this.trySeatRegulars();
        }
    }

    private finishLeave(runtime: GuestRuntime): void {
        runtime.agent.stop();
        runtime.fsm.finish();
        runtime.layout.guestNode.active = false;
        EventManager.getInstance().emit(GameEvent.GUEST_LEFT, runtime.guest.id);
    }

    private startHold(kind: Hold["kind"], runtime: GuestRuntime, follow: Node, duration: number, tableId?: string): boolean {
        this._hold = { kind, guestId: runtime.guest.id, tableId, elapsed: 0, duration };
        this._escort.showBar(follow, 0);
        return true;
    }

    private tickHold(dt: number): void {
        const hold = this._hold;
        if (!hold) {
            return;
        }
        const runtime = this.findById(hold.guestId);
        const follow = hold.kind === "seat"
            ? this.registry.get(hold.tableId ?? "")?.node
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
        this.cancelHold();
        if (hold.kind === "confirm") {
            runtime.fsm.confirmEscort();
            runtime.agent.stop();
            this._escortId = runtime.guest.id;
            this.tip("已确认引座，带到空圆桌");
            return;
        }
        if (hold.tableId) {
            this.seatEscort(runtime, hold.tableId);
        }
    }

    private seatEscort(runtime: GuestRuntime, tableId: string): void {
        const table = this.registry.get(tableId);
        const seat = table ? findNamedDescendant(table.node, "SeatPoint") : null;
        if (!table || !seat || this.tableBusy(tableId)) {
            this.tip("这张圆桌已经有客人了");
            return;
        }
        this.leaveQueue(runtime);
        this.sendToSeat(runtime, seat, table);
        this.repackQueue();
        this.trySeatRegulars();
        const mark = findGuestDef(runtime.layout.guestType)?.markPrefab;
        if (mark) {
            this._escort.showMark(tableId, mark, table.node);
        }
        if (this._escortId === runtime.guest.id) {
            this._escortId = null;
        }
        const verdict = occupyRoundTable(
            table.station,
            runtime.layout.guestType,
            this.registry.all.map((binding) => binding.station),
        );
        if (verdict === "match") {
            this.tip("入座正确");
        } else if (verdict === "mismatch") {
            this.tip("入座错误");
        } else {
            this.tip("客人正在入座");
        }
    }

    /** 队首仍是引座客则后面的人不动；引座客离开等待点后，普通人去空普通桌。 */
    private trySeatRegulars(): void {
        this.collectEmptyTables();
        while (this._freeSeats.length > 0) {
            const head = this._queue[0];
            if (!head || isEscortGuest(head.layout.guestType)) {
                return;
            }
            const slot = this._freeSeats.shift()!;
            this._queue.shift();
            this.sendToSeat(head, slot.seat, slot.table);
            this.repackQueue();
        }
    }

    private collectEmptyTables(): void {
        const taken = new Set<string>();
        for (let i = 0; i < this._freeSeats.length; i++) {
            taken.add(this._freeSeats[i].table.station.id);
        }
        for (let i = 0; i < this._runtimes.length; i++) {
            const runtime = this._runtimes[i];
            const table = runtime.layout.table;
            if (table?.station.type === StationType.Table && USING_TABLE.has(runtime.guest.state)) {
                taken.add(table.station.id);
            }
        }
        for (let i = 0; i < this.registry.all.length; i++) {
            const binding = this.registry.all[i];
            if (binding.station.type !== StationType.Table || taken.has(binding.station.id)) {
                continue;
            }
            const seat = findNamedDescendant(binding.node, "SeatPoint");
            if (seat) {
                this._freeSeats.push({ seat, table: binding });
            }
        }
    }

    private sendToSeat(runtime: GuestRuntime, seat: Node, table: StationBinding): void {
        runtime.layout.seatPoint = seat;
        runtime.layout.table = table;
        runtime.guest.tableId = table.station.id;
        runtime.fsm.goSeat();
        runtime.agent.arriveRadius = SEAT_ARRIVE;
        if (runtime.view) {
            runtime.view.enabled = true;
            runtime.view.resumeLoco();
        }
        runtime.agent.goto(seat.worldPosition);
    }

    private leaveQueue(runtime: GuestRuntime): void {
        const index = this._queue.indexOf(runtime);
        if (index >= 0) {
            this._queue.splice(index, 1);
        }
    }

    private repackQueue(): void {
        if (!this._waitPoint) {
            return;
        }
        for (let i = 0; i < this._queue.length; i++) {
            this._queue[i].agent.goto(this.waitSlot(this._waitPoint, i));
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
        _waitPos.set(origin.x + this._queueDir.x * WAIT_GAP * index, origin.y, origin.z + this._queueDir.z * WAIT_GAP * index);
        return _waitPos;
    }

    private faceWaitLine(node: Node): void {
        if (!this._waitPoint) {
            return;
        }
        const look = this._waitPoint.worldPosition.clone();
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

    private playClip(guestNode: Node, slot: number, loop: boolean): number {
        const anim = guestNode.getComponentInChildren(SkeletalAnimation);
        const clip = anim?.clips?.[slot];
        if (!anim || !clip) {
            return 0;
        }
        anim.play(clip.name);
        const state = anim.getState(clip.name);
        if (state) {
            state.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        }
        return state?.duration > 0 ? state.duration : 0.4;
    }

    private dropCoin(binding: StationBinding, orderIds: string[]): void {
        let gold = 0;
        for (let i = 0; i < orderIds.length; i++) {
            gold += goldOf(orderIds[i]);
        }
        gold = Math.max(1, gold);
        binding.station.slot = new ItemStack(COIN_ID, gold);
        if (!this._coinPrefab) {
            return;
        }
        const coin = instantiate(this._coinPrefab);
        coin.name = "Coin";
        binding.holdPoint.addChild(coin);
        coin.setPosition(0, 0, 0);
        coin.mobility = 2;
    }

    private clearKids(hold: Node): void {
        hold.children.slice().forEach((kid) => kid.destroy());
    }

    private tableBusy(tableId: string): boolean {
        return this._runtimes.some((runtime) => runtime.guest.tableId === tableId && USING_TABLE.has(runtime.guest.state));
    }

    private playerTooFar(target: Node): boolean {
        if (!this._player) {
            return false;
        }
        const a = this._player.worldPosition;
        const b = target.worldPosition;
        const dx = a.x - b.x;
        const dz = a.z - b.z;
        return dx * dx + dz * dz > HOLD_RANGE_SQ;
    }

    private findById(guestId: string): GuestRuntime | null {
        return this._runtimes.find((runtime) => runtime.guest.id === guestId) ?? null;
    }

    private findByNode(hit: Node): GuestRuntime | null {
        let current: Node | null = hit;
        while (current) {
            const found = this._runtimes.find((runtime) => runtime.layout.guestNode === current);
            if (found) {
                return found;
            }
            current = current.parent;
        }
        return null;
    }

    private tip(text: string): void {
        EventManager.getInstance().emit(GameEvent.SHOW_TIPS, text);
    }
}
