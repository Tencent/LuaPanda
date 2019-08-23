import * as vscode from 'vscode';
let path = require("path");

export class Tools {
    // 把传入的路径标准路径
    public static genUnifiedPath(beProcessPath) : string{
        //全部使用 /
        beProcessPath = beProcessPath.replace(/\\/g, '/');
        while(beProcessPath.match(/\/\//)){
            beProcessPath = beProcessPath.replace(/\/\//g, '/');
        }
        //win盘符转为小写
        beProcessPath = beProcessPath.replace(/^\w:/, function($1){return $1.toLocaleLowerCase()});
        return beProcessPath;
    }

    // 获取当前VScode活跃窗口的文件路径
    public static getVSCodeAvtiveFilePath(): Object{
        let retObject = {retCode : 0, retMsg : "", filePath: "" };

        let activeWindow =  vscode.window.activeTextEditor;
        if (activeWindow){
            let activeFileUri = '';
            // 先判断当前活动窗口的 uri 是否有效
            let activeScheme = activeWindow.document.uri.scheme;
            if( activeScheme !== "file" ){
                // 当前活动窗口不是file类型，遍历 visibleTextEditors，取出file类型的窗口
                let visableTextEditorArray = vscode.window.visibleTextEditors;
                for (const key in visableTextEditorArray) {
                    const editor = visableTextEditorArray[key];
                    let editScheme =  editor.document.uri.scheme;
                    if(editScheme === "file"){
                        activeFileUri = editor.document.uri.fsPath;
                        break;
                    }
                }
            }else{
                // 使用 activeWindow
                activeFileUri = activeWindow.document.uri.fsPath
            }
            if(activeFileUri === ''){
                retObject.retMsg = "[Error]: adapter start file debug, but file Uri is empty string";
                retObject.retCode = -1;
                return retObject;
            }

            let pathArray = activeFileUri.split(path.sep);
            let filePath = pathArray.join('/');
            filePath = '"' +  filePath + '"'; //给路径加上""
            
            retObject.filePath = filePath;
            return retObject;

        }else{
            retObject.retMsg = "[Error]: can not get vscode activeWindow";
            retObject.retCode = -1;
            return retObject;
        }
    }
}
