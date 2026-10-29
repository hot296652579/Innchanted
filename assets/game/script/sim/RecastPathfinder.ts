import { Vec3 } from "cc";
import { IAgentParameters } from "../navmesh/navigation/INavigationEngine";
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

    setMaxSpeed(agentId: number, speed: number): void {
        this.recast.crowd?.updateAgentParameters(agentId, { maxSpeed: Math.max(0.2, speed) } as IAgentParameters);
    }

    setAgentRadius(agentId: number, radius: number): void {
        this.recast.crowd?.updateAgentParameters(agentId, { radius: Math.max(0.01, radius) } as IAgentParameters);
    }
}
