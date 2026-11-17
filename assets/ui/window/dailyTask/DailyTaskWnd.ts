import { _decorator, Button, instantiate, Label, Node, Sprite } from "cc";
import { BundlesEnum } from "db://assets/define/BundlesEnum";
import { UIConfig } from "db://assets/define/UIEnum";
import { ResourceManager } from "db://assets/framework/resource/ResourceManager";
import { UIManager } from "db://assets/framework/ui/UIManager";
import BaseWindow from "../../../framework/ui/BaseWindow";
import { UILayerType } from "../../../framework/ui/UILayer";
import { DailyTaskSystem, DailyTaskView } from "../../../script/daily/DailyTaskSystem";
const { ccclass, property } = _decorator;

@ccclass
export class DailyTaskWnd extends BaseWindow {
    windowLayer = UILayerType.TOP_POPUP;

    @property(Button)
    backBtn: Button = null!;

    @property(Node)
    itemNode: Node = null!;

    @property(Node)
    contentNode: Node = null!;

    private readonly _items: Node[] = [];
    private _gen = 0;

    protected onLoad(): void {
        this.backBtn.node.on(Button.EventType.CLICK, this.onBack, this);
        if (this.itemNode) {
            this.itemNode.active = false;
        }
    }

    protected onOpenRefresh(): void {
        DailyTaskSystem.watch(() => {
            void this.reload();
        });
        void this.reload();
    }

    private async reload(): Promise<void> {
        const gen = ++this._gen;
        const tasks = await DailyTaskSystem.list();
        if (!this.isValid || gen !== this._gen) {
            return;
        }
        this.clearItems();
        for (let i = 0; i < tasks.length; i++) {
            const node = instantiate(this.itemNode);
            node.active = true;
            node.setParent(this.contentNode);
            this.fill(node, tasks[i]);
            this._items.push(node);
        }
    }

    private fill(node: Node, task: DailyTaskView): void {
        this.setText(node, "lbTitle", task.name);
        this.setText(node, "lbContent", task.desc);
        this.setText(node, "lbTask", `${task.progress}/${task.target}`);
        this.setText(node, "lbReward", `奖励体力+${task.rewardStamina}`);
        void this.fillIcon(node, task.icon);
    }

    private setText(node: Node, name: string, text: string): void {
        const label = this.findNamed(node, name)?.getComponent(Label);
        if (label) {
            label.string = text;
        }
    }

    private async fillIcon(node: Node, icon: string): Promise<void> {
        const sprite = this.findNamed(node, "taskIcon")?.getComponent(Sprite);
        if (!sprite || !icon) {
            return;
        }
        const path = `${icon.replace(/\.png$/i, "")}/spriteFrame`;
        const frame = await ResourceManager.getInstance().loadSpriteFrame(path, BundlesEnum.UI);
        if (!sprite.isValid || !frame) {
            return;
        }
        sprite.spriteFrame = frame;
    }

    private findNamed(node: Node, name: string): Node | null {
        if (node.name === name) {
            return node;
        }
        for (let i = 0; i < node.children.length; i++) {
            const found = this.findNamed(node.children[i], name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private clearItems(): void {
        for (let i = 0; i < this._items.length; i++) {
            if (this._items[i]?.isValid) {
                this._items[i].destroy();
            }
        }
        this._items.length = 0;
    }

    private async onBack(): Promise<void> {
        await UIManager.getInstance().closeWindow(UIConfig.DailyTaskWnd.name);
    }
}
