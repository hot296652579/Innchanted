import { ItemStack } from "./ItemStack";

export class Actor {
    public hand: ItemStack | null = null;
    public speed = 4.5;

    constructor(public readonly id: string) {}
}
