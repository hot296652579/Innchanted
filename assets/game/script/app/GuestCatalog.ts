import { ConfigManager } from "../../../framework/config/ConfigManager";

export type GuestDef = {
    id: string;
    waitTime: number;
    orderId: string;
    orderPrefab: string;
};


export function guestTypeFromNode(name: string): string {
    return name.replace(/_\d+$/, "").toLowerCase();
}

export function allGuestDefs(): GuestDef[] {
    return ConfigManager.getInstance().getTable<GuestDef>("guests");
}

export function findGuestDef(typeId: string): GuestDef | null {
    const table = allGuestDefs();
    for (let i = 0; i < table.length; i++) {
        if (table[i].id === typeId) {
            return table[i];
        }
    }
    return null;
}
