import { Node } from "cc";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { allEventDefs, EventDef } from "./EventCatalog";
import { IIncident, IncidentContext } from "./incident/Incident";
import { CurseIncident } from "./incident/CurseIncident";
import { IceDragonIncident } from "./incident/IceDragonIncident";
import { LockIncident } from "./incident/LockIncident";
import { FuelThiefIncident } from "./incident/FuelThiefIncident";
import { SkeletonThiefIncident } from "./incident/SkeletonThiefIncident";
import { ThiefIncident } from "./incident/ThiefIncident";

type IncidentFactory = (def: EventDef) => IIncident;

/** 加新突发事件：写 XxxIncident，登记到这张表。 */
const FACTORY: Record<string, IncidentFactory> = {
    thief: (def) => new ThiefIncident(def),
    skeleton: (def) => new SkeletonThiefIncident(def),
    fuelthief: (def) => new FuelThiefIncident(def),
    curse: (def) => new CurseIncident(def),
    lock: (def) => new LockIncident(def),
    ice: (def) => new IceDragonIncident(def),
};

function createIncident(def: EventDef): IIncident | null {
    const make = FACTORY[def.kind];
    if (!make) {
        console.warn("[Event] 未知 kind", def.kind);
        return null;
    }
    return make(def);
}

function isAttack(def: EventDef): boolean {
    return def.category === "attack" || def.kind === "thief" || def.kind === "skeleton";
}

/** 班次突发事件时间轴。攻击型同时只跑 1 个；状态型（锁灶）可并行。 */
export class EventDirector {
    private _queue: EventDef[] = [];
    private _index = 0;
    private _elapsed = 0;
    private readonly _running: IIncident[] = [];
    private _ctx: IncidentContext | null = null;

    scareAt(stationId: string): boolean {
        for (let i = 0; i < this._running.length; i++) {
            if (this._running[i].scareAt?.(stationId)) {
                return true;
            }
        }
        return false;
    }

    ownsEnemy(hit: Node): Node | null {
        for (let i = 0; i < this._running.length; i++) {
            const root = this._running[i].ownsNode?.(hit);
            if (root) {
                return root;
            }
        }
        return null;
    }

    strike(root: Node): boolean {
        for (let i = 0; i < this._running.length; i++) {
            if (this._running[i].ownsNode?.(root) && this._running[i].strike?.()) {
                return true;
            }
        }
        return false;
    }

    start(ctx: IncidentContext): void {
        this._queue = allEventDefs().slice().sort((a, b) => a.delay - b.delay);
        this._index = 0;
        this._elapsed = 0;
        this._running.length = 0;
        this._ctx = ctx;
        console.log("[Event] 时间轴", this._queue.length, "条");
    }

    update(dt: number): void {
        this._elapsed += dt;
        for (let i = this._running.length - 1; i >= 0; i--) {
            const incident = this._running[i];
            incident.tick(dt);
            if (!incident.done) {
                continue;
            }
            EventManager.getInstance().emit(GameEvent.EVENT_RESOLVED, incident.def.id);
            this._running.splice(i, 1);
        }
        if (!this._ctx) {
            return;
        }
        while (this._index < this._queue.length) {
            const def = this._queue[this._index];
            if (def.delay > this._elapsed) {
                break;
            }
            if (isAttack(def) && this.hasAttack()) {
                break;
            }
            this._index += 1;
            const incident = createIncident(def);
            if (!incident) {
                continue;
            }
            incident.begin(this._ctx);
            if (!incident.done) {
                this._running.push(incident);
            } else {
                EventManager.getInstance().emit(GameEvent.EVENT_RESOLVED, def.id);
            }
        }
    }

    clear(): void {
        for (let i = 0; i < this._running.length; i++) {
            this._running[i].cancel();
        }
        this._running.length = 0;
        this._queue.length = 0;
        this._ctx = null;
    }

    private hasAttack(): boolean {
        for (let i = 0; i < this._running.length; i++) {
            if (isAttack(this._running[i].def)) {
                return true;
            }
        }
        return false;
    }
}
