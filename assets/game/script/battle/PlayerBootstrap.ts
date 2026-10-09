import { _decorator, Component, Node } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ConfigManager } from "../../../framework/config/ConfigManager";
import { GameEvent } from "../../../framework/event/EventName";
import { EventManager } from "../../../framework/event/EventManager";
import { ClickHit, ClickPicker } from "../app/ClickPicker";
import { CommandService } from "../app/CommandService";
import { ActionKind, resolveDefaultAction } from "../app/DefaultAction";
import { Actor } from "../domain/Actor";
import { CommandFsm } from "../fsm/CommandFsm";
import { NavBakeStarter } from "../navmesh/NavBakeStarter";
import { GridAgent } from "../sim/GridAgent";
import { RecastPathfinder } from "../sim/RecastPathfinder";
import { StationBinding, StationRegistry } from "../sim/StationRegistry";
import { ItemHoldView } from "../view/ItemHoldView";
import { PlayerView } from "../view/PlayerView";

const { ccclass } = _decorator;

@ccclass("PlayerBootstrap")
export class PlayerBootstrap extends Component {
    private _actor: Actor | null = null;
    private _fsm: CommandFsm | null = null;
    private _commands: CommandService | null = null;
    private _registry = new StationRegistry();
    private _pathfinder: RecastPathfinder | null = null;
    private _view: PlayerView | null = null;
    private _holds: ItemHoldView | null = null;

    async start(): Promise<void> {
        const baker = this.getComponent(NavBakeStarter);
        if (!baker) {
            console.error("[Player] 未找到 NavBakeStarter");
            return;
        }
        const recast = await baker.waitReady();
        const player = baker.player;
        const stationRoot = baker.stationRoot;
        if (!player || !stationRoot || !baker.camera) {
            console.error("[Player] Player / Station / Camera 未就绪");
            return;
        }

        await ConfigManager.getInstance().loadTable("items", BundlesEnum.Table);

        this._registry.scan(stationRoot);
        this._pathfinder = new RecastPathfinder(recast);

        const startPos = player.worldPosition.clone();
        const agentId = this._pathfinder.addAgent(startPos, {
            radius: 0.45,
            height: 1.6,
            maxAcceleration: 12,
            maxSpeed: 4.5,
            collisionQueryRange: 1.2,
            pathOptimizationRange: 4,
            separationWeight: 1,
        });
        const agentPos = this._pathfinder.getPosition(agentId);
        const yOffset = startPos.y - agentPos.y;
        player.setWorldPosition(agentPos.x, agentPos.y + yOffset, agentPos.z);

        const agent = new GridAgent(this._pathfinder, agentId);
        this._actor = new Actor("player");
        this._fsm = new CommandFsm(agent);
        this._commands = new CommandService(this._fsm);

        player.mobility = 2;
        this._view = player.getComponent(PlayerView) ?? player.addComponent(PlayerView);
        this._view.bind(this._pathfinder, agentId, yOffset, baker.yawOffset, baker.turnSpeed);

        const playerHold = this.resolvePlayerHold(player);
        this._holds = new ItemHoldView(playerHold);
        this._holds.capture(this._registry);

        const picker = this.getComponent(ClickPicker) ?? this.node.addComponent(ClickPicker);
        picker.camera = baker.camera;
        picker.player = player;
        picker.stationRoot = stationRoot;
        picker.planeRoot = baker.navBake?.getChildByName("Plane") ?? baker.navBake;
        picker.registry = this._registry;
        picker.onHit = (hit) => this.onClick(hit);

        console.log(`[Player] 就绪，放置台 ${this._registry.all.length} 个`);
    }

    update(dt: number): void {
        this._pathfinder?.update(dt);
        this._fsm?.update(dt);
    }

    onDestroy(): void {
        this._registry.clear();
    }

    private resolvePlayerHold(player: Node): Node {
        let hold = player.getChildByName("HoldPoint");
        if (!hold) {
            hold = new Node("HoldPoint");
            player.addChild(hold);
            hold.setPosition(0, 0.5, 0.5);
            console.warn("[Player] 没有 HoldPoint，已在玩家根节点下创建");
        }
        hold.mobility = 2;
        console.log("[Player] HoldPoint 位于", player.name, "/", hold.name, "父节点", hold.parent?.name);
        return hold;
    }

    private onClick(hit: ClickHit): void {
        if (!this._commands || !this._actor) {
            return;
        }
        if (hit.target.kind === "self") {
            this._commands.issue(hit.target, null, null);
            this._view?.clearLookTarget();
            return;
        }
        if (hit.lookAt) {
            this._view?.setLookTarget(hit.lookAt);
        } else {
            this._view?.clearLookTarget();
        }
        this._commands.issue(hit.target, hit.dest, () => this.onArrive(hit));
    }

    private onArrive(hit: ClickHit): void {
        if (!this._actor || hit.target.kind !== "place") {
            return;
        }
        const binding = this._registry.get(hit.target.stationId);
        if (!binding) {
            return;
        }
        const action = resolveDefaultAction({
            hand: this._actor.hand,
            target: "place",
            slot: binding.station.slot,
        });
        console.log(
            "[Player] 到达",
            binding.station.id,
            action,
            "手",
            this._actor.hand,
            "台",
            binding.station.slot,
        );
        this.applyAction(action, binding);
    }

    private applyAction(action: ActionKind, binding: StationBinding): void {
        const actor = this._actor!;
        const station = binding.station;
        const events = EventManager.getInstance();
        switch (action) {
            case "Take":
                actor.hand = station.slot;
                station.slot = null;
                this._holds?.take(station.id);
                break;
            case "Place":
                station.slot = actor.hand;
                actor.hand = null;
                this._holds?.place(station.id);
                break;
            case "Stack":
                if (actor.hand && station.slot) {
                    const moved = actor.hand.count - station.slot.absorb(actor.hand);
                    if (actor.hand.empty) {
                        actor.hand = null;
                    }
                    this._holds?.stack(station.id, moved);
                }
                break;
            case "RefuseSwap":
                events.emit(GameEvent.SHOW_TIPS, "不能和台上的交换");
                console.warn("[Player] 不能和台上的交换");
                return;
            default:
                return;
        }
        events.emit(GameEvent.ITEM_HELD_CHANGED, actor.id, actor.hand);
        events.emit(GameEvent.STATION_SLOT_CHANGED, station.id);
        console.log("[Player]", action, "手", actor.hand, "台", station.slot);
    }
}
