import { Vec3 } from "cc";
import { GridAgent } from "../sim/GridAgent";
import { StateMachine } from "./StateMachine";

export type CommandState = "idle" | "move";

export class CommandFsm {
    private readonly _fsm: StateMachine<CommandState>;
    private _onArrive: (() => void) | null = null;
    private _arrived = false;

    constructor(private readonly agent: GridAgent) {
        this._fsm = new StateMachine<CommandState>(
            {
                idle: {},
                move: {
                    update: () => {
                        if (this._arrived || !this.agent.arrived()) {
                            return;
                        }
                        this._arrived = true;
                        const cb = this._onArrive;
                        this._onArrive = null;
                        this.agent.stop();
                        this._fsm.change("idle");
                        cb?.();
                    },
                },
            },
            "idle",
        );
    }

    get state(): CommandState {
        return this._fsm.state;
    }

    moveTo(dest: Vec3, onArrive: () => void): void {
        this._arrived = false;
        this._onArrive = onArrive;
        this.agent.goto(dest);
        if (this._fsm.state !== "move") {
            this._fsm.change("move");
        }
    }

    cancel(): void {
        this._arrived = true;
        this._onArrive = null;
        this.agent.stop();
        this._fsm.change("idle");
    }

    update(dt: number): void {
        this._fsm.update(dt);
    }
}
