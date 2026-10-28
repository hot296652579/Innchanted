import { ConfigManager } from "../../../framework/config/ConfigManager";

export type ItemDef = {
    id: string;
    stack: number;
    displayName: string;
    gold?: number;
    use?: string;
    effects?: string[];
    prefab?: string;
};

export function allItemDefs(): ItemDef[] {
    return ConfigManager.getInstance().getTable<ItemDef>("items") ?? [];
}

export function findItemDef(itemId: string): ItemDef | null {
    const table = allItemDefs();
    for (let i = 0; i < table.length; i++) {
        if (table[i].id === itemId) {
            return table[i];
        }
    }
    return null;
}

export function itemPrefabPath(itemId: string): string {
    return findItemDef(itemId)?.prefab ?? "";
}

/** 上菜后掉落的金币数量。成品在 items.json 配 gold；没配则 1。 */
export function goldOf(itemId: string): number {
    const gold = findItemDef(itemId)?.gold;
    if (gold === undefined || gold === null) {
        return 1;
    }
    return Math.max(0, gold);
}

/** 点自身可喝掉。新药在 items.json 加 use: drink。 */
export function isDrinkable(itemId: string): boolean {
    return findItemDef(itemId)?.use === "drink";
}

export function itemEffects(itemId: string): string[] {
    return findItemDef(itemId)?.effects ?? [];
}
