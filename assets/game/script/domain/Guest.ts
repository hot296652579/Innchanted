export type GuestState = "entering" | "seated" | "leaving" | "gone";

export class Guest {
    state: GuestState = "entering";
    orderId = "burgerbaked";
    tableId = "";

    constructor(public readonly id: string) {}

    canAccept(itemId: string): boolean {
        return this.state === "seated" && this.orderId === itemId;
    }
}
