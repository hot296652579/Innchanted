import { Vec3 } from "cc";
import RecastDetourManager from "../navmesh/recastdetourjs/tool/RecastDetourManager";
import { AgentMoveParams, IPathfinder } from "./IPathfinder";

/** 调用寻路引擎的API实现寻路 */
export class RecastPathfinder implements IPathfinder {
    constructor(private readonly recast: RecastDetourManager) { }

    addAgent(worldPos: Vec3, params: AgentMoveParams): number {
        return this.recast.addAgents(worldPos, params);
    }

    goto(agentId: number, worldPos: Vec3): void {
        const dest = worldPos.clone();
        dest.y = this.getPosition(agentId).y;
        this.recast.agentGotoByIndex(agentId, dest);
    }

    snap(worldPos: Vec3): Vec3 {
        return this.recast.snapToNav(worldPos);
    }

    stop(agentId: number): void {
        this.recast.agentStopByIndex(agentId);
    }

    update(dt: number): void {
        this.recast.update(dt);
    }

    getPosition(agentId: number): Vec3 {
        return this.recast.crowd!.getAgentPosition(agentId);
    }

    getVelocity(agentId: number): Vec3 {
        return this.recast.crowd!.getAgentVelocity(agentId);
    }

    getNextPoint(agentId: number): Vec3 {
        return this.recast.crowd!.getAgentNextTargetPath(agentId);
    }
}
