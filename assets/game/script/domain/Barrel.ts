export enum BarrelColor {
    Brown = "brown",
    Green = "green",
    Red = "red",
    Yellow = "yellow",
}

export const BARREL_COLORS: BarrelColor[] = [BarrelColor.Brown, BarrelColor.Green, BarrelColor.Red];

export const BARREL_MAT_PATH: Record<BarrelColor, string> = {
    [BarrelColor.Brown]: "mat/brown_material",
    [BarrelColor.Green]: "mat/green_material",
    [BarrelColor.Red]: "mat/red_material",
    [BarrelColor.Yellow]: "mat/yellow_material",
};

export const BARREL_MAX_CHARGES = 3;
export const BARREL_ACCEPT_SEC = 1;

export type BarrelAcceptKind = "pulp" | "fill" | "drink";

/** OriginalBarrel0 → 棕，OriginalBarrel1 → 绿，OriginalBarrel2 → 红。 */
export function originalBarrelColor(name: string): BarrelColor {
    const matched = name.toLowerCase().match(/^originalbarrel(\d+)/);
    const index = matched ? Number(matched[1]) : 0;
    return BARREL_COLORS[index] ?? BarrelColor.Brown;
}

export function pulpItemId(color: BarrelColor): string {
    return `originalpulp_${color}`;
}

export function drinkItemId(color: BarrelColor): string {
    return `magicdrink_${color}`;
}

export function colorFromItemId(itemId: string): BarrelColor | null {
    const id = itemId.toLowerCase();
    for (let i = 0; i < BARREL_COLORS.length; i++) {
        const color = BARREL_COLORS[i];
        if (id.endsWith(`_${color}`) || id.includes(color)) {
            return color;
        }
    }
    return null;
}

export function isPulp(itemId: string): boolean {
    return itemId.toLowerCase().startsWith("originalpulp");
}

export function isMagicDrink(itemId: string): boolean {
    return itemId.toLowerCase().startsWith("magicdrink");
}

/** 魔法桶液位 + 1 秒接取/灌装。原浆桶只用 color 表示源颜色。 */
export class BarrelTank {
    color: BarrelColor | null = null;
    charges = 0;
    acceptRemain = 0;
    acceptDuration = BARREL_ACCEPT_SEC;
    acceptKind: BarrelAcceptKind | null = null;
    acceptColor: BarrelColor | null = null;

    get accepting(): boolean {
        return this.acceptRemain > 0 && this.acceptKind !== null;
    }

    get progress(): number {
        if (this.acceptDuration <= 0) {
            return 1;
        }
        return Math.min(1, 1 - this.acceptRemain / this.acceptDuration);
    }

    beginAccept(kind: BarrelAcceptKind, color: BarrelColor, duration = BARREL_ACCEPT_SEC): boolean {
        if (this.accepting) {
            return false;
        }
        this.acceptKind = kind;
        this.acceptColor = color;
        this.acceptDuration = duration;
        this.acceptRemain = duration;
        return true;
    }

    cancelAccept(): void {
        this.acceptKind = null;
        this.acceptColor = null;
        this.acceptRemain = 0;
    }

    tick(dt: number): { kind: BarrelAcceptKind; color: BarrelColor } | null {
        if (!this.accepting || !this.acceptKind || !this.acceptColor) {
            return null;
        }
        this.acceptRemain -= dt;
        if (this.acceptRemain > 0) {
            return null;
        }
        const done = { kind: this.acceptKind, color: this.acceptColor };
        this.cancelAccept();
        return done;
    }

    fill(color: BarrelColor): void {
        this.color = color;
        this.charges = BARREL_MAX_CHARGES;
    }

    draw(): BarrelColor | null {
        if (!this.color || this.charges <= 0) {
            return null;
        }
        const color = this.color;
        this.charges -= 1;
        if (this.charges <= 0) {
            this.color = null;
            this.charges = 0;
        }
        return color;
    }
}
