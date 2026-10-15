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

/** 从关卡收集客人、座位、排队点。座位不够的进 waiting。 */
export function scanDining(
    levelRoot: Node,
    stationRoot: Node,
    registry: StationRegistry,
): DiningScan | null {
    const leavePoint = findNamedDescendant(levelRoot, "LeavePoint");
    const waitPoint = findNamedDescendant(levelRoot, "WaitPoint");
    const guests = collectDescendants(levelRoot, (node) => isGuestNodeName(node.name));
    guests.sort((a, b) => a.name.localeCompare(b.name));
    const seats = collectSeats(stationRoot);
    const tables = registry.all.filter((b) => b.station.type === StationType.Table);
    if (!leavePoint || guests.length === 0 || seats.length === 0 || tables.length === 0) {
        return null;
    }
    return assignSeats(guests, seats, tables, leavePoint, waitPoint);
}

function assignSeats(
    guests: Node[],
    seats: Node[],
    tables: StationBinding[],
    leavePoint: Node,
    waitPoint: Node | null,
): DiningScan {
    const pairs: { guest: Node; seat: Node; dist: number }[] = [];
    for (let i = 0; i < guests.length; i++) {
        for (let j = 0; j < seats.length; j++) {
            pairs.push({
                guest: guests[i],
                seat: seats[j],
                dist: dist2(guests[i].worldPosition, seats[j].worldPosition),
            });
        }
    }
    pairs.sort((a, b) => a.dist - b.dist);

    const usedGuest = new Set<Node>();
    const usedSeat = new Set<Node>();
    const seated: DiningLayout[] = [];
    for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        if (usedGuest.has(pair.guest) || usedSeat.has(pair.seat)) {
            continue;
        }
        const table = nearestTable(pair.seat, tables);
        if (!table) {
            continue;
        }
        usedGuest.add(pair.guest);
        usedSeat.add(pair.seat);
        seated.push({
            guestNode: pair.guest,
            guestType: guestTypeFromNode(pair.guest.name),
            leavePoint,
            seatPoint: pair.seat,
            table,
        });
    }

    const waiting: DiningLayout[] = [];
    for (let i = 0; i < guests.length; i++) {
        if (usedGuest.has(guests[i])) {
            continue;
        }
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

function collectSeats(stationRoot: Node): Node[] {
    const seats: Node[] = [];
    for (let i = 0; i < stationRoot.children.length; i++) {
        const node = stationRoot.children[i];
        if (!node.name.toLowerCase().startsWith("chair")) {
            continue;
        }
        const seat = findNamedDescendant(node, "SeatPoint");
        if (seat) {
            seats.push(seat);
        }
    }
    if (seats.length === 0) {
        const seat = findNamedDescendant(stationRoot, "SeatPoint");
        if (seat) {
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
