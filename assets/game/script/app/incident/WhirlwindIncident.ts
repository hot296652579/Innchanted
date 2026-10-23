import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext } from "./Incident";

type Phase = "warning" | "sealing" | "done";

/** 旋风封台：按 stationTypes 随机抽台，用药水才能解开。duration 为预兆。 */
export class WhirlwindIncident implements IIncident {
    private _ctx: IncidentContext | null = null;
    private _remain = 0;
    private _phase: Phase = "done";

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(ctx: IncidentContext): void {
        this._ctx = ctx;
        this._remain = this.def.duration;
        if (this._remain <= 0) {
            this.startSeal();
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
        this.startSeal();
    }

    cancel(): void {
        this._phase = "done";
    }

    private startSeal(): void {
        this._phase = "sealing";
        void this.seal();
    }

    private async seal(): Promise<void> {
        const ctx = this._ctx;
        if (!ctx?.windStations || this._phase !== "sealing") {
            this._phase = "done";
            return;
        }
        const types = this.def.stationTypes ?? ["cook", "place", "itemstand"];
        const count = this.def.count ?? 1;
        const unlock = this.def.unlockItemId ?? "medicinebottle_red";
        const n = await ctx.windStations(types, count, unlock, this.def.prefab);
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_FAIL, this.def.id, n);
        if (this.def.failText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.failText);
        }
        console.log("[Event] 旋风封住", n, "个操作台");
        this._phase = "done";
    }
}
