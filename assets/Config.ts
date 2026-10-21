
export const Config = {
    isDev: false, //查看地形测试
    DebugMode: true,
    // 平台  Android/IOS/Web/Wechat
    platform: 'Web',
    // 设计分辨率
    design_width: 750,
    design_height: 1624,
    // 服务器地址
    server_http_address: 'http://192.168.1.54:3001',
    // 公告地址
    // public_http_address: 'http://192.168.1.104',
    public_http_address: 'https://cdn.taishunmj.com/backend_dev/ipt/production',
    hotupdateDirNameMap: {
        1: 'game-hotupdate',
    }
}

// @assets/game/prefab/guest/soldier/SoldierGuest.prefab @assets/game/prefab/guest/mage/MageGuest.prefab 
// 我现在添加了需要引入的客人，已经摆放在关卡中了，它们需要玩家走到客人面前，大约停留0.5s，然后该类型的客人就会一定距离跟随玩家。
// 当玩家靠近餐桌时，客人会自动上桌，并开始吃饭。