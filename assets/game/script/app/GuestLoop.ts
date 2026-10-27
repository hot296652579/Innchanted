import { AnimationClip, Camera, instantiate, Node, Prefab, SkeletalAnimation, Vec3 } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { Guest, GuestState, WaitSignal } from "../domain/Guest";
import { COIN_ID, ItemStack } from "../domain/ItemStack";
import { occupyRoundTable, RoundSeatVerdict, vacateRoundTable } from "../domain/RoundTableSeat";
import { StationType } from "../domain/Station";
import { GuestFsm } from "../fsm/GuestFsm";
import { DiningLayout, GuestPlan, planGuests, scanHall } from "../sim/DiningHall";
import { GridAgent } from "../sim/GridAgent";
import { RecastPathfinder } from "../sim/RecastPathfinder";
import { findNamedDescendant, StationBinding, StationRegistry } from "../sim/StationRegistry";
import { EscortView } from "../view/EscortView";
import { ExpressionKind, GuestExpressionView } from "../view/GuestExpressionView";
import { GuestOrderView } from "../view/GuestOrderView";
import { PlayerView } from "../view/PlayerView";
import { findGuestDef, GuestDef, guestPrefabPath, isEscortGuest } from "./GuestCatalog";
import { goldOf } from "./ItemCatalog";

const SPAWN_GAP = 1;
const SEAT_ARRIVE = 1.0;
const QUEUE_ARRIVE = 0.35;
const WAIT_GAP = 1.6;
const HOLD_RANGE_SQ = 2.2 * 2.2;
const CLIP_STAND = 0;
const CLIP_EAT = 2;
const EAT_FACE_SEC = 1;
const AGENT = {
    radius: 0.4,
    height: 1.6,
    maxAcceleration: 10,
    maxSpeed: 3.2,
    collisionQueryRange: 1.2,
    pathOptimizationRange: 4,
    separationWeight: 1,
};
const PLAYER_TALK = "player";
const TALK_ASK = "我该坐哪里?";
const TALK_LEAD = "跟我来~";
const ROUND_TIPS: Record<RoundSeatVerdict, string> = {
    match: "入座正确",
    mismatch: "入座错误",
    pending: "客人正在入座",
};
const _waitPos = new Vec3();
const _waitBack = new Vec3();

/** 一个在场客人：场景节点、领域数据、状态机、寻路、吃饭倒计时。 */
interface GuestRuntime {
    layout: DiningLayout;
    guest: Guest;
    fsm: GuestFsm;
    view: PlayerView | null;
    agent: GridAgent;
    eatLeft: number;
    lined: boolean;
}

export enum ServeResult {
    Next = "next",
    Done = "done",
    Wake = "wake",
}

enum HoldKind {
    Confirm = "confirm",
    Seat = "seat",
}

type SeatSlot = { seat: Node; table: StationBinding };
type Hold = { kind: HoldKind; guestId: string; tableId?: string; elapsed: number; duration: number };
type PendingGuest = GuestPlan & { prefab: Prefab };

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
    private _leavePoint: Node | null = null;
    private _spawnAt: Node | null = null;
    private _guestFolder: Node | null = null;
    private readonly _pending: PendingGuest[] = [];
    private _spawnWait = 0;
    private _spawnGap = SPAWN_GAP;
    private _spawned = 0;
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
        this._orders = new GuestOrderView();
        this._faces = new GuestExpressionView(camera);
        this._escort = new EscortView(camera);
    }

    /** 预加载订单食物、表情、引座标识、金币预设。 */
    async load(): Promise<void> {
        await this._orders.load();
        await this._faces.load();
        await this._escort.load();
        this._coinPrefab = await ResourceManager.getInstance().loadPrefab("prefab/items/Coin", BundlesEnum.Game);
        if (!this._coinPrefab) {
            console.warn("[Guest] 未找到 prefab/items/Coin");
        }
    }

    /** 按关卡 delay 等待后，按 guestInterval 从 GuestSwapnPoint 出一个客人。 */
    async start(
        levelRoot: Node,
        stationRoot: Node,
        yawOffset: number,
        player?: Node | null,
        guestIds?: string[],
        guestDelay?: number,
        guestInterval?: number,
    ): Promise<void> {
        this._yawOffset = yawOffset;
        this._player = player ?? null;
        this._spawnGap = Math.max(0.1, guestInterval ?? SPAWN_GAP);
        this.resetShift();
        const hall = scanHall(levelRoot, stationRoot, this.registry);
        if (!hall) {
            console.warn("[Guest] 缺少 Table / SeatPoint / LeavePoint");
            return;
        }
        this._leavePoint = hall.leavePoint;
        this._waitPoint = hall.waitPoint;
        this._spawnAt = findNamedDescendant(levelRoot, "GuestSwapnPoint")
            ?? findNamedDescendant(levelRoot, "GuestSpawnPoint");
        if (!this._spawnAt) {
            console.warn("[Guest] 场景里没有 GuestSwapnPoint");
            return;
        }
        this._guestFolder = this.ensureGuestFolder(levelRoot);
        this.hidePlaced(this._guestFolder);
        this.captureQueueDir();
        const pending = await this.prepareGuests(guestIds ?? [], hall.slots);
        if (pending.some((item) => item.waitInLine) && !hall.waitPoint) {
            console.warn("[Guest] 有人没座位，但缺少 WaitPoint");
        }
        this._pending.push(...pending);
        this._spawnWait = Math.max(0, guestDelay ?? 0);
        console.log(`[Guest] ${this._spawnWait}s 后出场，间隔 ${this._spawnGap}s，共 ${pending.length} 人`);
    }

    /** 每帧：头顶 UI、引座长按、每个客人的走路/等待/吃饭。 */
    update(dt: number): void {
        this.tickSpawn(dt);
        this._orders.tick(dt);
        this._faces.tick(dt);
        this._faces.update();
        this._escort.update();
        this.tickHold(dt);
        this.releaseLine();
        for (let i = this._runtimes.length - 1; i >= 0; i--) {
            const runtime = this._runtimes[i];
            this.tickRuntime(runtime, dt);
            const table = runtime.layout.table;
            if (table) {
                this._escort.followMark(table.station.id, table.node);
            }
        }
    }

    /** 点到的是否是还在排队、可被引座的客人。 */
    canEscortPick(node: Node): boolean {
        const runtime = this.findByNode(node);
        return !!runtime && isEscortGuest(runtime.layout.guestType) && runtime.guest.atWait;
    }

    /** 开始长按确认引座客，进度条跟在客人头上。 */
    beginConfirmHold(guestId: string): boolean {
        const runtime = this.findById(guestId);
        if (!runtime || !this.canEscortPick(runtime.layout.guestNode)) {
            return false;
        }
        return this.startHold(HoldKind.Confirm, runtime, runtime.layout.guestNode, this.defOf(runtime)?.confirmTime ?? 0.5);
    }

    /** 已确认的引座客，长按空圆桌把他带过去入座。 */
    beginSeatHold(binding: StationBinding): boolean {
        if (binding.station.type !== StationType.RoundTable) {
            return false;
        }
        const runtime = this._escortId ? this.findById(this._escortId) : null;
        if (!runtime || runtime.guest.state !== GuestState.Escorted) {
            return false;
        }
        if (this.tableBusy(binding.station.id)) {
            this.tip("这张圆桌已经有客人了");
            return true;
        }
        return this.startHold(HoldKind.Seat, runtime, binding.node, this.defOf(runtime)?.seatTime ?? 1, binding.station.id);
    }

    /** 松开或走远时取消当前长按，进度条消失。 */
    cancelHold(): void {
        this._hold = null;
        this._escort.hideBar();
    }

    /** 这张桌现在要什么：睡着要解药，醒着要当前订单。对不上返回 null。 */
    wantedAt(tableId: string, itemId?: string | null): string | null {
        const guest = this.seatedAt(tableId);
        if (!guest) {
            return null;
        }
        const want = guest.wantedId;
        if (itemId && itemId !== want) {
            return null;
        }
        return want;
    }

    /** 这张桌的客人是否正在睡觉（这时不能上菜，只能上解药）。 */
    asleepAt(tableId: string): boolean {
        return !!this.seatedAt(tableId)?.sleeping;
    }

    /** 这张桌有没有已经坐下的客人。 */
    hasSeated(tableId: string): boolean {
        return this.seatedAt(tableId) !== null;
    }

    /** 这张桌是否被客人占着（去坐、坐着、反应中）。 */
    hasGuestAt(tableId: string): boolean {
        return this.tableBusy(tableId);
    }

    /** 已入座或正在反应的客人位置，给恐吓怪冲过去。 */
    occupiedSeat(): { tableId: string; world: Vec3 } | null {
        const runtime = this.scareTarget();
        if (!runtime) {
            return null;
        }
        const node = runtime.layout.seatPoint ?? runtime.layout.guestNode;
        return { tableId: runtime.guest.tableId, world: node.worldPosition.clone() };
    }

    /** 所有已入座或正在反应的客人位置，给多个攻击怪分目标。 */
    occupiedSeats(): { tableId: string; world: Vec3 }[] {
        const list: { tableId: string; world: Vec3 }[] = [];
        for (let i = 0; i < this._runtimes.length; i++) {
            const runtime = this._runtimes[i];
            const guest = runtime.guest;
            if (guest.state !== GuestState.Seated && guest.state !== GuestState.Reacting) {
                continue;
            }
            const node = runtime.layout.seatPoint ?? runtime.layout.guestNode;
            list.push({ tableId: guest.tableId, world: node.worldPosition.clone() });
        }
        return list;
    }

    /** 恐吓吓跑：播害怕表情后走离席。 */
    scareAway(tableId: string): boolean {
        const runtime = this.scareTarget(tableId);
        if (!runtime || !runtime.fsm.scare()) {
            return false;
        }
        this.hideOrder(runtime.guest.id);
        this._faces.hideSleep(runtime.guest.id);
        runtime.eatLeft = 0;
        this._faces.play(runtime.guest.id, this.headOf(runtime), "scared", () => {
            this.walkOut(runtime);
        });
        return true;
    }

    playFace(id: string, follow: Node, kind: string): void {
        if (!this.isFace(kind)) {
            return;
        }
        this._faces.play(id, follow, kind);
    }

    playFaceAt(id: string, world: Vec3, kind: string): void {
        if (!this.isFace(kind)) {
            return;
        }
        this._faces.playAtWorld(id, world, kind);
    }

    hideFace(id: string): void {
        this._faces.hide(id);
    }

    /** 台上物品给这桌客人：解药则叫醒，对上订单则推进或付钱离开。 */
    tryServe(binding: StationBinding): ServeResult | null {
        const itemId = binding.station.slot?.itemId;
        if (!itemId) {
            return null;
        }
        for (let i = 0; i < this._runtimes.length; i++) {
            const runtime = this._runtimes[i];
            const guest = runtime.guest;
            if (guest.tableId !== binding.station.id) {
                continue;
            }
            if (guest.canWake(itemId)) {
                this.takeSlot(binding);
                guest.wake();
                this._faces.hideSleep(guest.id);
                this._faces.play(guest.id, this.headOf(runtime), "wake");
                return ServeResult.Wake;
            }
            if (!guest.canAccept(itemId)) {
                continue;
            }
            this.takeSlot(binding);
            if (guest.advanceOrder()) {
                this.showOrder(runtime);
                return ServeResult.Next;
            }
            if (!runtime.fsm.serve()) {
                return null;
            }
            this.dropCoin(binding, guest.orderIds);
            this.hideOrder(guest.id);
            this.eatThenLeave(runtime);
            this.emit(GameEvent.GUEST_SERVED, guest.id, guest.orderId);
            this.emit(GameEvent.SHELL_SPAWNED, binding.station.id);
            return ServeResult.Done;
        }
        return null;
    }

    private async prepareGuests(guestIds: string[], slots: SeatSlot[]): Promise<PendingGuest[]> {
        const types: string[] = [];
        const prefabs = new Map<string, Prefab>();
        const res = ResourceManager.getInstance();
        for (let i = 0; i < guestIds.length; i++) {
            const def = findGuestDef(guestIds[i]);
            if (!def) {
                console.warn("[Guest] 关卡客人未配置", guestIds[i]);
                continue;
            }
            if (!prefabs.has(def.id)) {
                const path = guestPrefabPath(def);
                const prefab = await res.loadPrefab(path, BundlesEnum.Game);
                if (!prefab) {
                    console.warn("[Guest] 未找到", path);
                    continue;
                }
                prefabs.set(def.id, prefab);
            }
            types.push(def.id);
        }
        const plans = planGuests(types, slots);
        const pending: PendingGuest[] = [];
        for (let i = 0; i < plans.length; i++) {
            const prefab = prefabs.get(plans[i].guestType);
            if (!prefab) {
                continue;
            }
            pending.push({ ...plans[i], prefab });
        }
        return pending;
    }

    private tickSpawn(dt: number): void {
        if (this._pending.length === 0) {
            return;
        }
        this._spawnWait -= dt;
        if (this._spawnWait <= 0) {
            this.spawnNext();
        }
    }

    private spawnNext(): void {
        const item = this._pending.shift();
        const spawn = this._spawnAt;
        const folder = this._guestFolder;
        const leave = this._leavePoint;
        if (!item || !spawn || !folder || !leave) {
            return;
        }
        const node = instantiate(item.prefab);
        node.name = `${item.guestType}_${this._spawned}`;
        this._spawned += 1;
        folder.addChild(node);
        node.setWorldPosition(spawn.worldPosition);
        node.setWorldRotation(spawn.worldRotation);
        node.active = true;
        const layout: DiningLayout = {
            guestNode: node,
            guestType: item.guestType,
            leavePoint: leave,
            seatPoint: item.seatPoint,
            table: item.table,
        };
        this.spawn(layout, item.waitInLine);
        this._spawnWait = this._pending.length > 0 ? this._spawnGap : 0;
    }

    private ensureGuestFolder(levelRoot: Node): Node {
        const existing = findNamedDescendant(levelRoot, "Guests");
        if (existing) {
            return existing;
        }
        const folder = new Node("Guests");
        levelRoot.addChild(folder);
        return folder;
    }

    private hidePlaced(folder: Node): void {
        const placed = folder.children.slice();
        for (let i = 0; i < placed.length; i++) {
            placed[i].active = false;
        }
    }

    /** 按配置生成一个客人：挂寻路，排队或直接去座位。 */
    private spawn(layout: DiningLayout, waitInLine: boolean): void {
        const def = findGuestDef(layout.guestType);
        if (!def) {
            console.warn("[Guest] 没有配置", layout.guestNode.name, layout.guestType);
            return;
        }
        const node = layout.guestNode;
        const guest = new Guest(node.name, def);
        guest.tableId = layout.table?.station.id ?? "";
        const fsm = new GuestFsm(guest);
        this._orders.bind(guest.id, node);
        node.mobility = 2;
        const startPos = node.worldPosition.clone();
        const agentId = this.pathfinder.addAgent(startPos, AGENT);
        const agent = new GridAgent(this.pathfinder, agentId, SEAT_ARRIVE);
        const view = node.getComponent(PlayerView) ?? node.addComponent(PlayerView);
        view.bind(this.pathfinder, agentId, startPos.y - this.pathfinder.getPosition(agentId).y, this._yawOffset, 8);
        const runtime: GuestRuntime = { layout, guest, fsm, view, agent, eatLeft: 0, lined: false };
        this._runtimes.push(runtime);
        if (isEscortGuest(layout.guestType) && def.markPrefab) {
            void this._escort.ensureMark(def.markPrefab);
        }
        if (waitInLine) {
            fsm.queue();
            agent.arriveRadius = QUEUE_ARRIVE;
            this._queue.push(runtime);
            this.releaseLine();
            console.log("[Guest] 排队", guest.id, guest.orderId);
            return;
        }
        if (layout.seatPoint && layout.table) {
            this.sendToSeat(runtime, layout.seatPoint, layout.table);
        }
    }

    /** 单个客人：吃饭结束离席、走到点坐下/离开、催单/睡觉/超时。 */
    private tickRuntime(runtime: GuestRuntime, dt: number): void {
        if (runtime.eatLeft > 0) {
            runtime.eatLeft -= dt;
            if (runtime.eatLeft <= 0) {
                this.walkOut(runtime);
            }
            return;
        }
        if (runtime.agent.arrived()) {
            const guest = runtime.guest;
            if (guest.atWait && !runtime.layout.table) {
                if (!runtime.lined) {
                    return;
                }
                runtime.agent.stop();
                this.faceWaitLine(runtime.layout.guestNode);
                this.showEscortAsk(runtime);
                return;
            }
            if (guest.state === GuestState.Entering) {
                this.sit(runtime);
                return;
            }
            if (guest.state === GuestState.Leaving) {
                this.finishLeave(runtime);
                return;
            }
        }
        this.applyWait(runtime, runtime.guest.tickWait(dt));
    }

    /** 走到座位：贴座位、面向桌子、亮订单，桌上已有对的菜就直接吃。 */
    private sit(runtime: GuestRuntime): void {
        const { layout, fsm, agent } = runtime;
        if (!layout.seatPoint || !layout.table) {
            return;
        }
        agent.stop();
        this.setWalking(runtime, false);
        const pos = layout.seatPoint.worldPosition;
        layout.guestNode.setWorldPosition(pos.x, pos.y, pos.z);
        this.face(layout.guestNode, layout.table.node.worldPosition);
        this.playClip(layout.guestNode, CLIP_STAND, true);
        fsm.sit();
        this.showOrder(runtime);
        this.tryServe(layout.table);
    }

    /** 头顶显示当前订单；一次性提示客会在 hintTime 后收起订单、持续显示问号。 */
    private showOrder(runtime: GuestRuntime): void {
        const def = this.defOf(runtime);
        const guestId = runtime.guest.id;
        this._faces.hideHint(guestId);
        this._orders.show(guestId, runtime.guest.orderId, def?.hintTime ?? 0, () => {
            this._faces.showHint(guestId, this.headOf(runtime));
        });
        this.emit(GameEvent.ORDER_SHOWN, guestId, runtime.guest.orderId);
    }

    private hideOrder(guestId: string): void {
        this._orders.hide(guestId);
        this._faces.hideHint(guestId);
    }

    /** 订单全部上完：播吃饭，开心表情，吃完再走。 */
    private eatThenLeave(runtime: GuestRuntime): void {
        runtime.eatLeft = Math.max(this.playClip(runtime.layout.guestNode, CLIP_EAT, false), EAT_FACE_SEC);
        this.react(runtime, "happy");
    }

    /** 头顶播表情。生气播完后离席。 */
    private react(runtime: GuestRuntime, kind: "happy" | "urge" | "angry"): void {
        this._faces.play(runtime.guest.id, this.headOf(runtime), kind, () => {
            if (kind === "angry") {
                this.walkOut(runtime);
            }
        });
    }

    /** 去 LeavePoint：清表情/圆桌占用，普通桌空出来后让排队的普通人入座。 */
    private walkOut(runtime: GuestRuntime): void {
        const { leavePoint, seatPoint, table } = runtime.layout;
        runtime.fsm.leave();
        this.clearEscort(runtime.guest.id);
        this._faces.hide(runtime.guest.id);
        runtime.eatLeft = 0;
        this.setWalking(runtime, true);
        runtime.agent.goto(leavePoint.worldPosition);
        if (table) {
            this._escort.hideMark(table.station.id);
            if (table.station.type === StationType.RoundTable) {
                vacateRoundTable(table.station);
            }
        }
        if (seatPoint && table?.station.type === StationType.Table) {
            this.trySeatRegulars();
        }
    }

    /** 走到出口：停寻路、销毁节点，通知客人已离开。 */
    private finishLeave(runtime: GuestRuntime): void {
        runtime.agent.stop();
        runtime.fsm.finish();
        this._faces.hide(runtime.guest.id);
        this._orders.hide(runtime.guest.id);
        this.clearEscort(runtime.guest.id);
        const queue = this._queue.indexOf(runtime);
        if (queue >= 0) {
            this._queue.splice(queue, 1);
        }
        const index = this._runtimes.indexOf(runtime);
        if (index >= 0) {
            this._runtimes.splice(index, 1);
        }
        const node = runtime.layout.guestNode;
        if (node.isValid) {
            node.destroy();
        }
        this.emit(GameEvent.GUEST_LEFT, runtime.guest.id);
    }

    /** 长按计时：走远取消；满了则确认引座或把客人送上圆桌。 */
    private tickHold(dt: number): void {
        const hold = this._hold;
        if (!hold) {
            return;
        }
        const runtime = this.findById(hold.guestId);
        const follow = hold.kind === HoldKind.Seat
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
        if (hold.kind === HoldKind.Confirm) {
            runtime.fsm.confirmEscort();
            runtime.agent.stop();
            this._escortId = runtime.guest.id;
            this._faces.hideTalk(runtime.guest.id);
            this.showPlayerLead();
            this.tip("已确认引座，带到空圆桌");
            return;
        }
        if (hold.tableId) {
            this.seatEscort(runtime, hold.tableId);
        }
    }

    /** 引座客入圆桌：离队、走座位、亮桌标，由圆桌判断邻座对错。 */
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
        const mark = this.defOf(runtime)?.markPrefab;
        if (mark) {
            this._escort.showMark(tableId, mark, table.node);
        }
        this.clearEscort(runtime.guest.id);
        const verdict = occupyRoundTable(
            table.station,
            runtime.layout.guestType,
            this.registry.all.map((binding) => binding.station),
        );
        this.tip(ROUND_TIPS[verdict]);
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

    /** 指定座位并寻路过去，状态改成 entering。 */
    private sendToSeat(runtime: GuestRuntime, seat: Node, table: StationBinding): void {
        runtime.layout.seatPoint = seat;
        runtime.layout.table = table;
        runtime.guest.tableId = table.station.id;
        runtime.fsm.goSeat();
        runtime.agent.arriveRadius = SEAT_ARRIVE;
        this.setWalking(runtime, true);
        runtime.agent.goto(seat.worldPosition);
    }

    private resetShift(): void {
        this._runtimes.length = 0;
        this._queue.length = 0;
        this._freeSeats.length = 0;
        this._pending.length = 0;
        this._spawnWait = 0;
        this._spawned = 0;
        this._hold = null;
        this._escortId = null;
        this._faces.hideTalk(PLAYER_TALK);
        this._escort.clear();
    }

    private applyWait(runtime: GuestRuntime, signal: WaitSignal | null): void {
        if (signal === WaitSignal.Urge) {
            this.react(runtime, "urge");
            return;
        }
        if (signal === WaitSignal.Sleep) {
            const path = this.defOf(runtime)?.sleepPrefab;
            if (path) {
                this._faces.showSleep(runtime.guest.id, this.headOf(runtime), path);
            }
            return;
        }
        if (signal === WaitSignal.Timeout && runtime.fsm.timeout()) {
            this.hideOrder(runtime.guest.id);
            this.react(runtime, "angry");
            this.emit(GameEvent.GUEST_ANGRY, runtime.guest.id);
        }
    }

    private startHold(kind: HoldKind, runtime: GuestRuntime, follow: Node, duration: number, tableId?: string): boolean {
        this._hold = { kind, guestId: runtime.guest.id, tableId, elapsed: 0, duration };
        this._escort.showBar(follow, 0);
        return true;
    }

    private collectEmptyTables(): void {
        this._freeSeats.length = 0;
        const taken = new Set<string>();
        for (let i = 0; i < this._runtimes.length; i++) {
            const runtime = this._runtimes[i];
            const table = runtime.layout.table;
            if (table?.station.type === StationType.Table && runtime.guest.usingTable) {
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

    private leaveQueue(runtime: GuestRuntime): void {
        const index = this._queue.indexOf(runtime);
        if (index >= 0) {
            this._queue.splice(index, 1);
        }
    }

    private releaseLine(): void {
        if (!this._waitPoint) {
            return;
        }
        for (let i = 0; i < this._queue.length; i++) {
            const runtime = this._queue[i];
            if (runtime.lined) {
                continue;
            }
            if (i > 0 && !this.lineOpen(this._queue[i - 1])) {
                return;
            }
            runtime.lined = true;
            runtime.agent.goto(this.waitSlot(this._waitPoint, i));
            this.setWalking(runtime, true);
        }
    }

    /** 前一个人已经离开出生点够远，后一个才能朝自己的排队位走。 */
    private lineOpen(front: GuestRuntime): boolean {
        if (!front.lined) {
            return false;
        }
        if (front.agent.arrived()) {
            return true;
        }
        const spawn = this._spawnAt?.worldPosition;
        if (!spawn) {
            return true;
        }
        const pos = front.layout.guestNode.worldPosition;
        const dx = pos.x - spawn.x;
        const dz = pos.z - spawn.z;
        return dx * dx + dz * dz >= WAIT_GAP * WAIT_GAP;
    }

    private repackQueue(): void {
        if (!this._waitPoint) {
            return;
        }
        for (let i = 0; i < this._queue.length; i++) {
            const runtime = this._queue[i];
            if (!runtime.lined) {
                continue;
            }
            runtime.agent.goto(this.waitSlot(this._waitPoint, i));
            this.setWalking(runtime, true);
        }
        this.releaseLine();
    }

    private captureQueueDir(): void {
        const wait = this._waitPoint;
        const spawn = this._spawnAt;
        if (!wait) {
            return;
        }
        const origin = wait.worldPosition;
        if (spawn) {
            const p = spawn.worldPosition;
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
        let gap = WAIT_GAP * index;
        for (let step = 0; step < 6; step++) {
            _waitPos.set(
                origin.x + this._queueDir.x * gap,
                origin.y,
                origin.z + this._queueDir.z * gap,
            );
            if (index === 0) {
                return _waitPos;
            }
            const snap = this.pathfinder.snap(_waitPos);
            const along = (snap.x - origin.x) * this._queueDir.x + (snap.z - origin.z) * this._queueDir.z;
            if (along >= WAIT_GAP * index * 0.7) {
                _waitPos.set(snap.x, origin.y, snap.z);
                return _waitPos;
            }
            gap += WAIT_GAP;
        }
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
        binding.station.slot = new ItemStack(COIN_ID, Math.max(1, gold));
        if (!this._coinPrefab) {
            return;
        }
        const coin = instantiate(this._coinPrefab);
        coin.name = "Coin";
        binding.holdPoint.addChild(coin);
        coin.setPosition(0, 0, 0);
        coin.mobility = 2;
    }

    private takeSlot(binding: StationBinding): void {
        binding.holdPoint.children.slice().forEach((kid) => kid.destroy());
        binding.station.slot = null;
    }

    private setWalking(runtime: GuestRuntime, walking: boolean): void {
        if (!runtime.view) {
            return;
        }
        runtime.view.enabled = walking;
        if (walking) {
            runtime.view.resumeLoco();
        }
    }

    private seatedAt(tableId: string): Guest | null {
        for (let i = 0; i < this._runtimes.length; i++) {
            const guest = this._runtimes[i].guest;
            if (guest.seated && guest.tableId === tableId) {
                return guest;
            }
        }
        return null;
    }

    private scareTarget(tableId?: string): GuestRuntime | null {
        for (let i = 0; i < this._runtimes.length; i++) {
            const runtime = this._runtimes[i];
            const guest = runtime.guest;
            if (tableId && guest.tableId !== tableId) {
                continue;
            }
            if (guest.state === GuestState.Seated || guest.state === GuestState.Reacting) {
                return runtime;
            }
        }
        return null;
    }

    private isFace(kind: string): kind is ExpressionKind {
        return kind === "happy" || kind === "urge" || kind === "angry" || kind === "wake"
            || kind === "hint" || kind === "scared" || kind === "threaten"
            || kind === "attention" || kind === "death";
    }

    private tableBusy(tableId: string): boolean {
        return this._runtimes.some((runtime) => runtime.guest.tableId === tableId && runtime.guest.usingTable);
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

    private defOf(runtime: GuestRuntime): GuestDef | null {
        return findGuestDef(runtime.layout.guestType);
    }

    private headOf(runtime: GuestRuntime): Node {
        return this._orders.followPoint(runtime.guest.id) ?? runtime.layout.guestNode;
    }

    private showEscortAsk(runtime: GuestRuntime): void {
        if (!isEscortGuest(runtime.layout.guestType) || runtime.guest.state === GuestState.Escorted) {
            return;
        }
        if (this._queue[0] !== runtime) {
            this._faces.hideTalk(runtime.guest.id);
            return;
        }
        this._faces.showTalk(runtime.guest.id, this.headOf(runtime), TALK_ASK);
    }

    private showPlayerLead(): void {
        const follow = this.playerHead();
        if (!follow) {
            return;
        }
        this._faces.showTalk(PLAYER_TALK, follow, TALK_LEAD, 100);
    }

    private playerHead(): Node | null {
        return this._player?.getChildByName("HoldPoint") ?? this._player;
    }

    private clearEscort(guestId: string): void {
        if (this._escortId === guestId) {
            this._escortId = null;
            this._faces.hideTalk(PLAYER_TALK);
        }
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

    private emit(name: string, ...args: unknown[]): void {
        EventManager.getInstance().emit(name, ...args);
    }

    private tip(text: string): void {
        this.emit(GameEvent.SHOW_TIPS, text);
    }
}
