export type CookState = "idle" | "cooking" | "ready";

export class CookProcess {
    state: CookState = "idle";
    elapsed = 0;
    duration = 2;
    inputId = "";
    outputId = "";

    get progress(): number {
        if (this.duration <= 0) {
            return 1;
        }
        return Math.min(1, this.elapsed / this.duration);
    }

    start(inputId: string, outputId: string, duration: number): void {
        this.state = "cooking";
        this.elapsed = 0;
        this.duration = duration;
        this.inputId = inputId;
        this.outputId = outputId;
    }

    update(dt: number): CookState {
        if (this.state !== "cooking") {
            return this.state;
        }
        this.elapsed += dt;
        if (this.elapsed >= this.duration) {
            this.elapsed = this.duration;
            this.state = "ready";
        }
        return this.state;
    }

    reset(): void {
        this.state = "idle";
        this.elapsed = 0;
        this.inputId = "";
        this.outputId = "";
    }
}
