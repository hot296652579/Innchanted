import { Vec3 } from "cc";
import { IPathfinder } from "./IPathfinder";

export class GridAgent {
    public dest: Vec3 | null = null;

    constructor(
        public readonly pathfinder: IPathfinder,
        public readonly agentId: number,
        public arriveRadius = 1.2,
    ) { }

    goto(world: Vec3): void {
        const dest = world.clone();
        dest.y = this.pathfinder.getPosition(this.agentId).y;
        this.dest = this.pathfinder.snap(dest);
        this.pathfinder.goto(this.agentId, this.dest);
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
        const distSq = dx * dx + dz * dz;
        if (distSq <= this.arriveRadius * this.arriveRadius) {
            return true;
        }
        const stuckRange = this.arriveRadius + 0.6;
        const vel = this.pathfinder.getVelocity(this.agentId);
        return distSq <= stuckRange * stuckRange && vel.lengthSqr() < 0.05;
    }
}
