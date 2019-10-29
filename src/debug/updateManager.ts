import { Tools } from '../common/tools';
import { DebugLogger } from '../common/logManager';
import * as vscode from 'vscode';
import * as fs from "fs";

export class UpdateManager{
    private static checkUpdate = true;

    public static setCheckUpdate(state){
        this.checkUpdate = state;
    }

    // 获取调试器lua文件的版本号，并提示用户升级
    public static checkIfLuaPandaNeedUpdate(){
        if(!this.checkUpdate){
            return;
        }

        // 从列表中找到文件
        if(Tools.fileNameToPathMap && typeof(Tools.fileNameToPathMap["LuaPanda"]) === 'string'){
            Tools.luapandaPathInUserProj = Tools.fileNameToPathMap["LuaPanda"];
        }

        if(!Tools.luapandaPathInUserProj){
            return;
        }

        let luapandaTxt = Tools.readFileContent(Tools.luapandaPathInUserProj);
        let dver = luapandaTxt.match(/(?<=local debuggerVer = )("(.*?)")/);
        if(dver && dver.length === 3){
            let DVerArr  = dver[2].split('.');
            let AVerArr = String(Tools.adapterVersion).split(".");
            if (DVerArr.length === AVerArr.length && DVerArr.length === 3 ){
                if ( parseInt(DVerArr[0]) < parseInt(AVerArr[0]) || parseInt(DVerArr[1]) < parseInt(AVerArr[1]) || parseInt(DVerArr[2]) < parseInt(AVerArr[2])  ){
                    vscode.window.showInformationMessage('当前工程中 LuaPanda 文件版本比较低，是否自动升级为新版本?', 'Yes', 'No').then(value => {
                        if(value === "Yes"){
                            let confirmButton = "立刻升级";
                            vscode.window.showInformationMessage('已准备好更新 ' + Tools.luapandaPathInUserProj+ '。如用户对此文件有修改, 建议备份后再升级, 避免修改内容被覆盖', confirmButton, '稍后再试').then(value => {
                                if(value === confirmButton){
                                    UpdateManager.updateLuaPandaFile(Tools.luapandaPathInUserProj)
                                }
                            });
                        }
                        else{
                            // 本次插件运行期间不再提示
                            UpdateManager.setCheckUpdate(false);
                        };

                    });
                }
            }else{
                //版本号异常，不做处理
            }
        }
    }

    // 更新调试器lua文件(读取预置文件，写入工程的目标文件中)
    public static updateLuaPandaFile(pandaPath) {
        if(!pandaPath){
            pandaPath = Tools.luapandaPathInUserProj;
        }
        //文件替换
        let luapandaContent = fs.readFileSync(Tools.getLuaPathInExtension());
        fs.writeFile(pandaPath, luapandaContent , function(err: NodeJS.ErrnoException){
            if(err){
                DebugLogger.showTips("升级失败, " + Tools.luapandaPathInUserProj + "写入失败! 可以手动替换此文件到github最新版", 1);
            }else{
                DebugLogger.showTips("升级成功, " + Tools.luapandaPathInUserProj + " 已升级到 " + Tools.adapterVersion , 0);
            }
            UpdateManager.setCheckUpdate(false);
        });
    }
}