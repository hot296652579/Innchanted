import { Node, Vec3 } from "cc";
import { guestTypeFromNode, isEscortGuest, isGuestNodeName } from "../app/GuestCatalog";
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

export type SeatSlot = {
    seat: Node;
    table: StationBinding;
};

export type DiningHallScan = {
    leavePoint: Node;
    waitPoint: Node | null;
    slots: SeatSlot[];
};

export type GuestPlan = {
    guestType: string;
    waitInLine: boolean;
    seatPoint: Node | null;
    table: StationBinding | null;
};

/** 扫离店点、排队点、普通桌座位。客人不从场景里取。 */
export function scanHall(
    levelRoot: Node,
    stationRoot: Node,
    registry: StationRegistry,
): DiningHallScan | null {
    const leavePoint = findNamedDescendant(levelRoot, "LeavePoint");
    const waitPoint = findNamedDescendant(levelRoot, "WaitPoint");
    const tables = registry.all.filter((b) => b.station.type === StationType.Table);
    const rounds = registry.all.filter((b) => b.station.type === StationType.RoundTable);
    const slots = collectSeatSlots(tables, stationRoot);
    if (!leavePoint || (tables.length === 0 && rounds.length === 0)) {
        return null;
    }
    console.log(
        "[Guest] 座位归属",
        slots.map((slot) => `${slot.seat.parent?.name ?? slot.seat.name}→${slot.table.station.id}`).join(", "),
    );
    return { leavePoint, waitPoint, slots };
}

/** 按客人类型顺序分座：引座客和被挡住的人进队。 */
export function planGuests(types: string[], slots: SeatSlot[]): GuestPlan[] {
    const plans: GuestPlan[] = [];
    let slotIndex = 0;
    let blocked = false;
    for (let i = 0; i < types.length; i++) {
        const type = types[i];
        if (isEscortGuest(type) || blocked || slotIndex >= slots.length) {
            if (isEscortGuest(type)) {
                blocked = true;
            }
            plans.push({ guestType: type, waitInLine: true, seatPoint: null, table: null });
            continue;
        }
        plans.push({
            guestType: type,
            waitInLine: false,
            seatPoint: slots[slotIndex].seat,
            table: slots[slotIndex].table,
        });
        slotIndex += 1;
    }
    return plans;
}

/** 从关卡收集客人、座位、排队点。座位不够的进 waiting。 */
export function scanDining(
    levelRoot: Node,
    stationRoot: Node,
    registry: StationRegistry,
    guests?: Node[],
): DiningScan | null {
    const leavePoint = findNamedDescendant(levelRoot, "LeavePoint");
    const waitPoint = findNamedDescendant(levelRoot, "WaitPoint");
    const guestNodes = guests ?? collectGuests(levelRoot);
    const tables = registry.all.filter((b) => b.station.type === StationType.Table);
    const rounds = registry.all.filter((b) => b.station.type === StationType.RoundTable);
    const slots = collectSeatSlots(tables, stationRoot);
    if (!leavePoint || guestNodes.length === 0 || (tables.length === 0 && rounds.length === 0)) {
        return null;
    }
    console.log("[Guest] 层级顺序", guestNodes.map((node) => node.name).join(", "));
    console.log(
        "[Guest] 座位归属",
        slots.map((slot) => `${slot.seat.parent?.name ?? slot.seat.name}→${slot.table.station.id}`).join(", "),
    );
    return assignSeats(guestNodes, slots, leavePoint, waitPoint);
}

function assignSeats(
    guests: Node[],
    slots: SeatSlot[],
    leavePoint: Node,
    waitPoint: Node | null,
): DiningScan {
    const seated: DiningLayout[] = [];
    const waiting: DiningLayout[] = [];
    let slotIndex = 0;
    let blocked = false;
    for (let i = 0; i < guests.length; i++) {
        const type = guestTypeFromNode(guests[i].name);
        const layout: DiningLayout = {
            guestNode: guests[i],
            guestType: type,
            leavePoint,
            seatPoint: null,
            table: null,
        };
        if (isEscortGuest(type) || blocked || slotIndex >= slots.length) {
            if (isEscortGuest(type)) {
                blocked = true;
            }
            waiting.push(layout);
            continue;
        }
        layout.seatPoint = slots[slotIndex].seat;
        layout.table = slots[slotIndex].table;
        slotIndex += 1;
        seated.push(layout);
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
