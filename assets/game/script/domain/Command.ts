export type CommandTarget =
    | { kind: "ground"; x: number; y: number; z: number }
    | { kind: "self" }
    | { kind: "place"; stationId: string }
    | { kind: "enemy"; enemyId: string }
    | { kind: "guest"; guestId: string };

export interface Command {
    target: CommandTarget;
}
