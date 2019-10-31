// 可视化配置部分
import { Tools } from '../common/tools';
import * as fs from "fs";

export class VisualSetting {

    private static readLaunchjson(){
        let launchPath = Tools.VSCodeOpenedFolder + "/.vscode/launch.json";
        //如果文件不存在，就创建一个
        let launchExist = fs.existsSync(launchPath);
        let jsonStr;
        if(!launchExist){
            // 文件不存在，读取预制文件，创建launch
            let launchTemplate = Tools.readFileContent(Tools.VSCodeExtensionPath + "/res/others/launch.json");
            Tools.writeFileContent(Tools.VSCodeOpenedFolder + "/.vscode/launch.json" ,launchTemplate);
            jsonStr = launchTemplate;
        }else{
            // 文件存在，读取launch.json的信息
            jsonStr = Tools.readFileContent(launchPath);
        }

        if(jsonStr == null || jsonStr == ''){
            // 没有找到launch.json 文件，生成一份（读取预制内容，拷贝到其中）
            return null;
        }

        //去除注释行
        let reg = /(\/\/.*)|(\/\*[\s\S]*?\*\/)/g;// 正则表达式
        jsonStr = jsonStr.replace(reg, '');
        let launchSettings = JSON.parse(jsonStr);
        return launchSettings;
    }

    // 处理配置文件launch.json
    public static setLaunchToWeb(webview){
        let settings = this.readLaunchjson();

        let obj = new Object();
        obj["command"] = "init_setting";
        for (const key in settings.configurations) {
            const v = settings.configurations[key];

            if(v["name"] === "LuaPanda"){
                obj["LuaPanda"] = v;
            }
            if(v["name"] === "LuaPanda-DebugFile"){
                obj["LuaPanda-DebugFile"] = v;
            }
        }
        //setting反馈到html中
        let newJson = JSON.stringify(obj);
        webview.postMessage(newJson);
    }

    public static getWebMessage(message) {
        let messageObj = JSON.parse(message.webInfo);
        switch (messageObj.command) {
            case 'save_settings':
            	this.processSaveSettings(messageObj);
            	break;
        }
    }

    private static processSaveSettings(messageObj) {
        // 再读取一次launch.json , 序列化，用传来的obj替换之前的
        let settings = this.readLaunchjson();
        for (const keyLaunch in settings.configurations) {
            let valueLaunch = settings.configurations[keyLaunch]
            if(valueLaunch["name"] === "LuaPanda"){
                for (const keyWeb of Object.keys(messageObj["LuaPanda"])) {
                    valueLaunch[keyWeb] = messageObj["LuaPanda"][keyWeb];
                }
            }

            // if(valueLaunch["name"] === "LuaPanda-DebugFile"){
            //     for (const keyWeb of Object.keys(messageObj["LuaPanda-DebugFile"])) {
            //         valueLaunch[keyWeb] = messageObj["LuaPanda-DebugFile"][keyWeb];
            //     }
            // }

        }
        //序列化并写入
        let launchJson = JSON.stringify(settings, null,  4);
        Tools.writeFileContent(Tools.VSCodeOpenedFolder + "/.vscode/launch.json" ,launchJson);
    }   
}