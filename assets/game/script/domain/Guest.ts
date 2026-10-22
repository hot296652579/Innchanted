export type GuestState = "entering" | "queuing" | "waitingEscort" | "escorted" | "seated" | "reacting" | "leaving" | "gone";
export type GuestLeaveReason = "served" | "angry" | null;
export type WaitSignal = "urge" | "timeout" | null;

export class Guest {
    state: GuestState = "entering";
    readonly orderIds: string[];
    orderIndex = 0;
    waitTime: number;
    waited = 0;
    urged = false;
    tableId = "";
    leaveReason: GuestLeaveReason = null;

    constructor(
        public readonly id: string,
        def: { waitTime: number; orders: { orderId: string }[] },
    ) {
        this.orderIds = def.orders.map((order) => order.orderId).filter((id) => !!id);
        this.waitTime = def.waitTime;
    }

    get orderId(): string {
        return this.orderIds[this.orderIndex] ?? "";
    }

    canAccept(itemId: string): boolean {
        return this.state === "seated" && this.orderId === itemId;
    }

    /** 收下当前菜。还有下一道则推进并重置等待，返回 true。 */
    advanceOrder(): boolean {
        if (this.orderIndex + 1 >= this.orderIds.length) {
            return false;
        }
        this.orderIndex += 1;
        this.waited = 0;
        this.urged = false;
        return true;
    }

    /** 入座后累计等待。半程催一次，超时离席。 */
    tickWait(dt: number): WaitSignal {
        if (this.state !== "seated") {
            return null;
        }
        this.waited += dt;
        if (this.waited >= this.waitTime) {
            return "timeout";
        }
        if (!this.urged && this.waited >= this.waitTime * 0.5) {
            this.urged = true;
            return "urge";
        }
        return null;
    }
}
