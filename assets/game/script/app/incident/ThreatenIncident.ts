import { instantiate, Node, Vec3 } from "cc";
import { BundlesEnum } from "../../../../define/BundlesEnum";
import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { ResourceManager } from "../../../../framework/resource/ResourceManager";
import { findNamedDescendant } from "../../sim/StationRegistry";
import { Enemy } from "../../view/Enemy";
import { ThreatenView } from "../../view/ThreatenView";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext, OccupiedSeat, showDeathMark } from "./Incident";

type Phase = "spawning" | "toGuest" | "throw" | "toHome" | "rest" | "dying" | "waitSpawn" | "done";

const STAND_RING = 2;
const STAND_DIRS = 8;
const ARRIVE = 2.4;
const ARRIVE_STUCK = 3.6;
const STUCK_SEC = 0.35;

/** 恐吓：餐桌有客人就从 ThreatenPoint 快跑过去，Throw 一次吓跑客人。 */
export class ThreatenIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private readonly _view = new ThreatenView();
    private _actor: Node | null = null;
    private _spawn: Node | null = null;
    private _target: OccupiedSeat | null = null;
    private _phase: Phase = "done";
    private _remain = 0;
    private _stuck = 0;
    private _retried = false;

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(ctx: IncidentContext): void {
        this._ctx = ctx;
        if (!ctx.pathfinder) {
            console.warn("[Event] 恐吓怪没有寻路");
            this._phase = "done";
            return;
        }
        const spawn = this.findSpawn(ctx);
        if (!spawn) {
            console.warn("[Event] 场景里没有", this.def.spawnName ?? "ThreatenPoint");
            this._phase = "done";
            return;
        }
        this._spawn = spawn;
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_WARN, this.def.id, 0);
        if (this.def.warnText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.warnText);
        }
        this.startSpawn();
    }

    ownsNode(hit: Node): Node | null {
        if (!this.isAlive()) {
            return null;
        }
        const actor = this._actor;
        if (!actor) {
            return null;
        }
        let current: Node | null = hit;
        while (current) {
            if (current === actor) {
                return actor;
            }
            current = current.parent;
        }
        return null;
    }

    strike(): boolean {
        if (!this.isAlive()) {
            return false;
        }
        this.hideFace();
        showDeathMark(this._ctx, this._actor, this.def.id);
        this._remain = Math.max(0.6, this._view.playDeath() + 0.15);
        this._phase = "dying";
        console.log("[Event] 击杀", this.def.id);
        return true;
    }

    tick(dt: number): void {
        if (this._phase === "done" || this._phase === "spawning") {
            return;
        }
        if (this._phase === "waitSpawn") {
            this._remain -= dt;
            if (this._remain <= 0) {
                this.startSpawn();
            }
            return;
        }
        this._view.tick(dt);
        if (this._phase === "dying") {
            this._remain -= dt;
            if (this._remain <= 0) {
                this.despawn();
                this._remain = this.interval();
                this._phase = "waitSpawn";
                console.log("[Event] 恐吓怪击杀后", this._remain, "s 再生成");
            }
            return;
        }
        if (this._phase === "toGuest") {
            if (this.nearTarget(ARRIVE) || this._view.arrived()) {
                this.startThrow();
                return;
            }
            if (!this._view.idle()) {
                this._stuck = 0;
                return;
            }
            this._stuck += dt;
            if (this._stuck < STUCK_SEC) {
                return;
            }
            this._stuck = 0;
            const target = this._target;
            if (!this._retried && target) {
                this._retried = true;
                this._view.goto(this.standAt(target));
                return;
            }
            if (this.nearTarget(ARRIVE_STUCK)) {
                this.startThrow();
            }
            return;
        }
        if (this._phase === "throw") {
            this._remain -= dt;
            if (this._remain <= 0) {
                this._view.goHome();
                this._phase = "toHome";
            }
            return;
        }
        if (this._phase === "toHome") {
            if (this._view.arrived()) {
                this._view.stop();
                this._view.playIdle();
                this.hideFace();
                this.waitAtHome();
            }
            return;
        }
        if (this._phase === "rest") {
            this._remain -= dt;
            if (this._remain <= 0) {
                this.tryRaid();
            }
        }
    }

    cancel(): void {
        this.hideFace();
        this.despawn();
        this._phase = "done";
    }

    private startSpawn(): void {
        const spawn = this._spawn;
        const ctx = this._ctx;
        if (!spawn || !ctx?.pathfinder) {
            this._phase = "done";
            return;
        }
        this._phase = "spawning";
        void this.spawnAt(spawn, ctx);
    }

    private interval(): number {
        return Math.max(0.1, this.def.duration);
    }

    private isAlive(): boolean {
        return this._phase === "toGuest" || this._phase === "throw" || this._phase === "toHome" || this._phase === "rest";
    }

    private async spawnAt(spawn: Node, ctx: IncidentContext): Promise<void> {
        const path = this.def.prefab ?? "prefab/enemys/Threaten";
        const prefab = await ResourceManager.getInstance().loadPrefab(path, BundlesEnum.Game);
        if (this._phase !== "spawning" || !ctx.pathfinder) {
            return;
        }
        if (!prefab) {
            console.warn("[Event] 未找到", path);
            this._phase = "done";
            return;
        }
        const actor = instantiate(prefab);
        actor.name = this.def.actorName ?? "Threaten";
        ctx.levelRoot.addChild(actor);
        actor.setWorldPosition(spawn.worldPosition);
        actor.setWorldRotation(spawn.worldRotation);
        actor.active = true;
        Enemy.ensure(actor);
        this._actor = actor;
        this._view.bind(actor, ctx.pathfinder, ctx.yawOffset ?? 0, this.def.flySpeed ?? 4.5);
        this.tryRaid();
        console.log("[Event] 恐吓怪在出生点生成", spawn.name);
    }

    private tryRaid(): void {
        const seat = this.nearestSeat(this._ctx?.occupiedSeats?.() ?? []);
        if (!seat) {
            this.waitAtHome();
            console.log("[Event] 没有入座客人，再等", this.interval(), "s");
            return;
        }
        this._target = seat;
        this._stuck = 0;
        this._retried = false;
        this._view.setLookTarget(seat.world);
        this._view.goto(this.standAt(seat));
        this._phase = "toGuest";
        console.log("[Event] 恐吓怪冲向", seat.tableId);
    }

    private waitAtHome(): void {
        this._remain = this.interval();
        this._phase = "rest";
    }

    private startThrow(): void {
        this._view.stop();
        const target = this._target;
        if (target) {
            this._view.setLookTarget(target.world);
        }
        const scared = target ? this._ctx?.scareGuest?.(target.tableId) ?? false : false;
        if (!scared) {
            this._target = null;
            this._view.goHome();
            this._phase = "toHome";
            console.log("[Event] 客人已经不在，恐吓怪回去");
            return;
        }
        const follow = this._view.face ?? this._actor;
        if (follow) {
            this._ctx?.showFace?.(this.faceId(), follow, "threaten");
        }
        this._remain = this._view.playThrow();
        this._phase = "throw";
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_FAIL, this.def.id, 1);
        events.emit(GameEvent.SHOW_TIPS, this.def.failText ?? "客人被吓跑了！");
        console.log("[Event] 恐吓", this.def.id);
    }

    private despawn(): void {
        this.hideFace();
        this._view.hide();
        if (this._actor?.isValid) {
            this._actor.destroy();
        }
        this._actor = null;
        this._target = null;
    }

    private hideFace(): void {
        this._ctx?.hideFace?.(this.faceId());
    }

    private faceId(): string {
        return this._actor?.name ?? this.def.id;
    }

    private nearestSeat(seats: OccupiedSeat[]): OccupiedSeat | null {
        if (seats.length === 0) {
            return null;
        }
        const from = this._view.node?.worldPosition ?? this._view.home;
        let best = seats[0];
        let bestDist = Number.MAX_VALUE;
        for (let i = 0; i < seats.length; i++) {
            const seat = seats[i];
            const dx = seat.world.x - from.x;
            const dz = seat.world.z - from.z;
            const dist = dx * dx + dz * dz;
            if (dist < bestDist) {
                bestDist = dist;
                best = seat;
            }
        }
        return best;
    }

    private nearTarget(range: number): boolean {
        const pos = this._view.node?.worldPosition;
        const target = this._target?.world;
        if (!pos || !target) {
            return false;
        }
        const dx = pos.x - target.x;
        const dz = pos.z - target.z;
        return dx * dx + dz * dz <= range * range;
    }

    /** 绕桌子一圈取样，优先可走且离自己近的点，桌后通道也能走过去。 */
    private standAt(seat: OccupiedSeat): Vec3 {
        const tablePos = this._ctx?.registry.get(seat.tableId)?.node.worldPosition ?? seat.world;
        const from = this._view.node?.worldPosition ?? this._view.home;
        let best = seat.world;
        let bestScore = Number.MAX_VALUE;
        for (let i = 0; i < STAND_DIRS; i++) {
            const angle = (Math.PI * 2 * i) / STAND_DIRS;
            const point = new Vec3(
                tablePos.x + Math.sin(angle) * STAND_RING,
                this._view.home.y,
                tablePos.z + Math.cos(angle) * STAND_RING,
            );
            const snapped = this._ctx?.pathfinder?.snap(point) ?? point;
            const driftX = snapped.x - point.x;
            const driftZ = snapped.z - point.z;
            const toX = snapped.x - from.x;
            const toZ = snapped.z - from.z;
            const score = (driftX * driftX + driftZ * driftZ) * 80 + toX * toX + toZ * toZ;
            if (score < bestScore) {
                bestScore = score;
                best = snapped;
            }
        }
        return best;
    }

    private findSpawn(ctx: IncidentContext): Node | null {
        const name = this.def.spawnName ?? "ThreatenPoint";
        return findNamedDescendant(ctx.levelRoot, name);
    }
}
