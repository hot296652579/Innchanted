import { Camera, Component, Node } from "cc";
import { BundlesEnum } from "../../../define/BundlesEnum";
import { ConfigManager } from "../../../framework/config/ConfigManager";
import { EventManager } from "../../../framework/event/EventManager";
import { GameEvent } from "../../../framework/event/EventName";
import { Actor } from "../domain/Actor";
import { CommandFsm } from "../fsm/CommandFsm";
import RecastDetourManager from "../navmesh/recastdetourjs/tool/RecastDetourManager";
import { GridAgent } from "../sim/GridAgent";
import { RecastPathfinder } from "../sim/RecastPathfinder";
import { StationRegistry } from "../sim/StationRegistry";
import { ItemHoldView } from "../view/ItemHoldView";
import { PlayerView } from "../view/PlayerView";
import { ClickHit, ClickPicker } from "./ClickPicker";
import { CommandService } from "./CommandService";
import { EventDirector } from "./EventDirector";
import { GuestLoop } from "./GuestLoop";
import { InteractService } from "./InteractService";
import { ProcessorSystem } from "./ProcessorSystem";

export interface ShiftStartArgs {
    recast: RecastDetourManager;
    host: Component;
    player: Node;
    stationRoot: Node;
    camera: Camera;
    yawOffset: number;
    turnSpeed: number;
    levelRoot: Node;
    planeRoot: Node | null;
}

/** 一局班次的编排入口：开局、每帧推进。不写配方、不写寻路细节。 */
export class ShiftController {
    private readonly _registry = new StationRegistry();
    private _pathfinder: RecastPathfinder | null = null;
    private _actor: Actor | null = null;
    private _fsm: CommandFsm | null = null;
    private _commands: CommandService | null = null;
    private _playerView: PlayerView | null = null;
    private _processors: ProcessorSystem | null = null;
    private _guests: GuestLoop | null = null;
    private _interact: InteractService | null = null;
    private _events: EventDirector | null = null;

    async start(args: ShiftStartArgs): Promise<void> {
        await ConfigManager.getInstance().loadTable("items", BundlesEnum.Table);
        await ConfigManager.getInstance().loadTable("recipes", BundlesEnum.Table);
        await ConfigManager.getInstance().loadTable("guests", BundlesEnum.Table);
        await ConfigManager.getInstance().loadTable("events", BundlesEnum.Table);

        this._registry.scan(args.stationRoot);
        this._pathfinder = new RecastPathfinder(args.recast);
        this.spawnPlayer(args);

        const holds = new ItemHoldView(this.requireHold(args.player));
        holds.capture(this._registry);

        this._processors = new ProcessorSystem(args.camera, this._registry);
        await this._processors.load();

        this._guests = new GuestLoop(this._pathfinder, this._registry, args.camera);
        await this._guests.load();
        this._guests.start(args.levelRoot, args.stationRoot, args.yawOffset);

        this._interact = new InteractService(this._actor!, holds, this._processors, this._guests, this._playerView!);
        this._events = new EventDirector();
        this._events.start(this._registry, this._processors, args.levelRoot);
        this.bindClick(args);
        console.log(`[Shift] 就绪，台子 ${this._registry.all.length} 个`);
    }

    update(dt: number): void {
        this._pathfinder?.update(dt);
        this._fsm?.update(dt);
        this._processors?.tick(dt);
        this._processors?.update();
        this._guests?.update(dt);
        this._events?.update(dt);
    }

    clear(): void {
        this._events?.clear();
        this._registry.clear();
    }

    private spawnPlayer(args: ShiftStartArgs): void {
        const pathfinder = this._pathfinder!;
        const startPos = args.player.worldPosition.clone();
        const agentId = pathfinder.addAgent(startPos, {
            radius: 0.45,
            height: 1.6,
            maxAcceleration: 12,
            maxSpeed: 4.5,
            collisionQueryRange: 1.2,
            pathOptimizationRange: 4,
            separationWeight: 1,
        });
        const agentPos = pathfinder.getPosition(agentId);
        const yOffset = startPos.y - agentPos.y;
        args.player.setWorldPosition(agentPos.x, agentPos.y + yOffset, agentPos.z);
        args.player.mobility = 2;

        const agent = new GridAgent(pathfinder, agentId);
        this._actor = new Actor("player");
        this._fsm = new CommandFsm(agent);
        this._commands = new CommandService(this._fsm);
        this._playerView = args.player.getComponent(PlayerView) ?? args.player.addComponent(PlayerView);
        this._playerView.bind(pathfinder, agentId, yOffset, args.yawOffset, args.turnSpeed);
    }

    private bindClick(args: ShiftStartArgs): void {
        const picker = args.host.getComponent(ClickPicker) ?? args.host.addComponent(ClickPicker);
        picker.camera = args.camera;
        picker.player = args.player;
        picker.stationRoot = args.stationRoot;
        picker.planeRoot = args.planeRoot;
        picker.registry = this._registry;
        picker.onHit = (hit) => this.onClick(hit);
    }

    private onClick(hit: ClickHit): void {
        if (!this._commands || !this._actor) {
            return;
        }
        if (hit.target.kind === "self") {
            this._commands.issue(hit.target, null, null);
            this._playerView?.clearLookTarget();
            return;
        }
        if (hit.lookAt) {
            this._playerView?.setLookTarget(hit.lookAt);
        } else {
            this._playerView?.clearLookTarget();
        }
        if (hit.target.kind === "place" && this._events?.scareAt(hit.target.stationId)) {
            this._playerView?.playAttack();
            EventManager.getInstance().emit(GameEvent.SHOW_TIPS, "赶走了小偷");
            return;
        }
        this._commands.issue(hit.target, hit.dest, () => this.onArrive(hit));
    }

    private onArrive(hit: ClickHit): void {
        if (!this._interact || hit.target.kind !== "place") {
            return;
        }
        const binding = this._registry.get(hit.target.stationId);
        if (binding) {
            this._interact.arrive(binding);
        }
    }

    private requireHold(player: Node): Node {
        let hold = player.getChildByName("HoldPoint");
        if (!hold) {
            hold = new Node("HoldPoint");
            player.addChild(hold);
            hold.setPosition(0, 0.5, 0.5);
            console.warn("[Shift] 没有 HoldPoint，已在玩家根节点下创建");
        }
        hold.mobility = 2;
        return hold;
    }
}
