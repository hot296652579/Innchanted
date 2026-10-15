export type GuestState = "entering" | "queuing" | "seated" | "reacting" | "leaving" | "gone";
export type GuestLeaveReason = "served" | "angry" | null;
export type WaitSignal = "urge" | "timeout" | null;

export class Guest {
    state: GuestState = "entering";
    orderId: string;
    waitTime: number;
    waited = 0;
    urged = false;
    tableId = "";
    leaveReason: GuestLeaveReason = null;

    constructor(
        public readonly id: string,
        def: { orderId: string; waitTime: number },
    ) {
        this.orderId = def.orderId;
        this.waitTime = def.waitTime;
    }

    canAccept(itemId: string): boolean {
        return this.state === "seated" && this.orderId === itemId;
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
