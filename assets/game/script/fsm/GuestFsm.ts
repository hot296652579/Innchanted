import { Guest, GuestState } from "../domain/Guest";

/** 只改 Guest Domain，不碰节点。 */
export class GuestFsm {
    constructor(private readonly guest: Guest) {}

    get state(): GuestState {
        return this.guest.state;
    }

    sit(): void {
        this.guest.state = "seated";
    }

    serve(): boolean {
        if (this.guest.state !== "seated") {
            return false;
        }
        this.guest.state = "leaving";
        return true;
    }

    finish(): void {
        this.guest.state = "gone";
    }
}
