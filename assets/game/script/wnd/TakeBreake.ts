import { _decorator } from "cc";
import { UILayerType } from "db://assets/framework/ui/UILayer";
import { ReadyWnd } from "./ReadyWnd";
const { ccclass } = _decorator;

@ccclass("TakeBreake")
export class TakeBreake extends ReadyWnd {
    windowLayer = UILayerType.TOP_POPUP;
}
