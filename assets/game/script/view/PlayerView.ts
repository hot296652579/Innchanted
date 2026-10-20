import { _decorator, Animation, AnimationClip, Component, SkeletalAnimation, Vec3, v3 } from "cc";
import { IPathfinder } from "../sim/IPathfinder";

const { ccclass } = _decorator;

const CLIP_IDLE = 0;
const CLIP_RUN = 1;
const CLIP_ATTACK = 2;
const CLIP_THROW = 3;
const CLIP_DRINK = 4;
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
    private _lockYaw = false;

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

    playDrink(): void {
        const clips = this._anim?.clips?.map((clip) => clip?.name) ?? [];
        console.log("[Drink] playDrink", "anim", this._anim?.node?.name ?? "无", "clips", clips, "names", this._clipNames);
        const duration = this.playNamed(["shoot(2h)bow", "bow", "shoot"]);
        console.log("[Drink] playNamed 时长", duration);
        if (duration > 0) {
            this._actionLeft = duration;
            this._loco = -1;
            return;
        }
        this.playAction(CLIP_DRINK);
        console.log("[Drink] fallback slot4", this._clipNames[CLIP_DRINK], "actionLeft", this._actionLeft);
    }

    setLookTarget(world: Vec3): void {
        this._lookTarget.set(world);
        this._hasLookTarget = true;
    }

    clearLookTarget(): void {
        this._hasLookTarget = false;
    }

    /** 点自身喝药时锁朝向，不跟着点选或残余速度转。 */
    lockFacing(): void {
        this._lockYaw = true;
        this._targetYaw = this.node.eulerAngles.y;
        this.clearLookTarget();
    }

    unlockFacing(): void {
        this._lockYaw = false;
    }

    update(dt: number): void {
        if (!this._pathfinder || this._agentId < 0) {
            return;
        }
        const agentPos = this._pathfinder.getPosition(this._agentId);
        this.node.setWorldPosition(agentPos.x, agentPos.y + this._yOffset, agentPos.z);

        const velocity = this._pathfinder.getVelocity(this._agentId);
        if (!this._lockYaw) {
            const next = this._pathfinder.getNextPoint(this._agentId);
            const toNextX = next.x - agentPos.x;
            const toNextZ = next.z - agentPos.z;
            if (toNextX * toNextX + toNextZ * toNextZ > 0.01) {
                this.faceXZ(toNextX, toNextZ);
            } else if (velocity.lengthSqr() > 0.04) {
                this.faceXZ(velocity.x, velocity.z);
            } else if (this._hasLookTarget) {
                this.faceXZ(this._lookTarget.x - agentPos.x, this._lookTarget.z - agentPos.z);
            }
            this.applyYaw(dt);
        }
        this.tickAnim(dt, velocity.lengthSqr() > MOVE_SPEED_SQ);
    }

    private bindClips(): void {
        const anim = this.getComponentInChildren(SkeletalAnimation) ?? this.getComponentInChildren(Animation);
        const clips = anim?.clips?.filter((clip) => !!clip) ?? [];
        console.log("[Drink] bindClips", anim?.node?.name ?? "无动画", "数量", clips.length, clips.map((clip) => clip.name));
        if (!anim || clips.length < 4) {
            console.warn("[Drink] 动画不够 4 条，喝药播不了");
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
        return this.playByName(this._clipNames[slot], loop);
    }

    private playNamed(keys: string[]): number {
        const clips = this._anim?.clips ?? [];
        for (let k = 0; k < keys.length; k++) {
            const key = keys[k];
            for (let i = 0; i < clips.length; i++) {
                const clip = clips[i];
                if (clip && clip.name.toLowerCase().includes(key)) {
                    console.log("[Drink] 命中clip", key, "→", clip.name);
                    return this.playByName(clip.name, false);
                }
            }
        }
        console.warn("[Drink] 没找到clip", keys);
        return 0;
    }

    private playByName(name: string | undefined, loop: boolean): number {
        const anim = this._anim;
        if (!anim || !name) {
            console.warn("[Drink] playByName 失败", "anim", !!anim, "name", name);
            return 0;
        }
        anim.play(name);
        const state = anim.getState(name);
        if (state) {
            state.wrapMode = loop ? AnimationClip.WrapMode.Loop : AnimationClip.WrapMode.Normal;
        }
        const duration = state?.duration > 0 ? state.duration : 0.4;
        console.log("[Drink] 播放", name, "loop", loop, "duration", duration, "hasState", !!state);
        return duration;
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
