import { CookProcess } from "./CookProcess";
import { ItemStack } from "./ItemStack";

export type StationType = "place" | "cook";

export class Station {
    public slot: ItemStack | null = null;
    public cook: CookProcess | null = null;

    constructor(
        public readonly id: string,
        public readonly type: StationType = "place",
    ) {
        if (type === "cook") {
            this.cook = new CookProcess();
        }
    }
}
