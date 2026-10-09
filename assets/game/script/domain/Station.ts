import { ItemStack } from "./ItemStack";

export type StationType = "place";

export class Station {
    public slot: ItemStack | null = null;

    constructor(
        public readonly id: string,
        public readonly type: StationType = "place",
    ) {}
}
