import { Vec3 } from "cc";

export interface AgentMoveParams {
    radius: number;
    height: number;
    maxAcceleration: number;
    maxSpeed: number;
    collisionQueryRange: number;
    pathOptimizationRange: number;
    separationWeight: number;
}

export interface IPathfinder {
    addAgent(worldPos: Vec3, params: AgentMoveParams): number;
    goto(agentId: number, worldPos: Vec3): void;
    stop(agentId: number): void;
    update(dt: number): void;
    getPosition(agentId: number): Vec3;
    getVelocity(agentId: number): Vec3;
    getNextPoint(agentId: number): Vec3;
}
