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

const STAND_GAP = 1.05;

/** 恐吓：餐桌有客人就从 ThreatenPoint 快跑过去，Throw 一次吓跑客人。 */
export class ThreatenIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private readonly _view = new ThreatenView();
    private _actor: Node | null = null;
    private _spawn: Node | null = null;
    private _target: OccupiedSeat | null = null;
    private _phase: Phase = "done";
    private _remain = 0;

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
            if (this._view.arrived()) {
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
        const seat = this._ctx?.occupiedSeat?.() ?? null;
        if (!seat) {
            this.waitAtHome();
            console.log("[Event] 没有入座客人，再等", this.interval(), "s");
            return;
        }
        this._target = seat;
        this._view.setLookTarget(seat.world);
        this._view.goto(this.standAt(seat.world));
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

    private standAt(world: Vec3): Vec3 {
        const from = this._view.node?.worldPosition ?? this._view.home;
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
        return new Vec3(world.x + dx * STAND_GAP, this._view.home.y, world.z + dz * STAND_GAP);
    }

    private findSpawn(ctx: IncidentContext): Node | null {
        const name = this.def.spawnName ?? "ThreatenPoint";
        return findNamedDescendant(ctx.levelRoot, name);
    }
}
