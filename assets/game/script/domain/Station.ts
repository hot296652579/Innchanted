import { BarrelTank } from "./Barrel";
import { CookProcess } from "./CookProcess";
import { ItemStack } from "./ItemStack";

export enum StationType {
    Place = "place",
    Cook = "cook",
    Table = "table",
    Chest = "chest",
    OriginalBarrel = "originalbarrel",
    MagicBarrel = "magicbarrel",
}

export class Station {
    public slot: ItemStack | null = null;
    public cook: CookProcess | null = null;
    public barrel: BarrelTank | null = null;
    public lockRemain = 0;

    constructor(
        public readonly id: string,
        public readonly type: StationType = StationType.Place,
    ) {
        if (type === StationType.Cook) {
            this.cook = new CookProcess();
        }
        if (type === StationType.OriginalBarrel || type === StationType.MagicBarrel) {
            this.barrel = new BarrelTank();
        }
    }

    get locked(): boolean {
        return this.lockRemain > 0;
    }

    /** 未上锁才加锁。成功返回 true。 */
    tryLock(seconds: number): boolean {
        if (this.locked || this.type !== StationType.Cook || seconds <= 0) {
            return false;
        }
        this.lockRemain = seconds;
        return true;
    }

    /** 刚解锁时返回 true。 */
    tickLock(dt: number): boolean {
        if (this.lockRemain <= 0) {
            return false;
        }
        this.lockRemain -= dt;
        if (this.lockRemain > 0) {
            return false;
        }
        this.lockRemain = 0;
        return true;
    }
}
