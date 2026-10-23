export enum GuestState {
    Entering = "entering",
    Queuing = "queuing",
    WaitingEscort = "waitingEscort",
    Escorted = "escorted",
    Seated = "seated",
    Reacting = "reacting",
    Leaving = "leaving",
    Gone = "gone",
}

export enum GuestLeaveReason {
    Served = "served",
    Angry = "angry",
    Scared = "scared",
}

export enum WaitSignal {
    Urge = "urge",
    Timeout = "timeout",
    Sleep = "sleep",
}

export class Guest {
    state = GuestState.Entering;
    readonly orderIds: string[];
    readonly sleepItemId: string;
    orderIndex = 0;
    waitTime: number;
    waited = 0;
    urged = false;
    sleeping = false;
    slept = false;
    tableId = "";
    leaveReason: GuestLeaveReason | null = null;

    constructor(
        public readonly id: string,
        def: { waitTime: number; orders: { orderId: string }[]; sleepItemId?: string },
    ) {
        this.orderIds = def.orders.map((order) => order.orderId).filter((id) => !!id);
        this.waitTime = def.waitTime;
        this.sleepItemId = def.sleepItemId ?? "";
    }

    get orderId(): string {
        return this.orderIds[this.orderIndex] ?? "";
    }

    /** 睡着要解药，醒着要当前订单。 */
    get wantedId(): string {
        return this.sleeping ? this.sleepItemId : this.orderId;
    }

    get seated(): boolean {
        return this.state === GuestState.Seated;
    }

    /** 去坐、坐着、反应中：这张桌还被占着。 */
    get usingTable(): boolean {
        return this.state === GuestState.Entering
            || this.state === GuestState.Seated
            || this.state === GuestState.Reacting;
    }

    /** 还在 WaitPoint 排队，可被引座。 */
    get atWait(): boolean {
        return this.state === GuestState.Queuing
            || this.state === GuestState.WaitingEscort
            || this.state === GuestState.Escorted;
    }

    canAccept(itemId: string): boolean {
        return this.seated && !this.sleeping && this.orderId === itemId;
    }

    canWake(itemId: string): boolean {
        return this.seated && this.sleeping && !!this.sleepItemId && this.sleepItemId === itemId;
    }

    wake(): void {
        this.sleeping = false;
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

    /** 入座后累计等待。半程催一次，超时离席。会睡觉的客人半程入睡，计时暂停。 */
    tickWait(dt: number): WaitSignal | null {
        if (!this.seated || this.sleeping) {
            return null;
        }
        this.waited += dt;
        if (this.waited >= this.waitTime) {
            return WaitSignal.Timeout;
        }
        if (this.sleepItemId && !this.slept && this.waited >= this.waitTime * 0.5) {
            this.sleeping = true;
            this.slept = true;
            this.urged = true;
            return WaitSignal.Sleep;
        }
        if (!this.urged && this.waited >= this.waitTime * 0.5) {
            this.urged = true;
            return WaitSignal.Urge;
        }
        return null;
    }
}
