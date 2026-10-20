import { ConfigManager } from "../../../framework/config/ConfigManager";

export type ItemDef = {
    id: string;
    stack: number;
    displayName: string;
    gold?: number;
};

export function findItemDef(itemId: string): ItemDef | null {
    const table = ConfigManager.getInstance().getTable<ItemDef>("items");
    if (!table) {
        return null;
    }
    for (let i = 0; i < table.length; i++) {
        if (table[i].id === itemId) {
            return table[i];
        }
    }
    return null;
}

/** 上菜后掉落的金币数量。成品在 items.json 配 gold；没配则 1。 */
export function goldOf(itemId: string): number {
    const gold = findItemDef(itemId)?.gold;
    if (gold === undefined || gold === null) {
        return 1;
    }
    return Math.max(0, gold);
}
