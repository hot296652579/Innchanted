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
import { RaiderIncident } from "./incident/RaiderIncident";
import { ThreatenIncident } from "./incident/ThreatenIncident";
import { ThiefIncident } from "./incident/ThiefIncident";
import { WhirlwindIncident } from "./incident/WhirlwindIncident";

type IncidentFactory = (def: EventDef) => IIncident;

/** 加新突发事件：写 XxxIncident，登记到这张表。 */
const FACTORY: Record<string, IncidentFactory> = {
    thief: (def) => new ThiefIncident(def),
    skeleton: (def) => new SkeletonThiefIncident(def),
    fuelthief: (def) => new FuelThiefIncident(def),
    threaten: (def) => new ThreatenIncident(def),
    raider: (def) => new RaiderIncident(def),
    curse: (def) => new CurseIncident(def),
    lock: (def) => new LockIncident(def),
    whirlwind: (def) => new WhirlwindIncident(def),
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

/** 班次突发事件时间轴。每条按自己的 delay 开跑，互不挡；duration 由各 Incident 自己用。 */
export class EventDirector {
    private _pending: EventDef[] = [];
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
        this._pending = allEventDefs().slice();
        this._elapsed = 0;
        this._running.length = 0;
        this._ctx = ctx;
        console.log("[Event] 时间轴", this._pending.length, "条");
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
        for (let i = this._pending.length - 1; i >= 0; i--) {
            const def = this._pending[i];
            if (def.delay > this._elapsed) {
                continue;
            }
            if (this.hasKind(def.kind)) {
                continue;
            }
            this._pending.splice(i, 1);
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
        this._pending.length = 0;
        this._ctx = null;
    }

    private hasKind(kind: string): boolean {
        for (let i = 0; i < this._running.length; i++) {
            if (this._running[i].def.kind === kind) {
                return true;
            }
        }
        return false;
    }
}
