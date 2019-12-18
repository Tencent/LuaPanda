// 可视化配置部分
import { Tools } from '../common/tools';
import * as fs from "fs";
import * as vscode from 'vscode';
import { DebugLogger } from '../common/logManager';

export class VisualSetting {

    // 修改launch.json中的一项
    public static setLaunchjson(key, value, config = "LuaPanda"){
        let settings = this.readLaunchjson();
        for (const keyLaunch in settings.configurations) {
            let valueLaunch = settings.configurations[keyLaunch]
            if(valueLaunch["name"] === config){
                valueLaunch[key] = value;
            }
        }

        //序列化并写入
        let launchJson = JSON.stringify(settings, null,  4);
        Tools.writeFileContent(Tools.VSCodeOpenedFolder + "/.vscode/launch.json" ,launchJson);
    }

    // 获取launch.json中的一项
    public static getLaunchjson(key, config = "LuaPanda"){
        let settings = this.readLaunchjson();
        for (const keyLaunch in settings.configurations) {
            let valueLaunch = settings.configurations[keyLaunch]
            if(valueLaunch["name"] === config){
                return valueLaunch[key];
            }
        }
    }

    private static readLaunchjson(){
        let launchPath = Tools.VSCodeOpenedFolder + "/.vscode/launch.json";
        //如果文件不存在，就创建一个
        let launchExist = fs.existsSync(launchPath);
        let jsonStr;
        if(!launchExist){
            let dotVScodeDirExist = fs.existsSync(Tools.VSCodeOpenedFolder + "/.vscode");
            if(!dotVScodeDirExist){
                //创建.vscode目录
                fs.mkdirSync(Tools.VSCodeOpenedFolder + "/.vscode");
            }
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

    // 读取launch.json中的信息，并序列化
    public static getLaunchData(){
        let settings = this.readLaunchjson();
        let snippetsPath = Tools.VSCodeExtensionPath + "/res/snippets";
        let isOpenAnalyzer = fs.existsSync(snippetsPath);

        let obj = new Object();
        obj["command"] = "init_setting";
        obj["isOpenAnalyzer"] = isOpenAnalyzer;

        for (const key in settings.configurations) {
            const v = settings.configurations[key];

            if(v["name"] === "LuaPanda"){
                obj["LuaPanda"] = v;
            }
            if(v["name"] === "LuaPanda-DebugFile"){
                obj["LuaPanda-DebugFile"] = v;
            }
        }

        if(obj["LuaPanda"] == undefined){
            //读取预制内容，传给页面
            let launchTemplate = Tools.readFileContent(Tools.VSCodeExtensionPath + "/res/others/launch.json");
            let settings = JSON.parse(launchTemplate);
            for (const key in settings.configurations) {
                const v = settings.configurations[key];
                if(v["name"] === "LuaPanda"){
                    obj["LuaPanda"] = v;
                }
                if(v["name"] === "LuaPanda-DebugFile"){
                    obj["LuaPanda-DebugFile"] = v;
                }
            }
        }

        //setting反馈到html中
        return JSON.stringify(obj);
    }

    public static getWebMessage(message) {
        let messageObj = JSON.parse(message.webInfo);
        switch (messageObj.command) {
            case 'save_settings':
            	this.processSaveSettings(messageObj);
                break;
            case 'adb_reverse':
                this.processADBReverse(messageObj);
                break;
            case 'on_off_analyzer':
                this.on_off_analyzer(messageObj);
                break;
            case 'preAnalysisCpp':
                if(!messageObj.path || messageObj.path.trim() == ''){
                    DebugLogger.showTips("C++ 文件分析失败，传入路径为空!",2);
                }else{
                    Tools.client.sendNotification('preAnalysisCpp', message.webInfo);
                }
                break;
            case 'clearPreProcessFile':
                //清除文件夹
                let removePath = Tools.VSCodeOpenedFolder + "/.vscode/LuaPanda/";
                let res =Tools.removeDir(removePath);
                if(res){
                    DebugLogger.showTips("文件夹已经清除");
                }else{
                    DebugLogger.showTips("文件不存在", 2);
                }
                break;
        }
    }

    private static on_off_analyzer(messageObj) {
        let userControlBool = messageObj.switch;
        //读文件判断当前是on或者off，如果文件不存在，按on处理
        let snippetsPath = Tools.VSCodeExtensionPath + "/res/snippets";
        let snippetsPathClose = Tools.VSCodeExtensionPath + "/res/snippets_close";

        if(!userControlBool){
            // 用户关闭
            let codeSwitch = fs.existsSync(snippetsPath);
            if(codeSwitch){
                fs.renameSync(snippetsPath, snippetsPathClose);
            }
            DebugLogger.showTips("您已关闭了代码辅助功能，重启VScode后将不再有代码提示!");

            return;
        }

        if( userControlBool){
            // 用户打开
            let codeSwitchClose = fs.existsSync(snippetsPathClose);
            if(codeSwitchClose){
                fs.renameSync(snippetsPathClose, snippetsPath);
            }
            DebugLogger.showTips("您已打开了代码辅助功能，重启VScode后将会启动代码提示!");
            return;
        }
    }

    private static processADBReverse(messageObj) {
        let connectionPort = messageObj["connectionPort"];
        const terminal = vscode.window.createTerminal({
            name: "ADB Reverse (LuaPanda)",
            env: {}, 
        });

        let cmd = "adb reverse tcp:" + connectionPort + " tcp:" + connectionPort;       
        terminal.sendText(cmd , true);
        terminal.show(); 
    }

    private static processSaveSettings(messageObj) {
        try {        
            // 再读取一次launch.json , 序列化，用传来的obj替换之前的
            let settings = this.readLaunchjson();
            let alreadyWriteIn = false;
            for (const keyLaunch in settings.configurations) {
                let valueLaunch = settings.configurations[keyLaunch]
                if(valueLaunch["name"] === "LuaPanda"){
                    for (const keyWeb of Object.keys(messageObj["LuaPanda"])) {
                        alreadyWriteIn = true;
                        valueLaunch[keyWeb] = messageObj["LuaPanda"][keyWeb];
                    }
                }
    
                // if(valueLaunch["name"] === "LuaPanda-DebugFile"){
                //     for (const keyWeb of Object.keys(messageObj["LuaPanda-DebugFile"])) {
                //         valueLaunch[keyWeb] = messageObj["LuaPanda-DebugFile"][keyWeb];
                //     }
                // }
            }

            if(!alreadyWriteIn){
                //launch.json中不存在luapanda项目
                settings.configurations.push(messageObj["LuaPanda"]);
            }

            //序列化并写入
            let launchJson = JSON.stringify(settings, null,  4);
            Tools.writeFileContent(Tools.VSCodeOpenedFolder + "/.vscode/launch.json" ,launchJson);
            DebugLogger.showTips("配置保存成功!");
        } catch (error) {
            DebugLogger.showTips("配置保存失败, 可能是由于 launch.json 文件无法写入. 请手动修改 launch.json 中的配置项来完成配置!", 2);
        }
    }   
}