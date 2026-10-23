import { Guest, GuestLeaveReason, GuestState } from "../domain/Guest";

/** 只改 Guest Domain，不碰节点。 */
export class GuestFsm {
    constructor(private readonly guest: Guest) {}

    get state(): GuestState {
        return this.guest.state;
    }

    queue(): void {
        this.guest.state = GuestState.Queuing;
    }

    waitEscort(): void {
        this.guest.state = GuestState.WaitingEscort;
    }

    confirmEscort(): void {
        if (this.guest.state === GuestState.Queuing || this.guest.state === GuestState.WaitingEscort) {
            this.guest.state = GuestState.Escorted;
        }
    }

    goSeat(): void {
        this.guest.state = GuestState.Entering;
    }

    sit(): void {
        this.guest.state = GuestState.Seated;
        this.guest.waited = 0;
        this.guest.urged = false;
        this.guest.sleeping = false;
        this.guest.slept = false;
        this.guest.leaveReason = null;
    }

    serve(): boolean {
        if (!this.guest.seated) {
            return false;
        }
        this.guest.state = GuestState.Reacting;
        this.guest.leaveReason = GuestLeaveReason.Served;
        return true;
    }

    timeout(): boolean {
        if (!this.guest.seated) {
            return false;
        }
        this.guest.state = GuestState.Reacting;
        this.guest.leaveReason = GuestLeaveReason.Angry;
        return true;
    }

    leave(): void {
        if (this.guest.state === GuestState.Reacting || this.guest.seated) {
            this.guest.state = GuestState.Leaving;
        }
    }

    finish(): void {
        this.guest.state = GuestState.Gone;
    }
}
