import { ConfigManager } from "../../../framework/config/ConfigManager";

export type CookRecipe = {
    stationType: string;
    input: string;
    output: string;
    duration: number;
};

const FALLBACK: CookRecipe[] = [
    { stationType: "cook", input: "burger", output: "burgerbaked", duration: 2 },
];

export function findCookRecipe(inputId: string): CookRecipe | null {
    const table = ConfigManager.getInstance().getTable<CookRecipe>("recipes") ?? FALLBACK;
    for (let i = 0; i < table.length; i++) {
        const row = table[i];
        if (row.stationType === "cook" && row.input === inputId) {
            return row;
        }
    }
    return null;
}
