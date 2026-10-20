/** 本关倒计时 + 入箱金币。星级只读 stars 门槛，结算时再算。 */
export class ShiftScore {
    remain: number;
    gold = 0;
    private _lastShown = -1;
    private _timeUp = false;

    constructor(public readonly duration: number) {
        this.remain = Math.max(0, duration);
        this._lastShown = Math.ceil(this.remain);
    }

    tick(dt: number): { secondChanged: boolean; timeUp: boolean } {
        if (this.remain <= 0) {
            return { secondChanged: false, timeUp: false };
        }
        this.remain = Math.max(0, this.remain - dt);
        const shown = Math.ceil(this.remain);
        const secondChanged = shown !== this._lastShown;
        this._lastShown = shown;
        let timeUp = false;
        if (this.remain <= 0 && !this._timeUp) {
            this._timeUp = true;
            timeUp = true;
        }
        return { secondChanged, timeUp };
    }

    bank(count: number): void {
        if (count > 0) {
            this.gold += count;
        }
    }

    get shownRemain(): number {
        return Math.max(0, Math.ceil(this.remain));
    }
}
