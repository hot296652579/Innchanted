import { Node } from "cc";
import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { StationBinding, findNamedDescendant } from "../../sim/StationRegistry";
import { Enemy } from "../../view/Enemy";
import { ThiefView } from "../../view/ThiefView";
import { EventDef } from "../EventCatalog";
import { isCookedOutput } from "../Recipe";
import { IIncident, IncidentContext } from "./Incident";

type Phase = "warning" | "attention" | "toFood" | "hover" | "toHome" | "attack" | "done";

/** 小偷来袭：飞到台后停留，未被驱赶才偷走；回巢 Hit 后销毁。 */
export class ThiefIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private _actor: Node | null = null;
    private readonly _view = new ThiefView();
    private _phase: Phase = "done";
    private _remain = 0;
    private _hoverLeft = 0;
    private _hoverStationId: string | null = null;
    private _attackLeft = 0;
    private _targets: StationBinding[] = [];
    private _index = 0;
    private _urged = false;
    private _carrying = false;
    private _scared = false;

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(ctx: IncidentContext): void {
        this._ctx = ctx;
        const actorName = this.def.actorName ?? "Bat";
        const actor = findNamedDescendant(ctx.levelRoot, actorName);
        if (!actor) {
            console.warn("[Event] 场景里没有", actorName);
            this._phase = "done";
            return;
        }
        this._actor = actor;
        Enemy.ensure(actor);
        this._view.bind(actor);
        this.restartWarn();
    }

    ownsNode(hit: Node): Node | null {
        const actor = this._actor;
        if (!actor || this._phase === "done") {
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
        if (this._phase === "done" || this._phase === "toHome" || this._phase === "attack") {
            return false;
        }
        this.hideFace();
        this._scared = true;
        this._carrying = false;
        this._hoverStationId = null;
        this._view.discardHeld();
        this._view.flyHome(this.def.flySpeed ?? 6);
        this._phase = "toHome";
        console.log("[Event] 击退", this.def.id);
        return true;
    }

    scareAt(stationId: string): boolean {
        if (this._phase !== "hover" || this._hoverStationId !== stationId) {
            return false;
        }
        this._scared = true;
        this._carrying = false;
        this._hoverStationId = null;
        this._view.flyHome(this.def.flySpeed ?? 6);
        this._phase = "toHome";
        console.log("[Event] 被驱赶", this.def.id, stationId);
        return true;
    }

    tick(dt: number): void {
        if (this._phase === "done") {
            return;
        }
        if (this._phase === "warning") {
            this.tickWarn(dt);
            return;
        }
        if (this._phase === "attention") {
            this._remain -= dt;
            if (this._remain <= 0) {
                this.hideFace();
                this.nextTarget();
            }
            return;
        }
        this._view.tick(dt);
        if (this._phase === "toFood") {
            if (!this._view.flying) {
                this.startHover();
            }
            return;
        }
        if (this._phase === "hover") {
            if (!this.targetHasFood()) {
                this.returnEmpty();
                return;
            }
            this._hoverLeft -= dt;
            if (this._hoverLeft <= 0) {
                this.grabAndReturn();
            }
            return;
        }
        if (this._phase === "toHome") {
            if (!this._view.flying) {
                this.onHome();
            }
            return;
        }
        if (this._phase === "attack") {
            this._attackLeft -= dt;
            if (this._attackLeft <= 0) {
                this._view.discardHeld();
                this._carrying = false;
                this._view.playIdle();
                this._index += 1;
                this.nextTarget();
            }
        }
    }

    cancel(): void {
        this.hideFace();
        this._view.discardHeld();
        this._view.snapHome();
        this._hoverStationId = null;
        this._phase = "done";
    }

    private tickWarn(dt: number): void {
        this._remain -= dt;
        if (!this._urged && this._remain <= 5) {
            this._urged = true;
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "小偷还剩 5 秒！");
        }
        if (this._remain > 0) {
            return;
        }
        this.startSteal();
    }

    private startSteal(): void {
        const ctx = this._ctx!;
        const count = this.def.stealCount ?? 2;
        this._targets = ctx.processors.listCooked(count);
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_FAIL, this.def.id, this._targets.length);
        if (this._targets.length === 0) {
            events.emit(GameEvent.SHOW_TIPS, "没有成品可偷");
            console.log("[Event] 超时无成品，再等", this.def.duration, "s");
            this.restartWarn();
            return;
        }
        if (this.def.failText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.failText);
        }
        console.log("[Event] 开始偷", this.def.id, this._targets.length, "份");
        this._index = 0;
        this.startAttention();
    }

    private startAttention(): void {
        const follow = this._view.node ?? this._actor;
        if (follow) {
            this._ctx?.showFace?.(this.faceId(), follow, "attention");
        }
        this._remain = 1;
        this._phase = "attention";
        console.log("[Event] 蝙蝠注意", this.def.id);
    }

    private hideFace(): void {
        this._ctx?.hideFace?.(this.faceId());
    }

    private faceId(): string {
        return this._actor?.name ?? this.def.id;
    }

    private restartWarn(): void {
        this._scared = false;
        this._carrying = false;
        this._hoverStationId = null;
        this._urged = false;
        this._index = 0;
        this._targets = [];
        this._remain = this.def.duration;
        this._phase = "warning";
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_WARN, this.def.id, this.def.duration);
        if (this.def.warnText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.warnText);
        }
        console.log("[Event] 预兆", this.def.id, this.def.duration, "s");
    }

    private nextTarget(): void {
        if (this._scared || this._index >= this._targets.length) {
            this.restartWarn();
            return;
        }
        const hold = this._targets[this._index].holdPoint;
        this._view.flyTo(hold.worldPosition, this.def.flySpeed ?? 6);
        this._phase = "toFood";
    }

    private startHover(): void {
        const binding = this._targets[this._index];
        this._hoverStationId = binding?.station.id ?? null;
        this._hoverLeft = this.def.hoverTime ?? 2;
        this._phase = "hover";
        console.log("[Event] 停留", this._hoverStationId, this._hoverLeft, "s");
    }

    private grabAndReturn(): void {
        this._hoverStationId = null;
        const ctx = this._ctx!;
        const hold = this._view.hold;
        const binding = this._targets[this._index];
        this._carrying = !!(hold && binding && ctx.processors.takeCooked(binding, hold));
        if (!this._carrying) {
            this.returnEmpty();
            return;
        }
        this._view.flyHome(this.def.flySpeed ?? 6);
        this._phase = "toHome";
    }

    private targetHasFood(): boolean {
        const binding = this._targets[this._index];
        const slot = binding?.station.slot;
        if (!slot || slot.empty || !isCookedOutput(slot.itemId)) {
            return false;
        }
        return binding.station.cook?.state !== "cooking";
    }

    private returnEmpty(): void {
        this._hoverStationId = null;
        this._carrying = false;
        this._view.flyHome(this.def.flySpeed ?? 6);
        this._phase = "toHome";
        console.log("[Event] 没有食物，回巢", this.def.id);
    }

    private onHome(): void {
        if (this._carrying) {
            this._attackLeft = this._view.playHit();
            this._phase = "attack";
            return;
        }
        this._view.playIdle();
        this.restartWarn();
    }
}
