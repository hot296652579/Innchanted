import { Node } from "cc";
import { findNamedDescendant, StationBinding, StationRegistry } from "./StationRegistry";

export interface DiningLayout {
    guestNode: Node;
    leavePoint: Node;
    seatPoint: Node;
    table: StationBinding;
}

/** 从关卡节点收集餐桌 / 座位 / 离店点 / 客人，不写玩法。 */
export function scanDining(
    levelRoot: Node,
    stationRoot: Node,
    registry: StationRegistry,
): DiningLayout | null {
    const guestNode = findNamedDescendant(levelRoot, "Guest");
    const leavePoint = findNamedDescendant(levelRoot, "LeavePoint");
    const table = registry.all.find((b) => b.station.type === "table") ?? null;
    const seatPoint = findSeat(stationRoot);
    if (!guestNode || !leavePoint || !table || !seatPoint) {
        return null;
    }
    return { guestNode, leavePoint, seatPoint, table };
}

function findSeat(stationRoot: Node): Node | null {
    for (let i = 0; i < stationRoot.children.length; i++) {
        const node = stationRoot.children[i];
        if (!node.name.toLowerCase().startsWith("chair")) {
            continue;
        }
        const seat = findNamedDescendant(node, "SeatPoint");
        if (seat) {
            return seat;
        }
    }
    return findNamedDescendant(stationRoot, "SeatPoint");
}
