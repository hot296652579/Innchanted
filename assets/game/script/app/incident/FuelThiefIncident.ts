import { instantiate, Node, Vec3 } from "cc";
import { BundlesEnum } from "../../../../define/BundlesEnum";
import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { ResourceManager } from "../../../../framework/resource/ResourceManager";
import { StationType } from "../../domain/Station";
import { findNamedDescendant, StationBinding } from "../../sim/StationRegistry";
import { Enemy } from "../../view/Enemy";
import { FuelThiefView } from "../../view/FuelThiefView";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext, showDeathMark } from "./Incident";

type Phase = "spawning" | "toBarrel" | "steal" | "toHome" | "rest" | "dying" | "waitSpawn" | "done";

/** 偷魔法饮料：duration 为偷取间隔。桶里有酒才出发；击杀后在 FuelSwapnPoint 重生。 */
export class FuelThiefIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private readonly _view = new FuelThiefView();
    private _actor: Node | null = null;
    private _spawn: Node | null = null;
    private _barrel: StationBinding | null = null;
    private _phase: Phase = "done";
    private _remain = 0;

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(ctx: IncidentContext): void {
        this._ctx = ctx;
        if (!ctx.pathfinder) {
            console.warn("[Event] 饮料小偷没有寻路");
            this._phase = "done";
            return;
        }
        const spawn = this.findSpawn(ctx);
        if (!spawn) {
            console.warn("[Event] 场景里没有", this.def.spawnName ?? "FuelSwapnPoint");
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
                console.log("[Event] 饮料小偷击杀后", this._remain, "s 再生成");
            }
            return;
        }
        if (this._phase === "toBarrel") {
            if (this._view.arrived()) {
                this.startSteal();
            }
            return;
        }
        if (this._phase === "steal") {
            this._remain -= dt;
            if (this._remain <= 0) {
                this.finishSteal();
            }
            return;
        }
        if (this._phase === "toHome") {
            if (this._view.arrived()) {
                this._view.stop();
                this._view.playIdle();
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
        return this._phase === "toBarrel" || this._phase === "steal" || this._phase === "toHome" || this._phase === "rest";
    }

    private async spawnAt(spawn: Node, ctx: IncidentContext): Promise<void> {
        const path = this.def.prefab ?? "prefab/enemys/FuelThief";
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
        actor.name = this.def.actorName ?? "FuelThief";
        ctx.levelRoot.addChild(actor);
        actor.setWorldPosition(spawn.worldPosition);
        actor.setWorldRotation(spawn.worldRotation);
        actor.active = true;
        Enemy.ensure(actor);
        this._actor = actor;
        this._view.bind(actor, ctx.pathfinder, ctx.yawOffset ?? 0, this.def.flySpeed ?? 1.4);
        this.tryRaid();
        console.log("[Event] 饮料小偷在出生点生成", spawn.name);
    }

    private tryRaid(): void {
        const barrel = this.pickBarrel();
        if (!barrel) {
            this.waitAtHome();
            console.log("[Event] 桶里没有饮料，再等", this.interval(), "s");
            return;
        }
        this._barrel = barrel;
        this._view.setLookTarget(barrel.node.worldPosition);
        this._view.goto(this.barrelStand(barrel));
        this._phase = "toBarrel";
        console.log("[Event] 饮料小偷冲向", barrel.station.id);
    }

    private waitAtHome(): void {
        this._remain = this.interval();
        this._phase = "rest";
    }

    private startSteal(): void {
        this._view.stop();
        if (this._barrel) {
            this._view.setLookTarget(this._barrel.node.worldPosition);
        }
        this._view.playAttack(true);
        this._remain = this.def.hoverTime ?? 2;
        this._phase = "steal";
        console.log("[Event] 偷饮料", this.def.id, this._remain, "s");
    }

    private finishSteal(): void {
        const want = this.def.stealCount ?? 1;
        const took = this._ctx?.stealFuel?.(want) ?? 0;
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_FAIL, this.def.id, took);
        if (took > 0) {
            events.emit(GameEvent.SHOW_TIPS, this.def.failText ?? "小偷偷走了魔法饮料！");
        } else {
            events.emit(GameEvent.SHOW_TIPS, "桶里没有饮料");
        }
        this._view.goHome();
        this._phase = "toHome";
    }

    private despawn(): void {
        this._view.hide();
        if (this._actor?.isValid) {
            this._actor.destroy();
        }
        this._actor = null;
        this._barrel = null;
    }

    private barrelStand(binding: StationBinding): Vec3 {
        const marked = findNamedDescendant(binding.node, "StealPos");
        if (marked) {
            return marked.worldPosition;
        }
        const center = binding.node.worldPosition;
        const from = this._view.node?.worldPosition ?? this._view.home;
        let dx = from.x - center.x;
        let dz = from.z - center.z;
        const len = Math.sqrt(dx * dx + dz * dz);
        if (len < 0.001) {
            dx = 0;
            dz = 1;
        } else {
            dx /= len;
            dz /= len;
        }
        const gap = 0.48;
        return new Vec3(center.x + dx * gap, this._view.home.y, center.z + dz * gap);
    }

    private pickBarrel(): StationBinding | null {
        const ctx = this._ctx;
        if (!ctx) {
            return null;
        }
        let best: StationBinding | null = null;
        let bestCharges = 0;
        for (let i = 0; i < ctx.registry.all.length; i++) {
            const binding = ctx.registry.all[i];
            const tank = binding.station.barrel;
            if (binding.station.type !== StationType.MagicBarrel || !tank || tank.charges <= 0) {
                continue;
            }
            if (tank.charges > bestCharges) {
                best = binding;
                bestCharges = tank.charges;
            }
        }
        return best;
    }

    private findSpawn(ctx: IncidentContext): Node | null {
        const name = this.def.spawnName ?? "FuelSwapnPoint";
        return findNamedDescendant(ctx.levelRoot, name)
            ?? findNamedDescendant(ctx.levelRoot, "FuelSpawnPoint");
    }
}
