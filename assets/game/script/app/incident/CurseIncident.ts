import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext } from "./Incident";

/**
 * 区域诅咒占位：倒计时结束冻结灶炉/操作台。
 * 在 events.json 加一条 kind=curse 即会进时间轴；冻结逻辑后续接 ProcessorSystem。
 */
export class CurseIncident implements IIncident {
    private _remain = 0;
    private _phase: "warning" | "done" = "done";

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(_ctx: IncidentContext): void {
        this._remain = this.def.duration;
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
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_FAIL, this.def.id, this.def.freezeTime ?? 15);
        events.emit(GameEvent.SHOW_TIPS, this.def.failText ?? "灶台被冻结了");
        console.log("[Event] 诅咒超时，冻结待接入", this.def.freezeTime ?? 15, "s");
        this._phase = "done";
    }

    cancel(): void {
        this._phase = "done";
    }
}
