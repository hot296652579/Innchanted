import { BarrelTank } from "./Barrel";
import { CookProcess } from "./CookProcess";
import { ItemStack } from "./ItemStack";

export enum StationType {
    Place = "place",
    Cook = "cook",
    Table = "table",
    RoundTable = "roundtable",
    Chest = "chest",
    OriginalBarrel = "originalbarrel",
    MagicBarrel = "magicbarrel",
    ItemStand = "itemstand",
    MagicJar = "magicjar",
}

export class Station {
    public slot: ItemStack | null = null;
    public cook: CookProcess | null = null;
    public barrel: BarrelTank | null = null;
    public seatedGuestType: string | null = null;
    public lockRemain = 0;
    public windUnlockItemId = "";

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

    get winded(): boolean {
        return this.windUnlockItemId.length > 0;
    }

    /** 未上锁才加锁。成功返回 true。 */
    tryLock(seconds: number): boolean {
        if (this.locked || this.winded || this.type !== StationType.Cook || seconds <= 0) {
            return false;
        }
        this.lockRemain = seconds;
        return true;
    }

    /** 旋风封台，用药水才能解。成功返回 true。 */
    tryWind(unlockItemId: string): boolean {
        if (this.winded || this.locked || !unlockItemId) {
            return false;
        }
        this.windUnlockItemId = unlockItemId;
        return true;
    }

    clearWind(): void {
        this.windUnlockItemId = "";
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
