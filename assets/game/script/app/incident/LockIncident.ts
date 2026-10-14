import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext } from "./Incident";

/** 未上锁的灶炉加锁 freezeTime 秒。duration 为预兆；0 则立刻上锁。 */
export class LockIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private _remain = 0;
    private _phase: "warning" | "done" = "done";

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(ctx: IncidentContext): void {
        this._ctx = ctx;
        this._remain = this.def.duration;
        if (this._remain <= 0) {
            this.applyLock();
            return;
        }
        this._phase = "warning";
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_WARN, this.def.id, this.def.duration);
        if (this.def.warnText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.warnText);
        }
        console.log("[Event] 预兆", this.def.id, this.def.duration, "s");
    }

    tick(dt: number): void {
        if (this._phase !== "warning") {
            return;
        }
        this._remain -= dt;
        if (this._remain > 0) {
            return;
        }
        this.applyLock();
    }

    cancel(): void {
        this._phase = "done";
    }

    private applyLock(): void {
        const seconds = this.def.freezeTime ?? 5;
        const n = this._ctx?.processors.lockUnlocked(seconds) ?? 0;
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_FAIL, this.def.id, n);
        if (this.def.failText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.failText);
        }
        console.log("[Event] 加锁", n, "个灶炉", seconds, "s");
        this._phase = "done";
    }
}
