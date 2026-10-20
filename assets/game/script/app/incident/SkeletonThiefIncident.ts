import { instantiate, Node, Vec3 } from "cc";
import { BundlesEnum } from "../../../../define/BundlesEnum";
import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { ResourceManager } from "../../../../framework/resource/ResourceManager";
import { StationType } from "../../domain/Station";
import { findNamedDescendant } from "../../sim/StationRegistry";
import { Enemy } from "../../view/Enemy";
import { SkeletonThiefView } from "../../view/SkeletonThiefView";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext } from "./Incident";

type Phase = "spawning" | "toBox" | "steal" | "toHome" | "rest" | "dying" | "waitSpawn" | "done";

/** 骷髅小偷：duration 为偷取间隔。回家或被击杀后等 interval 再偷；击杀则重新生成。 */
export class SkeletonThiefIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private readonly _view = new SkeletonThiefView();
    private _actor: Node | null = null;
    private _spawn: Node | null = null;
    private _box: Node | null = null;
    private _phase: Phase = "done";
    private _remain = 0;

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(ctx: IncidentContext): void {
        this._ctx = ctx;
        if (!ctx.pathfinder) {
            console.warn("[Event] 骷髅小偷没有寻路");
            this._phase = "done";
            return;
        }
        const spawn = this.findSpawn(ctx);
        if (!spawn) {
            console.warn("[Event] 场景里没有", this.def.spawnName ?? "SwapnPoint");
            this._phase = "done";
            return;
        }
        this._spawn = spawn;
        this._box = this.findBox(ctx);
        if (!this._box) {
            console.warn("[Event] 场景里没有 TreasuerBox");
            this._phase = "done";
            return;
        }
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
                console.log("[Event] 骷髅击杀后", this._remain, "s 再生成");
            }
            return;
        }
        if (this._phase === "toBox") {
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
                this._remain = this.interval();
                this._phase = "rest";
                console.log("[Event] 骷髅回巢，", this._remain, "s 后再偷");
            }
            return;
        }
        if (this._phase === "rest") {
            this._remain -= dt;
            if (this._remain <= 0) {
                this.runToBox();
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
        return this._phase === "toBox" || this._phase === "steal" || this._phase === "toHome" || this._phase === "rest";
    }

    private async spawnAt(spawn: Node, ctx: IncidentContext): Promise<void> {
        const path = this.def.prefab ?? "prefab/enemys/Skeleton";
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
        actor.name = this.def.actorName ?? "Skeleton";
        ctx.levelRoot.addChild(actor);
        actor.setWorldPosition(spawn.worldPosition);
        actor.setWorldRotation(spawn.worldRotation);
        actor.active = true;
        Enemy.ensure(actor);
        this._actor = actor;
        this._view.bind(actor, ctx.pathfinder, ctx.yawOffset ?? 0, this.def.flySpeed ?? 0.9);
        this.runToBox();
        console.log("[Event] 骷髅在出生点生成", spawn.name);
    }

    private runToBox(): void {
        const box = this._box;
        if (!box) {
            this._phase = "done";
            return;
        }
        this._view.setLookTarget(box.worldPosition);
        this._view.goto(this.boxStand());
        this._phase = "toBox";
        console.log("[Event] 骷髅冲宝箱", this.def.id);
    }

    private startSteal(): void {
        this._view.stop();
        if (this._box) {
            this._view.setLookTarget(this._box.worldPosition);
        }
        this._view.playAttack(true);
        this._remain = this.def.hoverTime ?? 1;
        this._phase = "steal";
        console.log("[Event] 偷金币", this.def.id, this._remain, "s");
    }

    private finishSteal(): void {
        const want = this.def.stealGold ?? this.def.stealCount ?? 5;
        const took = this._ctx?.stealGold?.(want) ?? 0;
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_FAIL, this.def.id, took);
        if (took > 0) {
            events.emit(GameEvent.SHOW_TIPS, this.def.failText ?? `骷髅偷走了 ${took} 金币！`);
        } else {
            events.emit(GameEvent.SHOW_TIPS, "宝箱里没有金币");
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
    }

    /** 停在宝箱朝向来路的一侧，避免按节点 forward（-Z）绕到箱子后面。 */
    private boxStand(): Vec3 {
        const box = this._box!;
        const marked = findNamedDescendant(box, "StealPos") ?? findNamedDescendant(box, "InteractPos");
        if (marked) {
            return marked.worldPosition;
        }
        const center = box.worldPosition;
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
        const dist = 1.05;
        return new Vec3(center.x + dx * dist, this._view.home.y, center.z + dz * dist);
    }

    private findSpawn(ctx: IncidentContext): Node | null {
        const name = this.def.spawnName ?? "SwapnPoint";
        return findNamedDescendant(ctx.levelRoot, name)
            ?? findNamedDescendant(ctx.levelRoot, "SpawnPoint");
    }

    private findBox(ctx: IncidentContext): Node | null {
        const named = findNamedDescendant(ctx.levelRoot, "TreasuerBox");
        if (named) {
            return named;
        }
        for (let i = 0; i < ctx.registry.all.length; i++) {
            if (ctx.registry.all[i].station.type === StationType.Chest) {
                return ctx.registry.all[i].node;
            }
        }
        return null;
    }
}
