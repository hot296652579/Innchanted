import { ConfigManager } from "../../../framework/config/ConfigManager";
import { StationType } from "../domain/Station";

export type CookRecipe = {
    stationType: StationType | string;
    input: string;
    output: string;
    duration: number;
};

const FALLBACK: CookRecipe[] = [
    { stationType: StationType.Cook, input: "burger", output: "burgerbaked", duration: 2 },
    { stationType: StationType.Cook, input: "chickenleg", output: "chickenlegbaked", duration: 2 },
];

function cookRecipes(): CookRecipe[] {
    return ConfigManager.getInstance().getTable<CookRecipe>("recipes") ?? FALLBACK;
}

export function findCookRecipe(inputId: string): CookRecipe | null {
    const table = cookRecipes();
    for (let i = 0; i < table.length; i++) {
        const row = table[i];
        if (row.stationType === StationType.Cook && row.input === inputId) {
            return row;
        }
    }
    return null;
}

/** 是否灶炉成品（烘培完成的订单）。 */
export function isCookedOutput(itemId: string): boolean {
    const table = cookRecipes();
    for (let i = 0; i < table.length; i++) {
        if (table[i].stationType === StationType.Cook && table[i].output === itemId) {
            return true;
        }
    }
    return false;
}
