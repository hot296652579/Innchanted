export const ITEM_STACK_CAP = 3;

export class ItemStack {
    constructor(
        public itemId: string,
        public count: number,
    ) {
        this.count = Math.max(0, count);
    }

    clone(): ItemStack {
        return new ItemStack(this.itemId, this.count);
    }

    get empty(): boolean {
        return this.count <= 0;
    }

    sameAs(other: ItemStack | null): boolean {
        return !!other && this.itemId === other.itemId;
    }

    /** 把 incoming 叠进 this，返回 incoming 还剩多少。不同物品不叠。 */
    absorb(incoming: ItemStack, cap = ITEM_STACK_CAP): number {
        if (!this.sameAs(incoming)) {
            return incoming.count;
        }
        const space = Math.max(0, cap - this.count);
        const moved = Math.min(space, incoming.count);
        this.count += moved;
        incoming.count -= moved;
        return incoming.count;
    }
}
