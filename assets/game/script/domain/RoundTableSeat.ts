import { Station, StationType } from "./Station";

export type RoundSeatVerdict = "pending" | "match" | "mismatch";

/** 成对比较：1-2、3-4。对桌有人则比类型，空着先不判。 */
export function occupyRoundTable(
    station: Station,
    guestType: string,
    tables: readonly Station[],
): RoundSeatVerdict {
    station.seatedGuestType = guestType;
    const neighbors = adjacentRoundTables(station.id, tables);
    if (neighbors.length === 0) {
        return "pending";
    }
    for (let i = 0; i < neighbors.length; i++) {
        if (neighbors[i].seatedGuestType !== guestType) {
            return "mismatch";
        }
    }
    return "match";
}

export function vacateRoundTable(station: Station): void {
    station.seatedGuestType = null;
}

function adjacentRoundTables(tableId: string, tables: readonly Station[]): Station[] {
    const index = roundTableIndex(tableId);
    if (index < 1) {
        return [];
    }
    const seated: Station[] = [];
    for (let i = 0; i < tables.length; i++) {
        const other = tables[i];
        if (other.type !== StationType.RoundTable || !other.seatedGuestType) {
            continue;
        }
        const otherIndex = roundTableIndex(other.id);
        if (otherIndex === pairMate(index)) {
            seated.push(other);
        }
    }
    return seated;
}

function pairMate(index: number): number {
    return index % 2 === 1 ? index + 1 : index - 1;
}

function roundTableIndex(id: string): number {
    const matched = id.toLowerCase().match(/roundtable(\d+)/);
    return matched ? Number(matched[1]) : -1;
}
