import { Vec3 } from "cc";
import { GameEvent } from "../../../framework/event/EventName";
import { EventManager } from "../../../framework/event/EventManager";
import { Command, CommandTarget } from "../domain/Command";
import { CommandFsm } from "../fsm/CommandFsm";

export class CommandService {
    constructor(private readonly fsm: CommandFsm) {}

    issue(target: CommandTarget, dest: Vec3 | null, onArrive: (() => void) | null): void {
        const command: Command = { target };
        EventManager.getInstance().emit(GameEvent.COMMAND_ISSUED, command);

        if (target.kind === "self") {
            this.fsm.cancel();
            return;
        }
        if (!dest) {
            return;
        }
        this.fsm.moveTo(dest, () => onArrive?.());
    }

    cancel(): void {
        this.fsm.cancel();
    }
}
