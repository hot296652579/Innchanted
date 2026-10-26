import { Camera, Component, Node, Vec3 } from "cc";
import { BattleContext } from "../../../define/BattleContext";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ConfigManager } from "../../../framework/config/ConfigManager";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { Actor } from "../domain/Actor";
import { ShiftScore } from "../domain/ShiftScore";
import { CommandFsm } from "../fsm/CommandFsm";
import RecastDetourManager from "../navmesh/recastdetourjs/tool/RecastDetourManager";
import { GridAgent } from "../sim/GridAgent";
import { RecastPathfinder } from "../sim/RecastPathfinder";
import { findNamedDescendant, StationRegistry } from "../sim/StationRegistry";
import { Enemy } from "../view/Enemy";
import { FxView } from "../view/FxView";
import { GroundIceView } from "../view/GroundIceView";
import { ItemHoldView } from "../view/ItemHoldView";
import { PlayerView } from "../view/PlayerView";
import { WhirlwindView } from "../view/WhirlwindView";
import { BarrelSystem } from "./BarrelSystem";
import { ClickHit, ClickPicker } from "./ClickPicker";
import { CombineCatalog } from "./Combine";
import { CommandService } from "./CommandService";
import { allEventDefs } from "./EventCatalog";
import { EventDirector } from "./EventDirector";
import { GuestLoop } from "./GuestLoop";
import { InteractService } from "./InteractService";
import { findLevel } from "./LevelCatalog";
import { ProcessorSystem } from "./ProcessorSystem";

export interface ShiftStartArgs {
    recast: RecastDetourManager;
    host: Component;
    player: Node;
    stationRoot: Node;
    camera: Camera;
    yawOffset: number;
    turnSpeed: number;
    levelRoot: Node;
    planeRoot: Node | null;
}

/** 一局班次的编排入口：开局、每帧推进。不写配方、不写寻路细节。 */
export class ShiftController {
    private readonly _registry = new StationRegistry();
    private _pathfinder: RecastPathfinder | null = null;
    private _actor: Actor | null = null;
    private _fsm: CommandFsm | null = null;
    private _commands: CommandService | null = null;
    private _playerView: PlayerView | null = null;
    private _processors: ProcessorSystem | null = null;
    private _barrels: BarrelSystem | null = null;
    private _guests: GuestLoop | null = null;
    private _interact: InteractService | null = null;
    private _events: EventDirector | null = null;
    private _winds: WhirlwindView | null = null;
    private _score: ShiftScore | null = null;
    private _huntId: string | null = null;
    private _huntRetarget = 0;
    private _levelRoot: Node | null = null;
    private _ice: GroundIceView | null = null;
    private _fx: FxView | null = null;
    private _playerAgentId = -1;

    async start(args: ShiftStartArgs): Promise<void> {
        await ConfigManager.getInstance().loadTable("items", BundlesEnum.Table);
        await ConfigManager.getInstance().loadTable("recipes", BundlesEnum.Table);
        await ConfigManager.getInstance().loadTable("guests", BundlesEnum.Table);
        await ConfigManager.getInstance().loadTable("events", BundlesEnum.Table);
        await ConfigManager.getInstance().loadTable("combines", BundlesEnum.Table);
        await ConfigManager.getInstance().loadTable("levels", BundlesEnum.Table);

        this._registry.scan(args.stationRoot);
        this._pathfinder = new RecastPathfinder(args.recast);
        this.spawnPlayer(args);

        const holds = new ItemHoldView(this.requireHold(args.player));
        holds.capture(this._registry);

        this._fx = new FxView();
        await this._fx.load();

        this._processors = new ProcessorSystem(args.camera, this._registry, this._fx);
        await this._processors.load();

        this._barrels = new BarrelSystem(args.camera, this._registry, this._actor!, this.requireHold(args.player), this._playerView!);
        await this._barrels.load();

        const level = findLevel(BattleContext.selectedLevelId);
        this._guests = new GuestLoop(this._pathfinder, this._registry, args.camera);
        await this._guests.load();
        await this._guests.start(
            args.levelRoot,
            args.stationRoot,
            args.yawOffset,
            args.player,
            level.guests,
            level.delay,
            level.guestInterval,
        );

        const combines = new CombineCatalog();
        await combines.load();

        this._winds = new WhirlwindView();
        this._interact = new InteractService(this._actor!, holds, this._processors, this._barrels, combines, this._guests, this._playerView!, this._fx, this._winds);
        this.bindScore();
        this._score = new ShiftScore(level.duration);
        this.emitHud();
        this._events = new EventDirector();
        this._events.start({
            registry: this._registry,
            processors: this._processors!,
            levelRoot: args.levelRoot,
            pathfinder: this._pathfinder!,
            yawOffset: args.yawOffset,
            stealGold: (count) => this.onStolen(count),
            stealFuel: (count) => this._barrels?.stealCharges(count) ?? 0,
            occupiedSeat: () => this._guests?.occupiedSeat() ?? null,
            occupiedSeats: () => this._guests?.occupiedSeats() ?? [],
            scareGuest: (tableId) => this._guests?.scareAway(tableId) ?? false,
            showFace: (id, follow, kind) => this._guests?.playFace(id, follow, kind),
            hideFace: (id) => this._guests?.hideFace(id),
            windStations: (types, count, unlockItemId, prefab) =>
                this._winds?.seal(this._registry, types, count, unlockItemId, prefab) ?? Promise.resolve(0),
            burstFx: (host, key, duration, worldFrom, liftY) =>
                this._fx?.burst(host, key, duration, worldFrom, liftY),
            camera: args.camera,
        }, level.eventIds);
        this.tagEnemies(args.levelRoot);
        this.bindClick(args);
        await this.bindIce(args.planeRoot);
        console.log(`[Shift] 就绪 关卡 ${level.id} ${level.duration}s 台子 ${this._registry.all.length} 个`);
    }

    update(dt: number): void {
        this._pathfinder?.update(dt);
        this._fsm?.update(dt);
        this._processors?.tick(dt);
        this._processors?.update();
        this._barrels?.tick(dt);
        this._guests?.update(dt);
        this._winds?.update();
        this._events?.update(dt);
        this.tickHunt(dt);
        this._ice?.update(dt);
        this._fx?.tick(dt);
        this.tickScore(dt);
    }

    clear(): void {
        const events = EventManager.getInstance();
        events.off(GameEvent.SHELL_BANKED, this.onBanked, this);
        events.off(GameEvent.GROUND_ICE_FREEZE, this.onIceFreeze, this);
        events.off(GameEvent.GROUND_ICE_THAW, this.onIceThaw, this);
        this._huntId = null;
        this._playerAgentId = -1;
        this._ice?.clear();
        this._ice = null;
        this._fx?.clear();
        this._fx = null;
        this._events?.clear();
        this._winds?.clear();
        this._winds = null;
        this._barrels?.cancel();
        this._processors?.clearLocks();
        this._processors?.clearBroken();
        this._registry.clear();
        this._score = null;
    }

    private spawnPlayer(args: ShiftStartArgs): void {
        const pathfinder = this._pathfinder!;
        const startPos = args.player.worldPosition.clone();
        this._actor = new Actor("player");
        const agentId = pathfinder.addAgent(startPos, {
            radius: 0.45,
            height: 1.6,
            maxAcceleration: 12,
            maxSpeed: this._actor.speed,
            collisionQueryRange: 1.2,
            pathOptimizationRange: 4,
            separationWeight: 1,
        });
        this._playerAgentId = agentId;
        const agentPos = pathfinder.getPosition(agentId);
        const yOffset = startPos.y - agentPos.y;
        args.player.setWorldPosition(agentPos.x, agentPos.y + yOffset, agentPos.z);
        args.player.mobility = 2;

        const agent = new GridAgent(pathfinder, agentId);
        this._fsm = new CommandFsm(agent);
        this._commands = new CommandService(this._fsm);
        this._playerView = args.player.getComponent(PlayerView) ?? args.player.addComponent(PlayerView);
        this._playerView.bind(pathfinder, agentId, yOffset, args.yawOffset, args.turnSpeed);
    }

    private bindClick(args: ShiftStartArgs): void {
        const picker = args.host.getComponent(ClickPicker) ?? args.host.addComponent(ClickPicker);
        picker.camera = args.camera;
        picker.player = args.player;
        picker.stationRoot = args.stationRoot;
        picker.planeRoot = args.planeRoot;
        picker.levelRoot = args.levelRoot;
        picker.guestRoot = findNamedDescendant(args.levelRoot, "Guests");
        picker.canPickGuest = (node) => this._guests?.canEscortPick(node) ?? false;
        picker.registry = this._registry;
        picker.onHit = (hit) => this.onClick(hit);
    }

    private onClick(hit: ClickHit): void {
        if (!this._commands || !this._actor) {
            return;
        }
        if (hit.target.kind === "self") {
            this._guests?.cancelHold();
            console.log("[Drink] onClick self", "interact", !!this._interact, "hand", this._actor.hand);
            this._huntId = null;
            this._barrels?.cancel();
            this._commands.issue(hit.target, null, null);
            this._playerView?.lockFacing();
            const drank = this._interact?.useSelf() ?? false;
            console.log("[Drink] useSelf 结果", drank);
            return;
        }
        this._playerView?.unlockFacing();
        if (hit.lookAt) {
            this._playerView?.setLookTarget(hit.lookAt);
        } else {
            this._playerView?.clearLookTarget();
        }
        if (hit.target.kind === "enemy") {
            if (this.handsBusy()) {
                EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "先把手里的东西放下再打");
                return;
            }
            this._barrels?.cancel();
            const enemyId = hit.target.enemyId;
            this._huntId = enemyId;
            this._huntRetarget = 0;
            const dest = this.enemyStand(enemyId) ?? hit.dest;
            this._commands.issue(hit.target, dest, () => this.onArriveEnemy(enemyId));
            return;
        }
        this._huntId = null;
        this._guests?.cancelHold();
        if (hit.target.kind === "guest") {
            this._barrels?.cancel();
            const guestId = hit.target.guestId;
            this._commands.issue(hit.target, hit.dest, () => this._guests?.beginConfirmHold(guestId));
            return;
        }
        if (hit.target.kind === "place" && !this.handsBusy() && this._events?.scareAt(hit.target.stationId)) {
            this._barrels?.cancel();
            this._playerView?.playAttack();
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "赶走了小偷");
            return;
        }
        if (hit.target.kind === "place" && this._barrels?.isAccepting(hit.target.stationId)) {
            return;
        }
        this._barrels?.cancel();
        this._commands.issue(hit.target, hit.dest, () => this.onArrive(hit));
    }

    private onArrive(hit: ClickHit): void {
        if (hit.target.kind === "enemy") {
            this.onArriveEnemy(hit.target.enemyId);
            return;
        }
        if (hit.target.kind === "guest") {
            this._guests?.beginConfirmHold(hit.target.guestId);
            return;
        }
        if (!this._interact || hit.target.kind !== "place") {
            return;
        }
        const binding = this._registry.get(hit.target.stationId);
        if (!binding) {
            return;
        }
        if (this._guests?.beginSeatHold(binding)) {
            return;
        }
        this._interact.arrive(binding);
    }

    private tickHunt(dt: number): void {
        if (!this._huntId || !this._commands) {
            return;
        }
        if (this.handsBusy()) {
            this._huntId = null;
            return;
        }
        this._huntRetarget -= dt;
        if (this._huntRetarget > 0) {
            return;
        }
        this._huntRetarget = 0.2;
        const enemyId = this._huntId;
        const root = this.findEnemyNode(enemyId);
        const player = this._playerView?.node;
        if (!root || !player) {
            this._huntId = null;
            return;
        }
        const dx = player.worldPosition.x - root.worldPosition.x;
        const dz = player.worldPosition.z - root.worldPosition.z;
        if (dx * dx + dz * dz <= 4) {
            this.onArriveEnemy(enemyId);
            return;
        }
        const dest = this.enemyStand(enemyId);
        if (!dest) {
            this._huntId = null;
            return;
        }
        this._playerView?.setLookTarget(root.worldPosition);
        this._commands.issue({ kind: "enemy", enemyId }, dest, () => this.onArriveEnemy(enemyId));
    }

    private onArriveEnemy(enemyId: string): void {
        const root = this.findEnemyNode(enemyId);
        const player = this._playerView?.node;
        if (!root || !player || !this._commands) {
            this._huntId = null;
            return;
        }
        const from = player.worldPosition;
        const center = root.worldPosition;
        const dx = from.x - center.x;
        const dz = from.z - center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > 2) {
            const dest = this.enemyStand(enemyId);
            if (dest) {
                this._playerView?.setLookTarget(center);
                this._commands.issue({ kind: "enemy", enemyId }, dest, () => this.onArriveEnemy(enemyId));
            }
            return;
        }
        if (this.handsBusy()) {
            this._huntId = null;
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "先把手里的东西放下再打");
            return;
        }
        this._huntId = null;
        this._playerView?.setLookTarget(center);
        this._playerView?.playAttack();
        if (this._events?.strike(root)) {
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "击退了小偷");
        }
    }

    private handsBusy(): boolean {
        const hand = this._actor?.hand;
        return !!hand && !hand.empty;
    }

    private async bindIce(planeRoot: Node | null): Promise<void> {
        this._ice = new GroundIceView();
        await this._ice.bind(planeRoot);
        const events = EventManager.getInstance();
        events.on(GameEvent.GROUND_ICE_FREEZE, this.onIceFreeze, this);
        events.on(GameEvent.GROUND_ICE_THAW, this.onIceThaw, this);
    }

    private onIceFreeze(duration?: number): void {
        this._ice?.freeze(typeof duration === "number" ? duration : 1);
        this.applyWalkScale(this.iceSlowScale());
    }

    private onIceThaw(duration?: number): void {
        this._ice?.thaw(typeof duration === "number" ? duration : 1);
        this.applyWalkScale(1);
    }

    private applyWalkScale(scale: number): void {
        const base = this._actor?.speed ?? 4.5;
        this._pathfinder?.setMaxSpeed?.(this._playerAgentId, base * scale);
    }

    private iceSlowScale(): number {
        const defs = allEventDefs();
        for (let i = 0; i < defs.length; i++) {
            if (defs[i].kind === "ice") {
                return defs[i].slowScale ?? 0.4;
            }
        }
        return 0.4;
    }

    private tagEnemies(levelRoot: Node): void {
        this._levelRoot = levelRoot;
        const defs = allEventDefs();
        for (let i = 0; i < defs.length; i++) {
            if (defs[i].category !== "attack") {
                continue;
            }
            const name = defs[i].actorName;
            if (!name) {
                continue;
            }
            const node = findNamedDescendant(levelRoot, name);
            if (node) {
                Enemy.ensure(node);
            }
        }
    }

    private findEnemyNode(enemyId: string): Node | null {
        if (!this._levelRoot) {
            return null;
        }
        const tags = this._levelRoot.getComponentsInChildren(Enemy);
        for (let i = 0; i < tags.length; i++) {
            const node = tags[i].node;
            if (node.name === enemyId && node.activeInHierarchy) {
                return node;
            }
        }
        return null;
    }

    private enemyStand(enemyId: string): Vec3 | null {
        const root = this.findEnemyNode(enemyId);
        const player = this._playerView?.node;
        if (!root || !player) {
            return null;
        }
        const from = player.worldPosition;
        const center = root.worldPosition;
        const dx = from.x - center.x;
        const dz = from.z - center.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        const nx = dist < 0.001 ? 0 : dx / dist;
        const nz = dist < 0.001 ? 1 : dz / dist;
        return new Vec3(center.x + nx * 1.2, from.y, center.z + nz * 1.2);
    }

    private bindScore(): void {
        EventManager.getInstance().on(GameEvent.SHELL_BANKED, this.onBanked, this);
    }

    private onBanked(count: number): void {
        this._score?.bank(count);
        this.emitGold();
    }

    private onStolen(count: number): number {
        const took = this._score?.steal(count) ?? 0;
        if (took > 0) {
            this.emitGold();
        }
        return took;
    }

    private tickScore(dt: number): void {
        const score = this._score;
        if (!score) {
            return;
        }
        const { secondChanged, timeUp } = score.tick(dt);
        if (secondChanged) {
            EventManager.getInstance().emit(GameEvent.LEVEL_TIME_CHANGED, score.shownRemain, score.duration);
        }
        if (timeUp) {
            EventManager.getInstance().emit(GameEvent.LEVEL_TIME_UP);
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "时间到");
            console.log("[Shift] 时间到 入箱", score.gold);
        }
    }

    private emitHud(): void {
        const score = this._score;
        if (!score) {
            return;
        }
        EventManager.getInstance().emit(GameEvent.LEVEL_TIME_CHANGED, score.shownRemain, score.duration);
        this.emitGold();
    }

    private emitGold(): void {
        EventManager.getInstance().emit(GameEvent.LEVEL_GOLD_CHANGED, this._score?.gold ?? 0);
    }

    private requireHold(player: Node): Node {
        let hold = player.getChildByName("HoldPoint");
        if (!hold) {
            hold = new Node("HoldPoint");
            player.addChild(hold);
            hold.setPosition(0, 0.5, 0.5);
            console.warn("[Shift] 没有 HoldPoint，已在玩家根节点下创建");
        }
        hold.mobility = 2;
        return hold;
    }
}
