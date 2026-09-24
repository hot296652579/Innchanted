import BaseSingleton from "../../../framework/base/BaseSingleton";

type BattleResult = "none" | "win" | "lose";

export class BattleManager extends BaseSingleton {

    public async init(): Promise<void> {
    }

    public destroy(): void {

    }

}
