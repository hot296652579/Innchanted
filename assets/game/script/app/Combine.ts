import { Prefab } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ConfigManager } from "../../../framework/config/ConfigManager";
import { ResourceManager } from "../../../framework/resource/ResourceManager";
import { ItemStack } from "../domain/ItemStack";
import { Station, StationType } from "../domain/Station";

export type CombineFrom = "hand" | "station";
export type CombineTo = "hand" | "station";

export type CombineInput = {
    itemId: string;
    count?: number;
    from?: CombineFrom;
};

export type CombineOutput = {
    itemId: string;
    count?: number;
    to?: CombineTo;
};

/** 手 + 台 两格合成。以后加行即可，不必改代码。 */
export type CombineRecipe = {
    id: string;
    inputs: CombineInput[];
    output: CombineOutput;
    stationTypes?: string[];
    prefab: string;
};

const FALLBACK: CombineRecipe[] = [
    {
        id: "comb_burger_brown",
        inputs: [
            { itemId: "magicdrink_brown", count: 1, from: "hand" },
            { itemId: "burgerbaked", count: 1, from: "station" },
        ],
        output: { itemId: "combburgerbrown", count: 1, to: "station" },
        stationTypes: [StationType.Place, StationType.Table, StationType.Cook],
        prefab: "prefab/items/CombBurgerBrown",
    },
    {
        id: "comb_burger_green",
        inputs: [
            { itemId: "magicdrink_green", count: 1, from: "hand" },
            { itemId: "burgerbaked", count: 1, from: "station" },
        ],
        output: { itemId: "combburgergreen", count: 1, to: "station" },
        stationTypes: [StationType.Place, StationType.Table, StationType.Cook],
        prefab: "prefab/items/CombBurgerGreen",
    },
];

const DEFAULT_TYPES: string[] = [StationType.Place, StationType.Table, StationType.Cook];

function combineRecipes(): CombineRecipe[] {
    return ConfigManager.getInstance().getTable<CombineRecipe>("combines") ?? FALLBACK;
}

export function inputCount(input: CombineInput): number {
    return Math.max(1, input.count ?? 1);
}

export function outputCount(recipe: CombineRecipe): number {
    return Math.max(1, recipe.output.count ?? 1);
}

export function findCombineRecipe(hand: ItemStack, station: Station): CombineRecipe | null {
    const slot = station.slot;
    if (!slot || slot.empty || hand.empty) {
        return null;
    }
    const table = combineRecipes();
    for (let i = 0; i < table.length; i++) {
        if (matches(table[i], hand, slot, station.type)) {
            return table[i];
        }
    }
    return null;
}

function matches(row: CombineRecipe, hand: ItemStack, slot: ItemStack, type: StationType): boolean {
    const types = row.stationTypes && row.stationTypes.length > 0 ? row.stationTypes : DEFAULT_TYPES;
    if (types.indexOf(type) < 0) {
        return false;
    }
    const inputs = row.inputs;
    if (!inputs || inputs.length !== 2) {
        return false;
    }
    const pinnedHand = findFrom(inputs, "hand");
    const pinnedStation = findFrom(inputs, "station");
    if (pinnedHand && pinnedStation) {
        return enough(hand, pinnedHand) && enough(slot, pinnedStation);
    }
    return (
        (enough(hand, inputs[0]) && enough(slot, inputs[1]))
        || (enough(hand, inputs[1]) && enough(slot, inputs[0]))
    );
}

function findFrom(inputs: CombineInput[], from: CombineFrom): CombineInput | null {
    for (let i = 0; i < inputs.length; i++) {
        if (inputs[i].from === from) {
            return inputs[i];
        }
    }
    return null;
}

function enough(stack: ItemStack, need: CombineInput): boolean {
    return stack.itemId === need.itemId && stack.count >= inputCount(need);
}

export function handNeedOf(recipe: CombineRecipe, hand: ItemStack): CombineInput | null {
    const pinned = findFrom(recipe.inputs, "hand");
    if (pinned) {
        return pinned;
    }
    for (let i = 0; i < recipe.inputs.length; i++) {
        if (recipe.inputs[i].itemId === hand.itemId) {
            return recipe.inputs[i];
        }
    }
    return recipe.inputs[0] ?? null;
}

export function stationNeedOf(recipe: CombineRecipe, slot: ItemStack): CombineInput | null {
    const pinned = findFrom(recipe.inputs, "station");
    if (pinned) {
        return pinned;
    }
    for (let i = 0; i < recipe.inputs.length; i++) {
        if (recipe.inputs[i].itemId === slot.itemId) {
            return recipe.inputs[i];
        }
    }
    return recipe.inputs[1] ?? recipe.inputs[0] ?? null;
}

/** 预加载合成成品模型。 */
export class CombineCatalog {
    private readonly _prefabs = new Map<string, Prefab>();

    async load(): Promise<void> {
        const res = ResourceManager.getInstance();
        const table = combineRecipes();
        for (let i = 0; i < table.length; i++) {
            const row = table[i];
            if (!row.prefab || this._prefabs.has(row.output.itemId)) {
                continue;
            }
            const prefab = await res.loadPrefab(row.prefab, BundlesEnum.Game);
            if (!prefab) {
                console.warn("[Combine] 未找到", row.prefab);
                continue;
            }
            this._prefabs.set(row.output.itemId, prefab);
        }
    }

    prefab(itemId: string): Prefab | null {
        return this._prefabs.get(itemId) ?? null;
    }
}
