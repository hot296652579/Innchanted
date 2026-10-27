import { instantiate, Node, Prefab, tween, Tween, Vec3 } from "cc";
import { BundlesEnum } from "../../../../define/BundlesEnum";
import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { ResourceManager } from "../../../../framework/resource/ResourceManager";
import { findNamedDescendant, StationBinding } from "../../sim/StationRegistry";
import { Enemy } from "../../view/Enemy";
import { RaiderView } from "../../view/RaiderView";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext, OccupiedSeat, showDeathMark } from "./Incident";

type Phase = "boot" | "run" | "done";
type UnitPhase = "smoke" | "appearing" | "toStation" | "hitStation" | "toGuest" | "scare" | "toLeave" | "dying";

const SMOKE_SEC = 1;
const SMOKE_LIFT = 1.4;
const STATION_GAP = 1.4;
const STATION_GAPS = [1.4, 2.0, 2.6, 3.4];
const ARRIVE_STATION = 2.4;
const ARRIVE_STUCK = 4.2;
const STUCK_SEC = 0.35;
const GUEST_GAP = 1.05;
const FILL_GAP = 0.2;
const DEFAULT_GOALS = ["station", "guest"];
const DEFAULT_TYPES = ["cook", "place", "itemstand"];
const DEFAULT_PREFABS = ["prefab/enemys/AttackEnemy1", "prefab/enemys/AttackEnemy2"];

/** 攻击怪不选这些台。后续加条件往这张表里写。 */
const STATION_BLOCKS: Array<(binding: StationBinding) => boolean> = [
    (binding) => !binding.node.isValid,
    (binding) => binding.station.broken,
    (binding) => binding.station.winded,
];

interface Unit {
    id: number;
    view: RaiderView;
    actor: Node | null;
    spawn: Node;
    phase: UnitPhase;
    remain: number;
    hitsLeft: number;
    stuck: number;
    retried: boolean;
    station: StationBinding | null;
    seat: OccupiedSeat | null;
}

/** 攻击怪：AttackPoints 冒烟后出现，按 goals 砸台再吓人，没目标走 LeavePoint。 */
export class RaiderIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private _phase: Phase = "done";
    private readonly _units: Unit[] = [];
    private _spawns: Node[] = [];
    private _leave: Node | null = null;
    private _enemyPrefabs: Prefab[] = [];
    private _spawnWait = 0;
    private _hitUnit: Unit | null = null;
    private _nextId = 1;

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(ctx: IncidentContext): void {
        this._ctx = ctx;
        if (!ctx.pathfinder) {
            console.warn("[Event] 攻击怪没有寻路");
            this._phase = "done";
            return;
        }
        const folder = this.findSpawnFolder(ctx);
        if (!folder) {
            console.warn("[Event] 场景里没有", this.def.spawnName ?? "AttackPoints");
            this._phase = "done";
            return;
        }
        this._spawns = folder.children.length > 0 ? folder.children.slice() : [folder];
        this._leave = findNamedDescendant(ctx.levelRoot, "LeavePoint");
        this._phase = "boot";
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_WARN, this.def.id, 0);
        if (this.def.warnText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.warnText);
        }
        void this.boot();
    }

    ownsNode(hit: Node): Node | null {
        for (let i = 0; i < this._units.length; i++) {
            const unit = this._units[i];
            if (!this.isAlive(unit) || !unit.actor) {
                continue;
            }
            let current: Node | null = hit;
            while (current) {
                if (current === unit.actor) {
                    this._hitUnit = unit;
                    return unit.actor;
                }
                current = current.parent;
            }
        }
        return null;
    }

    strike(): boolean {
        const unit = this._hitUnit;
        this._hitUnit = null;
        if (!unit || !this.isAlive(unit)) {
            return false;
        }
        this.hideFace(unit);
        showDeathMark(this._ctx, unit.actor, `${this.def.id}_${unit.actor?.uuid ?? "x"}`);
        unit.remain = Math.max(0.6, unit.view.playDeath() + 0.15);
        unit.phase = "dying";
        unit.station = null;
        unit.seat = null;
        console.log("[Event] 击杀", this.def.id);
        return true;
    }

    tick(dt: number): void {
        if (this._phase !== "run") {
            return;
        }
        for (let i = this._units.length - 1; i >= 0; i--) {
            this.tickUnit(this._units[i], dt);
        }
        this._spawnWait -= dt;
        if (this._spawnWait <= 0) {
            this.trySpawn();
        }
    }

    cancel(): void {
        for (let i = this._units.length - 1; i >= 0; i--) {
            this.removeUnit(this._units[i], false);
        }
        this._units.length = 0;
        this._phase = "done";
    }

    private async boot(): Promise<void> {
        const res = ResourceManager.getInstance();
        const paths = this.def.prefabs?.length ? this.def.prefabs : (this.def.prefab ? [this.def.prefab] : DEFAULT_PREFABS);
        const loaded: Prefab[] = [];
        for (let i = 0; i < paths.length; i++) {
            const prefab = await res.loadPrefab(paths[i], BundlesEnum.Game);
            if (prefab) {
                loaded.push(prefab);
            } else {
                console.warn("[Event] 未找到", paths[i]);
            }
        }
        if (this._phase !== "boot") {
            return;
        }
        if (loaded.length === 0) {
            console.warn("[Event] 攻击怪没有可用预设");
            this._phase = "done";
            return;
        }
        this._enemyPrefabs = loaded;
        this._phase = "run";
        this._spawnWait = 0;
        this.trySpawn();
    }

    private trySpawn(): void {
        if (this._phase !== "run" || this._units.length >= this.cap()) {
            return;
        }
        const spawn = this.pickSpawn();
        if (!spawn) {
            return;
        }
        this._ctx?.burstFx?.(spawn, "place", SMOKE_SEC, spawn, SMOKE_LIFT);
        const unit: Unit = {
            id: this._nextId++,
            view: new RaiderView(),
            actor: null,
            spawn,
            phase: "smoke",
            remain: SMOKE_SEC,
            hitsLeft: this.hitsNeed(),
            stuck: 0,
            retried: false,
            station: null,
            seat: null,
        };
        this._units.push(unit);
        this._spawnWait = this._units.length >= this.cap() ? this.interval() : FILL_GAP;
        console.log("[Event] 攻击怪冒烟", spawn.name, this._units.length, "/", this.cap());
    }

    private tickUnit(unit: Unit, dt: number): void {
        if (unit.phase === "smoke") {
            unit.remain -= dt;
            if (unit.remain <= 0) {
                unit.phase = "appearing";
                void this.appear(unit);
            }
            return;
        }
        if (unit.phase === "appearing") {
            if (unit.actor) {
                this.assignGoal(unit);
            }
            return;
        }
        unit.view.tick(dt);
        if (unit.phase === "dying") {
            unit.remain -= dt;
            if (unit.remain <= 0) {
                this.removeUnit(unit, true);
            }
            return;
        }
        if (unit.phase === "toStation") {
            if (!this.stationValid(unit.station)) {
                this.assignGoal(unit);
            } else {
                this.tickTravel(unit, dt, this.atStation(unit), () => {
                    this.startHit(unit);
                });
            }
            return;
        }
        if (unit.phase === "hitStation") {
            if (!this.stationValid(unit.station)) {
                this.assignGoal(unit);
                return;
            }
            unit.remain -= dt;
            if (unit.remain <= 0) {
                this.applyHit(unit);
            }
            return;
        }
        if (unit.phase === "toGuest") {
            const seat = unit.seat;
            if (!this.guestValid(seat) || !seat) {
                this.assignGoal(unit);
            } else {
                this.tickTravel(unit, dt, this.closeEnough(unit, seat.world, ARRIVE_STUCK) || unit.view.arrived(), () => {
                    this.startScare(unit);
                });
            }
            return;
        }
        if (unit.phase === "scare") {
            unit.remain -= dt;
            if (unit.remain <= 0) {
                this.hideFace(unit);
                this.assignGoal(unit);
            }
            return;
        }
        if (unit.phase === "toLeave") {
            this.tickTravel(unit, dt, unit.view.arrived() || this.nearLeave(unit), () => {
                this.removeUnit(unit, true);
            });
        }
    }

    private async appear(unit: Unit): Promise<void> {
        const ctx = this._ctx;
        if (this._phase !== "run" || !ctx?.pathfinder || this._units.indexOf(unit) < 0) {
            return;
        }
        const prefab = this._enemyPrefabs[Math.floor(Math.random() * this._enemyPrefabs.length)];
        const actor = instantiate(prefab);
        actor.name = `${this.def.actorName ?? "AttackEnemy"}_${unit.id}`;
        ctx.levelRoot.addChild(actor);
        actor.setWorldPosition(unit.spawn.worldPosition);
        actor.setWorldRotation(unit.spawn.worldRotation);
        actor.active = true;
        Enemy.ensure(actor);
        if (this._phase !== "run" || this._units.indexOf(unit) < 0) {
            actor.destroy();
            return;
        }
        unit.actor = actor;
        unit.view.bind(actor, ctx.pathfinder, ctx.yawOffset ?? 0, this.def.flySpeed ?? 2.2);
        console.log("[Event] 攻击怪出现", unit.spawn.name);
    }

    private assignGoal(unit: Unit): void {
        unit.station = null;
        unit.seat = null;
        const goals = this.def.goals?.length ? this.def.goals : DEFAULT_GOALS;
        for (let i = 0; i < goals.length; i++) {
            const goal = goals[i];
            if (goal === "station") {
                const station = this.pickStation(unit);
                if (station) {
                    this.goStation(unit, station);
                    return;
                }
            } else if (goal === "guest") {
                const seat = this.pickGuest(unit);
                if (seat) {
                    this.goGuest(unit, seat);
                    return;
                }
            }
        }
        this.goLeave(unit);
    }

    private goStation(unit: Unit, station: StationBinding): void {
        unit.station = station;
        unit.hitsLeft = this.hitsNeed();
        unit.stuck = 0;
        unit.retried = false;
        unit.view.setLookTarget(station.node.worldPosition);
        unit.view.goto(this.stationStand(unit, station));
        unit.phase = "toStation";
        console.log("[Event] 攻击怪冲向操作台", station.station.id);
    }

    private startHit(unit: Unit): void {
        const station = unit.station;
        if (!this.stationValid(station) || !station) {
            this.assignGoal(unit);
            return;
        }
        unit.view.stop();
        unit.view.setLookTarget(station.node.worldPosition);
        unit.remain = unit.view.playAttack();
        unit.phase = "hitStation";
    }

    private applyHit(unit: Unit): void {
        const station = unit.station;
        if (!this.stationValid(station) || !station) {
            this.assignGoal(unit);
            return;
        }
        this.shake(station.node);
        unit.hitsLeft -= 1;
        if (unit.hitsLeft > 0) {
            this.startHit(unit);
            return;
        }
        if (this._ctx?.processors.markBroken(station)) {
            const events = EventManager.getInstance();
            events.emit(GameEvent.EVENT_FAIL, this.def.id, 1);
            events.emit(GameEvent.SHOW_TIPS, this.def.failText ?? "操作台被砸坏了！");
            console.log("[Event] 操作台被砸坏", station.station.id);
        }
        this.assignGoal(unit);
    }

    private goGuest(unit: Unit, seat: OccupiedSeat): void {
        unit.seat = seat;
        unit.stuck = 0;
        unit.retried = false;
        unit.view.setLookTarget(seat.world);
        unit.view.goto(this.standAt(unit, seat.world, GUEST_GAP));
        unit.phase = "toGuest";
        console.log("[Event] 攻击怪冲向客人", seat.tableId);
    }

    private startScare(unit: Unit): void {
        const seat = unit.seat;
        if (!seat) {
            this.assignGoal(unit);
            return;
        }
        unit.view.stop();
        unit.view.setLookTarget(seat.world);
        const scared = this._ctx?.scareGuest?.(seat.tableId) ?? false;
        unit.remain = unit.view.playAttack();
        unit.phase = "scare";
        unit.seat = null;
        if (!scared) {
            return;
        }
        const follow = unit.view.face ?? unit.actor;
        if (follow) {
            this._ctx?.showFace?.(this.faceId(unit), follow, "threaten");
        }
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_FAIL, this.def.id, 1);
        events.emit(GameEvent.SHOW_TIPS, "客人被吓跑了！");
        console.log("[Event] 攻击怪吓跑客人", seat.tableId);
    }

    private goLeave(unit: Unit): void {
        const leave = this._leave;
        if (!leave) {
            console.warn("[Event] 没有 LeavePoint，攻击怪就地离开");
            this.removeUnit(unit, true);
            return;
        }
        unit.stuck = 0;
        unit.retried = false;
        unit.view.setLookTarget(leave.worldPosition);
        unit.view.goto(leave.worldPosition);
        unit.phase = "toLeave";
        console.log("[Event] 攻击怪没有目标，走向 LeavePoint");
    }

    private pickStation(self: Unit): StationBinding | null {
        const ctx = this._ctx;
        if (!ctx) {
            return null;
        }
        const allow = this.def.stationTypes?.length ? this.def.stationTypes : DEFAULT_TYPES;
        const list: StationBinding[] = [];
        for (let i = 0; i < ctx.registry.all.length; i++) {
            const binding = ctx.registry.all[i];
            if (!this.stationValid(binding)) {
                continue;
            }
            if (allow.indexOf(binding.station.type) < 0) {
                continue;
            }
            if (this.claimedStation(binding.station.id, self)) {
                continue;
            }
            list.push(binding);
        }
        if (list.length === 0) {
            return null;
        }
        return list[Math.floor(Math.random() * list.length)];
    }

    private pickGuest(self: Unit): OccupiedSeat | null {
        const seats = this.listSeats();
        for (let i = 0; i < seats.length; i++) {
            const seat = seats[i];
            if (this.claimedGuest(seat.tableId, self)) {
                continue;
            }
            return seat;
        }
        return null;
    }

    private listSeats(): OccupiedSeat[] {
        const many = this._ctx?.occupiedSeats?.();
        if (many) {
            return many;
        }
        const one = this._ctx?.occupiedSeat?.() ?? null;
        return one ? [one] : [];
    }

    private stationValid(binding: StationBinding | null): binding is StationBinding {
        if (!binding) {
            return false;
        }
        for (let i = 0; i < STATION_BLOCKS.length; i++) {
            if (STATION_BLOCKS[i](binding)) {
                return false;
            }
        }
        return true;
    }

    private guestValid(seat: OccupiedSeat | null): boolean {
        if (!seat) {
            return false;
        }
        const seats = this.listSeats();
        for (let i = 0; i < seats.length; i++) {
            if (seats[i].tableId === seat.tableId) {
                return true;
            }
        }
        return false;
    }

    private claimedStation(id: string, self: Unit): boolean {
        for (let i = 0; i < this._units.length; i++) {
            const unit = this._units[i];
            if (unit === self) {
                continue;
            }
            if (unit.station?.station.id === id) {
                return true;
            }
        }
        return false;
    }

    private claimedGuest(tableId: string, self: Unit): boolean {
        for (let i = 0; i < this._units.length; i++) {
            const unit = this._units[i];
            if (unit === self) {
                continue;
            }
            if (unit.seat?.tableId === tableId) {
                return true;
            }
        }
        return false;
    }

    private pickSpawn(): Node | null {
        if (this._spawns.length === 0) {
            return null;
        }
        const used = new Set<Node>();
        for (let i = 0; i < this._units.length; i++) {
            used.add(this._units[i].spawn);
        }
        const free: Node[] = [];
        for (let i = 0; i < this._spawns.length; i++) {
            if (!used.has(this._spawns[i])) {
                free.push(this._spawns[i]);
            }
        }
        const pool = free.length > 0 ? free : this._spawns;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    private removeUnit(unit: Unit, schedule: boolean): void {
        this.hideFace(unit);
        unit.view.hide();
        if (unit.actor?.isValid) {
            unit.actor.destroy();
        }
        unit.actor = null;
        unit.station = null;
        unit.seat = null;
        const index = this._units.indexOf(unit);
        if (index >= 0) {
            this._units.splice(index, 1);
        }
        if (schedule && this._phase === "run") {
            this._spawnWait = Math.max(this._spawnWait, this.interval());
        }
    }

    private hideFace(unit: Unit): void {
        this._ctx?.hideFace?.(this.faceId(unit));
    }

    private faceId(unit: Unit): string {
        return unit.actor?.name ? `${unit.actor.name}_${unit.id}` : `raider_${unit.id}`;
    }

    private isAlive(unit: Unit): boolean {
        return unit.phase === "toStation"
            || unit.phase === "hitStation"
            || unit.phase === "toGuest"
            || unit.phase === "scare"
            || unit.phase === "toLeave";
    }

    private tickTravel(unit: Unit, dt: number, near: boolean, onArrive: () => void): void {
        if (near) {
            unit.stuck = 0;
            onArrive();
            return;
        }
        if (!unit.view.arrived() && !unit.view.idle()) {
            unit.stuck = 0;
            return;
        }
        unit.stuck += dt;
        if (unit.stuck < STUCK_SEC) {
            return;
        }
        unit.stuck = 0;
        if (unit.phase === "toStation" && this.atStation(unit, ARRIVE_STUCK)) {
            onArrive();
            return;
        }
        if (!unit.retried) {
            unit.retried = true;
            this.retryMove(unit);
            console.log("[Event] 攻击怪卡住，重寻路", unit.phase);
            return;
        }
        if (unit.phase === "toLeave") {
            this.removeUnit(unit, true);
            return;
        }
        this.assignGoal(unit);
    }

    private atStation(unit: Unit, range = ARRIVE_STATION): boolean {
        const station = unit.station;
        if (!station) {
            return false;
        }
        if (this.closeEnough(unit, station.node.worldPosition, range)) {
            return true;
        }
        return unit.view.arrived() && this.closeEnough(unit, station.node.worldPosition, ARRIVE_STUCK);
    }

    private retryMove(unit: Unit): void {
        if (unit.phase === "toStation" && unit.station) {
            unit.view.goto(this.stationStand(unit, unit.station));
            return;
        }
        if (unit.phase === "toGuest" && unit.seat) {
            unit.view.goto(this.standAt(unit, unit.seat.world, GUEST_GAP));
            return;
        }
        if (unit.phase === "toLeave" && this._leave) {
            unit.view.goto(this._leave.worldPosition);
        }
    }

    private stationStand(unit: Unit, binding: StationBinding): Vec3 {
        let best = this.standAt(unit, binding.node.worldPosition, STATION_GAP);
        let bestDrift = this.snapDrift(best);
        for (let i = 1; i < STATION_GAPS.length; i++) {
            const point = this.standAt(unit, binding.node.worldPosition, STATION_GAPS[i]);
            const drift = this.snapDrift(point);
            if (drift < bestDrift) {
                best = point;
                bestDrift = drift;
            }
        }
        return this._ctx?.pathfinder?.snap(best) ?? best;
    }

    private snapDrift(world: Vec3): number {
        const snapped = this._ctx?.pathfinder?.snap(world);
        if (!snapped) {
            return Number.MAX_VALUE;
        }
        const dx = snapped.x - world.x;
        const dz = snapped.z - world.z;
        return dx * dx + dz * dz;
    }

    private nearLeave(unit: Unit): boolean {
        return !!this._leave && this.closeEnough(unit, this._leave.worldPosition, ARRIVE_STATION);
    }

    private closeEnough(unit: Unit, world: Vec3, range: number): boolean {
        const pos = unit.view.node?.worldPosition;
        if (!pos) {
            return false;
        }
        const dx = pos.x - world.x;
        const dz = pos.z - world.z;
        return dx * dx + dz * dz <= range * range;
    }

    private standAt(unit: Unit, world: Vec3, gap: number): Vec3 {
        const from = unit.view.node?.worldPosition ?? unit.spawn.worldPosition;
        let dx = from.x - world.x;
        let dz = from.z - world.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) {
            dx = 0;
            dz = 1;
        } else {
            dx /= len;
            dz /= len;
        }
        return new Vec3(world.x + dx * gap, unit.view.home.y, world.z + dz * gap);
    }

    private shake(node: Node): void {
        Tween.stopAllByTarget(node);
        const home = node.eulerAngles.clone();
        tween(node)
            .to(0.07, { eulerAngles: new Vec3(home.x + 6, home.y, home.z + 4) })
            .to(0.07, { eulerAngles: new Vec3(home.x - 6, home.y, home.z - 4) })
            .to(0.07, { eulerAngles: home })
            .start();
    }

    private cap(): number {
        return Math.max(1, this.def.count ?? 3);
    }

    private hitsNeed(): number {
        return Math.max(1, this.def.hitCount ?? 4);
    }

    private interval(): number {
        return Math.max(0.1, this.def.duration);
    }

    private findSpawnFolder(ctx: IncidentContext): Node | null {
        return findNamedDescendant(ctx.levelRoot, this.def.spawnName ?? "AttackPoints");
    }
}
