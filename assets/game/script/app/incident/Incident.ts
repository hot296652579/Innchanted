import { Node } from "cc";
import { ProcessorSystem } from "../ProcessorSystem";
import { StationRegistry } from "../../sim/StationRegistry";
import { EventDef } from "../EventCatalog";

export type IncidentContext = {
    registry: StationRegistry;
    processors: ProcessorSystem;
    levelRoot: Node;
};

/** 一条正在跑的突发事件。新类型实现此接口并登记到 EventDirector 的 FACTORY。 */
export interface IIncident {
    readonly def: EventDef;
    readonly done: boolean;
    begin(ctx: IncidentContext): void;
    tick(dt: number): void;
    cancel(): void;
}
