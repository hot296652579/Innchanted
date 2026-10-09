export type StateHandler = {
    enter?: () => void;
    exit?: () => void;
    update?: (dt: number) => void;
};

export class StateMachine<S extends string> {
    private _state: S;

    constructor(
        private readonly handlers: Record<S, StateHandler>,
        initial: S,
    ) {
        this._state = initial;
        this.handlers[initial].enter?.();
    }

    get state(): S {
        return this._state;
    }

    change(next: S): void {
        if (next === this._state) {
            return;
        }
        this.handlers[this._state].exit?.();
        this._state = next;
        this.handlers[next].enter?.();
    }

    update(dt: number): void {
        this.handlers[this._state].update?.(dt);
    }
}
