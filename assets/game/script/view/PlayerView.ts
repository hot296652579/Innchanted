import { _decorator, Animation, AnimationClip, Component, SkeletalAnimation, Vec3, v3 } from "cc";
import { IPathfinder } from "../sim/IPathfinder";

const { ccclass } = _decorator;

const CLIP_IDLE = 0;
const CLIP_RUN = 1;
const CLIP_ATTACK = 2;
const CLIP_THROW = 3;
const MOVE_SPEED_SQ = 0.04;

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
    private _anim: Animation | null = null;
    private _clipNames: string[] = [];
    private _loco = -1;
    private _actionLeft = 0;

    bind(pathfinder: IPathfinder, agentId: number, yOffset: number, yawOffset: number, turnSpeed: number): void {
        this._pathfinder = pathfinder;
        this._agentId = agentId;
        this._yOffset = yOffset;
        this.yawOffset = yawOffset;
        this.turnSpeed = turnSpeed;
        this._targetYaw = this.node.eulerAngles.y;
        this.bindClips();
    }

    playAttack(): void {
        this.playAction(CLIP_ATTACK);
    }

    playThrow(): void {
        this.playAction(CLIP_THROW);
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
        this.tickAnim(dt, velocity.lengthSqr() > MOVE_SPEED_SQ);
    }

    private bindClips(): void {
        const anim = this.getComponentInChildren(SkeletalAnimation) ?? this.getComponentInChildren(Animation);
        const clips = anim?.clips?.filter((clip) => !!clip) ?? [];
        if (!anim || clips.length < 4) {
            return;
        }
        this._anim = anim;
        this._clipNames = clips.map((clip) => clip.name);
        this.playLoco(CLIP_IDLE);
    }

    private tickAnim(dt: number, moving: boolean): void {
        if (!this._anim) {
            return;
        }
        if (this._actionLeft > 0) {
            this._actionLeft -= dt;
            if (this._actionLeft > 0) {
                return;
            }
            this._loco = -1;
        }
        this.playLoco(moving ? CLIP_RUN : CLIP_IDLE);
    }

    private playAction(slot: number): void {
        const duration = this.playClip(slot, false);
        if (duration <= 0) {
            return;
        }
        this._actionLeft = duration;
        this._loco = -1;
    }

    private playLoco(slot: number): void {
        if (this._loco === slot) {
            return;
        }
        if (this.playClip(slot, true) <= 0) {
            return;
        }
        this._loco = slot;
    }

    private playClip(slot: number, loop: boolean): number {
        const anim = this._anim;
        const name = this._clipNames[slot];
        if (!anim || !name) {
            return 0;
        }
        anim.play(name);
        const state = anim.getState(name);
        if (state) {
            state.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        }
        return state?.duration > 0 ? state.duration : 0.4;
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
