import { Node } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { ProcessorSystem } from "./ProcessorSystem";
import { StationRegistry } from "../sim/StationRegistry";
import { allEventDefs, EventDef } from "./EventCatalog";
import { IIncident, IncidentContext } from "./incident/Incident";
import { CurseIncident } from "./incident/CurseIncident";
import { ThiefIncident } from "./incident/ThiefIncident";

type IncidentFactory = (def: EventDef) => IIncident;

/** 加新突发事件：写 XxxIncident，登记到这张表。 */
const FACTORY: Record<string, IncidentFactory> = {
    thief: (def) => new ThiefIncident(def),
    curse: (def) => new CurseIncident(def),
};

function createIncident(def: EventDef): IIncident | null {
    const make = FACTORY[def.kind];
    if (!make) {
        console.warn("[Event] 未知 kind", def.kind);
        return null;
    }
    return make(def);
}

/** 班次突发事件时间轴。同一时刻只跑 1 个攻击型事件。 */
export class EventDirector {
    private _queue: EventDef[] = [];
    private _index = 0;
    private _elapsed = 0;
    private _active: IIncident | null = null;
    private _ctx: IncidentContext | null = null;

    start(registry: StationRegistry, processors: ProcessorSystem, levelRoot: Node): void {
        this._queue = allEventDefs().slice().sort((a, b) => a.delay - b.delay);
        this._index = 0;
        this._elapsed = 0;
        this._active = null;
        this._ctx = { registry, processors, levelRoot };
        console.log("[Event] 时间轴", this._queue.length, "条");
    }

    update(dt: number): void {
        this._elapsed += dt;
        if (this._active) {
            this._active.tick(dt);
            if (this._active.done) {
                EventManager.getInstance().emit(GameEvent.EVENT_RESOLVED, this._active.def.id);
                this._active = null;
            }
            return;
        }
        if (!this._ctx) {
            return;
        }
        while (this._index < this._queue.length) {
            const def = this._queue[this._index];
            if (def.delay > this._elapsed) {
                break;
            }
            this._index += 1;
            const incident = createIncident(def);
            if (!incident) {
                continue;
            }
            incident.begin(this._ctx);
            this._active = incident;
            break;
        }
    }

    clear(): void {
        this._active?.cancel();
        this._active = null;
        this._queue.length = 0;
        this._ctx = null;
    }
}
