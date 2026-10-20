import { Camera, geometry, Vec3 } from "cc";
import { EventManager } from "../../../../framework/event/EventManager";
import { GameEvent } from "../../../../framework/event/EventName";
import { findNamedDescendant } from "../../sim/StationRegistry";
import { DragonView } from "../../view/DragonView";
import { EventDef } from "../EventCatalog";
import { IIncident, IncidentContext } from "./Incident";

type Phase = "toCenter" | "attack" | "toHome" | "done";

const KITCHEN = new Vec3(0, 3, 0);
const _ray = new geometry.Ray();
const _dir = new Vec3();
const _screen = new Vec3();

/** 冰冻事件：沿航线飞到画面正中播 Attack2 结冰，再原路飞回。 */
export class IceDragonIncident implements IIncident {
    private readonly _view = new DragonView();
    private _phase: Phase = "done";
    private _attackLeft = 0;
    private _frozen = false;

    constructor(readonly def: EventDef) {}

    get done(): boolean {
        return this._phase === "done";
    }

    begin(ctx: IncidentContext): void {
        const actorName = this.def.actorName ?? "Dragon";
        const actor = findNamedDescendant(ctx.levelRoot, actorName);
        if (!actor) {
            console.warn("[Event] 场景里没有", actorName);
            this._phase = "done";
            return;
        }
        this._view.bind(actor);
        const dest = this.screenCenter(ctx.camera);
        this._view.flyTo(dest, this.def.flySpeed ?? 5);
        this._phase = "toCenter";
        const events = EventManager.getInstance();
        events.emit(GameEvent.EVENT_WARN, this.def.id, 0);
        if (this.def.warnText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.warnText);
        }
        console.log("[Event] 冰龙飞向画面正中", this.def.id);
    }

    tick(dt: number): void {
        if (this._phase === "done") {
            return;
        }
        this._view.tick(dt);
        if (this._phase === "toCenter") {
            if (!this._view.flying) {
                this.startAttack();
            }
            return;
        }
        if (this._phase === "attack") {
            this._attackLeft -= dt;
            if (this._attackLeft <= 0) {
                this._view.flyHome(this.def.flySpeed ?? 5);
                this._phase = "toHome";
            }
            return;
        }
        if (this._phase === "toHome" && !this._view.flying) {
            this._phase = "done";
        }
    }

    cancel(): void {
        this._view.snapHome();
        this._phase = "done";
    }

    private startAttack(): void {
        this._attackLeft = this._view.playAttack2();
        this._phase = "attack";
        if (this._frozen) {
            return;
        }
        this._frozen = true;
        const iceSec = this.def.freezeTime ?? 1;
        const events = EventManager.getInstance();
        events.emit(GameEvent.GROUND_ICE_FREEZE, iceSec);
        events.emit(GameEvent.EVENT_FAIL, this.def.id);
        if (this.def.failText) {
            events.emit(GameEvent.SHOW_TIPS, this.def.failText);
        }
        console.log("[Event] Attack2 结冰", iceSec, "s");
    }

    /** 相机画面正中、厨房景深附近的一点。必须落在中心射线上，否则会飞出锥体。 */
    private screenCenter(camera: Camera | undefined): Vec3 {
        if (!camera) {
            return this._view.home.clone();
        }
        const renderCam = camera.camera;
        renderCam.update(true);
        const w = renderCam.width;
        const h = renderCam.height;
        camera.screenPointToRay(w * 0.5, h * 0.5, _ray);
        _dir.set(_ray.d);
        if (_dir.lengthSqr() < 1e-8) {
            _dir.set(camera.node.forward);
        }
        _dir.normalize();

        const camPos = camera.node.worldPosition;
        let dist = Vec3.distance(camPos, KITCHEN) * 0.7;
        if (Math.abs(_dir.y) > 1e-4) {
            const tHit = (KITCHEN.y - _ray.o.y) / _dir.y;
            if (Number.isFinite(tHit) && tHit > 4) {
                dist = tHit * 0.7;
            }
        }
        const near = Math.max(8, camera.near + 6);
        const far = Math.min(36, camera.far * 0.5);
        dist = Math.max(near, Math.min(far, dist));

        const dest = new Vec3(
            _ray.o.x + _dir.x * dist,
            _ray.o.y + _dir.y * dist,
            _ray.o.z + _dir.z * dist,
        );
        camera.worldToScreen(dest, _screen);
        console.log("[Event] 冰龙落点屏幕", _screen.x.toFixed(0), _screen.y.toFixed(0), "/", w, h);
        return dest;
    }
}
