import { Camera, Node, Vec3 } from "cc";
import { ProcessorSystem } from "../ProcessorSystem";
import { IPathfinder } from "../../sim/IPathfinder";
import { StationRegistry } from "../../sim/StationRegistry";
import { EventDef } from "../EventCatalog";

export type OccupiedSeat = {
    tableId: string;
    world: Vec3;
};

export type IncidentContext = {
    registry: StationRegistry;
    processors: ProcessorSystem;
    levelRoot: Node;
    pathfinder?: IPathfinder;
    yawOffset?: number;
    stealGold?: (count: number) => number;
    stealFuel?: (count: number) => number;
    occupiedSeat?: () => OccupiedSeat | null;
    occupiedSeats?: () => OccupiedSeat[];
    scareGuest?: (tableId: string) => boolean;
    showFace?: (id: string, follow: Node, kind: string) => void;
    hideFace?: (id: string) => void;
    windStations?: (types: string[], count: number, unlockItemId: string, prefab?: string) => Promise<number>;
    burstFx?: (host: Node, key: string, duration: number, worldFrom?: Node | null, liftY?: number) => void;
    camera?: Camera;
};

/** 一条正在跑的突发事件。新类型实现此接口并登记到 EventDirector 的 FACTORY。 */
export interface IIncident {
    readonly def: EventDef;
    readonly done: boolean;
    begin(ctx: IncidentContext): void;
    tick(dt: number): void;
    cancel(): void;
    /** 玩家点击该台驱赶。成功返回 true。 */
    scareAt?(stationId: string): boolean;
    /** 点击命中属于本事件的敌人时，返回敌人根节点。 */
    ownsNode?(hit: Node): Node | null;
    /** 玩家走到跟前攻击。成功返回 true。 */
    strike?(): boolean;
}
