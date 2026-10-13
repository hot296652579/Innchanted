import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { StationBinding, findNamedDescendant } from "../../sim/StationRegistry";
import { ThiefView } from "../../view/ThiefView";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext } from "./Incident";

type Phase = "warning" | "toFood" | "toHome" | "attack" | "done";

/** 小偷来袭：倒计时结束飞去叼走成品，回巢 Attack 后销毁。 */
export class ThiefIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private readonly _view = new ThiefView();
    private _phase: Phase = "done";
    private _remain = 0;
    private _attackLeft = 0;
    private _targets: StationBinding[] = [];
    private _index = 0;
    private _urged = false;

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
        this._view.bind(actor);
        this._remain = this.def.duration;
        this._urged = false;
        this._phase = "warning";
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_WARN, this.def.id, this.def.duration);
        if (this.def.warnText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.warnText);
        }
        console.log("[Event] 预兆", this.def.id, this.def.duration, "s");
    }

    tick(dt: number): void {
        if (this._phase === "done") {
            return;
        }
        if (this._phase === "warning") {
            this.tickWarn(dt);
            return;
        }
        this._view.tick(dt);
        if (this._phase === "toFood") {
            if (!this._view.flying) {
                this.grabAndReturn();
            }
            return;
        }
        if (this._phase === "toHome") {
            if (!this._view.flying) {
                this.startAttack();
            }
            return;
        }
        if (this._phase === "attack") {
            this._attackLeft -= dt;
            if (this._attackLeft <= 0) {
                this._view.discardHeld();
                this._index += 1;
                this.nextTarget();
            }
        }
    }

    cancel(): void {
        this._view.discardHeld();
        this._view.snapHome();
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
            console.log("[Event] 超时无成品", this.def.id);
            this._phase = "done";
            return;
        }
        if (this.def.failText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.failText);
        }
        console.log("[Event] 开始偷", this.def.id, this._targets.length, "份");
        this._index = 0;
        this.nextTarget();
    }

    private nextTarget(): void {
        if (this._index >= this._targets.length) {
            this._phase = "done";
            return;
        }
        const hold = this._targets[this._index].holdPoint;
        this._view.flyTo(hold.worldPosition, this.def.flySpeed ?? 6);
        this._phase = "toFood";
    }

    private grabAndReturn(): void {
        const ctx = this._ctx!;
        const hold = this._view.hold;
        const binding = this._targets[this._index];
        const took = !!(hold && binding && ctx.processors.takeCooked(binding, hold));
        if (!took) {
            this._index += 1;
            this.nextTarget();
            return;
        }
        this._view.flyTo(this._view.home, this.def.flySpeed ?? 6);
        this._phase = "toHome";
    }

    private startAttack(): void {
        this._attackLeft = this._view.playAttack();
        this._phase = "attack";
    }
}
