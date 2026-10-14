import { CookProcess } from "./CookProcess";
import { ItemStack } from "./ItemStack";

export enum StationType {
    Place = "place",
    Cook = "cook",
    Table = "table",
    Chest = "chest",
}

export class Station {
    public slot: ItemStack | null = null;
    public cook: CookProcess | null = null;

    constructor(
        public readonly id: string,
        public readonly type: StationType = StationType.Place,
    ) {
        if (type === StationType.Cook) {
            this.cook = new CookProcess();
        }
    }
}
