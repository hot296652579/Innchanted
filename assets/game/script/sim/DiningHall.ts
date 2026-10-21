import { Node, Vec3 } from "cc";
import { guestTypeFromNode, isGuestNodeName } from "../app/GuestCatalog";
import { StationType } from "../domain/Station";
import { findNamedDescendant, StationBinding, StationRegistry } from "./StationRegistry";

export interface DiningLayout {
    guestNode: Node;
    guestType: string;
    leavePoint: Node;
    seatPoint: Node | null;
    table: StationBinding | null;
}

export interface DiningScan {
    leavePoint: Node;
    waitPoint: Node | null;
    seated: DiningLayout[];
    waiting: DiningLayout[];
}

type SeatSlot = {
    seat: Node;
    table: StationBinding;
};

/** 从关卡收集客人、座位、排队点。座位不够的进 waiting。 */
export function scanDining(
    levelRoot: Node,
    stationRoot: Node,
    registry: StationRegistry,
): DiningScan | null {
    const leavePoint = findNamedDescendant(levelRoot, "LeavePoint");
    const waitPoint = findNamedDescendant(levelRoot, "WaitPoint");
    const guests = collectGuests(levelRoot);
    const tables = registry.all.filter((b) => b.station.type === StationType.Table);
    const slots = collectSeatSlots(tables, stationRoot);
    if (!leavePoint || guests.length === 0 || slots.length === 0 || tables.length === 0) {
        return null;
    }
    console.log("[Guest] 层级顺序", guests.map((node) => node.name).join(", "));
    console.log(
        "[Guest] 座位归属",
        slots.map((slot) => `${slot.seat.parent?.name ?? slot.seat.name}→${slot.table.station.id}`).join(", "),
    );
    return assignSeats(guests, slots, leavePoint, waitPoint);
}

function assignSeats(
    guests: Node[],
    slots: SeatSlot[],
    leavePoint: Node,
    waitPoint: Node | null,
): DiningScan {
    const seated: DiningLayout[] = [];
    const take = Math.min(guests.length, slots.length);
    for (let i = 0; i < take; i++) {
        seated.push({
            guestNode: guests[i],
            guestType: guestTypeFromNode(guests[i].name),
            leavePoint,
            seatPoint: slots[i].seat,
            table: slots[i].table,
        });
    }

    const waiting: DiningLayout[] = [];
    for (let i = seated.length; i < guests.length; i++) {
        waiting.push({
            guestNode: guests[i],
            guestType: guestTypeFromNode(guests[i].name),
            leavePoint,
            seatPoint: null,
            table: null,
        });
    }
    return { leavePoint, waitPoint, seated, waiting };
}

/** Guests 节点下的直接子节点 = 编辑器层级顺序。 */
function collectGuests(levelRoot: Node): Node[] {
    const folder = findNamedDescendant(levelRoot, "Guests");
    if (folder && folder.children.length > 0) {
        const guests: Node[] = [];
        for (let i = 0; i < folder.children.length; i++) {
            const node = folder.children[i];
            if (node.active) {
                guests.push(node);
            }
        }
        if (guests.length > 0) {
            return guests;
        }
    }
    return collectDescendants(levelRoot, (node) => isGuestNodeName(node.name));
}

/** 每张餐桌下的 SeatPoint 归这张桌。没有的再扫独立 Chair。 */
function collectSeatSlots(tables: StationBinding[], stationRoot: Node): SeatSlot[] {
    const slots: SeatSlot[] = [];
    const used = new Set<Node>();
    for (let i = 0; i < tables.length; i++) {
        const table = tables[i];
        const seats = collectDescendants(table.node, (node) => node.name === "SeatPoint");
        for (let s = 0; s < seats.length; s++) {
            used.add(seats[s]);
            slots.push({ seat: seats[s], table });
        }
    }
    const orphans = collectOrphanChairs(stationRoot, used);
    for (let i = 0; i < orphans.length; i++) {
        const table = nearestTable(orphans[i], tables);
        if (table) {
            slots.push({ seat: orphans[i], table });
        }
    }
    return slots;
}

function collectOrphanChairs(stationRoot: Node, used: Set<Node>): Node[] {
    const seats: Node[] = [];
    for (let i = 0; i < stationRoot.children.length; i++) {
        const node = stationRoot.children[i];
        if (!node.name.toLowerCase().startsWith("chair")) {
            continue;
        }
        const seat = findNamedDescendant(node, "SeatPoint");
        if (seat && !used.has(seat)) {
            seats.push(seat);
        }
    }
    return seats;
}

function nearestTable(seat: Node, tables: StationBinding[]): StationBinding | null {
    let best = tables[0] ?? null;
    let bestDist = best ? dist2(seat.worldPosition, best.node.worldPosition) : Number.POSITIVE_INFINITY;
    for (let i = 1; i < tables.length; i++) {
        const d = dist2(seat.worldPosition, tables[i].node.worldPosition);
        if (d < bestDist) {
            best = tables[i];
            bestDist = d;
        }
    }
    return best;
}

function collectDescendants(root: Node, pred: (node: Node) => boolean, out: Node[] = []): Node[] {
    if (pred(root)) {
        out.push(root);
    }
    for (let i = 0; i < root.children.length; i++) {
        collectDescendants(root.children[i], pred, out);
    }
    return out;
}

function dist2(a: Vec3, b: Vec3): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return dx * dx + dz * dz;
}
