import { Guest, GuestState } from "../domain/Guest";

/** 只改 Guest Domain，不碰节点。 */
export class GuestFsm {
    constructor(private readonly guest: Guest) {}

    get state(): GuestState {
        return this.guest.state;
    }

    queue(): void {
        this.guest.state = "queuing";
    }

    goSeat(): void {
        this.guest.state = "entering";
    }

    sit(): void {
        this.guest.state = "seated";
        this.guest.waited = 0;
        this.guest.urged = false;
        this.guest.leaveReason = null;
    }

    serve(): boolean {
        if (this.guest.state !== "seated") {
            return false;
        }
        this.guest.state = "reacting";
        this.guest.leaveReason = "served";
        return true;
    }

    timeout(): boolean {
        if (this.guest.state !== "seated") {
            return false;
        }
        this.guest.state = "reacting";
        this.guest.leaveReason = "angry";
        return true;
    }

    leave(): void {
        if (this.guest.state === "reacting" || this.guest.state === "seated") {
            this.guest.state = "leaving";
        }
    }

    finish(): void {
        this.guest.state = "gone";
    }
}
