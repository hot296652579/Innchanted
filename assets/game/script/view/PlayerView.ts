import { _decorator, Component, Vec3, v3 } from "cc";
import { IPathfinder } from "../sim/IPathfinder";

const { ccclass } = _decorator;

@ccclass("PlayerView")
export class PlayerView extends Component {
    yawOffset = 0;
    turnSpeed = 10;

    private _pathfinder: IPathfinder | null = null;
    private _agentId = -1;
    private _yOffset = 0;
    private _lookTarget = v3();
    private _hasLookTarget = false;
    private _targetYaw = 0;

    bind(pathfinder: IPathfinder, agentId: number, yOffset: number, yawOffset: number, turnSpeed: number): void {
        this._pathfinder = pathfinder;
        this._agentId = agentId;
        this._yOffset = yOffset;
        this.yawOffset = yawOffset;
        this.turnSpeed = turnSpeed;
        this._targetYaw = this.node.eulerAngles.y;
    }

    setLookTarget(world: Vec3): void {
        this._lookTarget.set(world);
        this._hasLookTarget = true;
    }

    clearLookTarget(): void {
        this._hasLookTarget = false;
    }

    update(dt: number): void {
        if (!this._pathfinder || this._agentId < 0) {
            return;
        }
        const agentPos = this._pathfinder.getPosition(this._agentId);
        this.node.setWorldPosition(agentPos.x, agentPos.y + this._yOffset, agentPos.z);

        const next = this._pathfinder.getNextPoint(this._agentId);
        const toNextX = next.x - agentPos.x;
        const toNextZ = next.z - agentPos.z;
        const velocity = this._pathfinder.getVelocity(this._agentId);
        if (toNextX * toNextX + toNextZ * toNextZ > 0.01) {
            this.faceXZ(toNextX, toNextZ);
        } else if (velocity.lengthSqr() > 0.04) {
            this.faceXZ(velocity.x, velocity.z);
        } else if (this._hasLookTarget) {
            this.faceXZ(this._lookTarget.x - agentPos.x, this._lookTarget.z - agentPos.z);
        }
        this.applyYaw(dt);
    }

    private faceXZ(dirX: number, dirZ: number): void {
        if (dirX * dirX + dirZ * dirZ < 1e-6) {
            return;
        }
        this._targetYaw = Math.atan2(dirX, dirZ) * 180 / Math.PI + this.yawOffset;
    }

    private applyYaw(dt: number): void {
        const current = this.node.eulerAngles.y;
        const yaw = this.lerpAngle(current, this._targetYaw, 1 - Math.exp(-this.turnSpeed * dt));
        this.node.setRotationFromEuler(0, yaw, 0);
    }

    private lerpAngle(from: number, to: number, t: number): number {
        let diff = (to - from) % 360;
        if (diff > 180) {
            diff -= 360;
        } else if (diff < -180) {
            diff += 360;
        }
        return from + diff * Math.min(t, 1);
    }
}
