export type GuestState = "entering" | "seated" | "leaving" | "gone";

export class Guest {
    state: GuestState = "entering";
    orderId = "burgerbaked";

    constructor(public readonly id: string) {}
}
