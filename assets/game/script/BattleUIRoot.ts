import { _decorator, Component } from "cc";
const { ccclass, property } = _decorator;

import { UILayerRoot } from "../../framework/ui/UILayer";

@ccclass
export default class BattleUIRoot extends Component {

    async start() {
        UILayerRoot.initRoot(this.node);
    }

    protected onDestroy(): void {

    }
}
