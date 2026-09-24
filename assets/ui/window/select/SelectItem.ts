import { _decorator, Button, Component, Label, Node } from "cc";
const { ccclass, property } = _decorator;

export type SelectItemState = "locked" | "current" | "completed";

@ccclass("SelectItem")
export class SelectItem extends Component {

    @property(Node)
    currentNode: Node = null!; // 当前关卡节点

    @property(Node)
    completeNode: Node = null!; // 已通关节点

    @property(Node)
    lockNode: Node = null!; // 未解锁节点

    private _levelId = 0;
    private _state: SelectItemState = "locked";
    private _onSelect: ((levelId: number) => void) | null = null;

    protected onLoad(): void {
        const btn = this.getComponent(Button) ?? this.node.addComponent(Button);
        btn.transition = Button.Transition.SCALE;
        btn.zoomScale = 1.08;
        btn.node.on(Button.EventType.CLICK, this.onClick, this);
    }

    protected onDestroy(): void {
        this.node.off(Button.EventType.CLICK, this.onClick, this);
    }

    public bind(levelId: number, state: SelectItemState, onSelect: (levelId: number) => void): void {
        this._levelId = levelId;
        this._state = state;
        this._onSelect = onSelect;
        this.setLabels(`${levelId}`);
        this.setState(state);
    }

    private setState(state: SelectItemState): void {
        if (this.currentNode) {
            this.currentNode.active = state === "current";
        }
        if (this.completeNode) {
            this.completeNode.active = state === "completed";
        }
        if (this.lockNode) {
            this.lockNode.active = state === "locked";
        }
    }

    private setLabels(text: string): void {
        const labels = this.node.getComponentsInChildren(Label);
        for (const label of labels) {
            label.string = text;
        }
    }

    private onClick(): void {
        if (this._state === "locked" || this._levelId <= 0) {
            return;
        }
        this._onSelect?.(this._levelId);
    }
}
