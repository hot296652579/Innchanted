import { Vec3 } from "cc";
import { IPathfinder } from "./IPathfinder";

export class GridAgent {
    public dest: Vec3 | null = null;

    constructor(
        public readonly pathfinder: IPathfinder,
        public readonly agentId: number,
        public arriveRadius = 0.45,
    ) {}

    goto(world: Vec3): void {
        this.dest = world.clone();
        this.pathfinder.goto(this.agentId, world);
    }

    stop(): void {
        this.dest = null;
        this.pathfinder.stop(this.agentId);
    }

    arrived(): boolean {
        if (!this.dest) {
            return true;
        }
        const p = this.pathfinder.getPosition(this.agentId);
        const dx = p.x - this.dest.x;
        const dz = p.z - this.dest.z;
        return dx * dx + dz * dz <= this.arriveRadius * this.arriveRadius;
    }
}
