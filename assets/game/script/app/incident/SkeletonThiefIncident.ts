import { Node, Vec3 } from "cc";
import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { StationType } from "../../domain/Station";
import { findNamedDescendant } from "../../sim/StationRegistry";
import { Enemy } from "../../view/Enemy";
import { SkeletonThiefView } from "../../view/SkeletonThiefView";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext } from "./Incident";

type Phase = "toBox" | "steal" | "toHome" | "rest" | "dying" | "done";

/** 骷髅小偷：寻路冲宝箱，攻击动作偷金币；被玩家点中走近击杀后播死亡并消失。 */
export class SkeletonThiefIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private readonly _view = new SkeletonThiefView();
    private _actor: Node | null = null;
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
        const actorName = this.def.actorName ?? "Skeleton";
        const actor = findNamedDescendant(ctx.levelRoot, actorName);
        if (!actor) {
            console.warn("[Event] 场景里没有", actorName);
            this._phase = "done";
            return;
        }
        this._box = this.findBox(ctx);
        if (!this._box) {
            console.warn("[Event] 场景里没有 TreasuerBox");
            this._phase = "done";
            return;
        }
        this._actor = actor;
        actor.active = true;
        Enemy.ensure(actor);
        this._view.bind(actor, ctx.pathfinder, ctx.yawOffset ?? 0, this.def.flySpeed ?? 0.9);
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_WARN, this.def.id, 0);
        if (this.def.warnText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.warnText);
        }
        this.runToBox();
    }

    ownsNode(hit: Node): Node | null {
        if (this._phase === "done" || this._phase === "dying") {
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
        if (this._phase === "done" || this._phase === "dying") {
            return false;
        }
        this._remain = Math.max(0.6, this._view.playDeath() + 0.15);
        this._phase = "dying";
        console.log("[Event] 击杀", this.def.id);
        return true;
    }

    tick(dt: number): void {
        if (this._phase === "done") {
            return;
        }
        this._view.tick(dt);
        if (this._phase === "dying") {
            this._remain -= dt;
            if (this._remain <= 0) {
                this._view.hide();
                this._phase = "done";
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
                this._view.playIdle();
                this._remain = Math.max(1, this.def.duration);
                this._phase = "rest";
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
        this._view.snapHome();
        this._phase = "done";
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
