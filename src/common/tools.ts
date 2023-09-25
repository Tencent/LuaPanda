import * as vscode from 'vscode';
import * as fs from "fs";
import URI from 'vscode-uri';
let path = require("path");

export class Tools {
    public static extMap;  // 可处理的文件后缀列表
    public static adapterVersion;  //赋值放在了插件初始化时
    public static VSCodeExtensionPath;  // VSCode插件所在路径，插件初始化时就会被赋值.
    public static client;
    public static developmentMode = false;

    // 路径相关函数
    // 获取扩展中预置的lua文件位置
    public static getLuaPathInExtension() : string{
        let luaPathInVSCodeExtension = this.VSCodeExtensionPath + "/Debugger/LuaPanda.lua";
        return luaPathInVSCodeExtension;
    }

    // 获取扩展中预置的lua文件位置
    public static getClibPathInExtension() : string{
        let ClibPathInVSCodeExtension = this.VSCodeExtensionPath + "/Debugger/debugger_lib/plugins/";
        return ClibPathInVSCodeExtension;
    }

    // 读文本文件内容
    // @path 文件路径
    // @return 文件内容
    public static readFileContent(path: string): string {
        if(path === '' || path == undefined){
            return '';
        }
        let data = fs.readFileSync(path);
        let dataStr = data.toString();
        return dataStr;
    }

    // 写文件内容
    // @path 文件路径
    // @return 文件内容
    public static writeFileContent(path: string, content:string) {
        if(path === '' || path == undefined){
            return;
        }
        fs.writeFileSync(path, content);
    }

    // 把传入的路径转为标准路径
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

    // 构建可接受的后缀列表
    public static rebuildAcceptExtMap(userSetExt? : string){
        Tools.extMap = new Object();
        Tools.extMap['lua'] = true;
        Tools.extMap['lua.txt'] = true;
        Tools.extMap['lua.bytes'] = true;
        if(typeof userSetExt == 'string' && userSetExt != ''){
            Tools.extMap[userSetExt] = true;
        }
    }

    // 获取当前毫秒数
    public static getCurrentMS(){
        let currentMS = new Date();//获取当前时间
        return currentMS.getTime();
    }

    // 从URI分析出文件名和后缀
    public static getPathNameAndExt(UriOrPath): Object{
        let name_and_ext = path.basename(UriOrPath).split('.');
        let name = name_and_ext[0];								                      //文件名
        let ext = name_and_ext[1] || '';											  //文件后缀
        for (let index = 2; index < name_and_ext.length; index++) {
            ext = ext + '.' + name_and_ext[index];
        }
        return { name, ext };
    }

    // 从URI分析出文件路径，文件名，后缀
    // 注意：如果dirname 取不到，默认是 .
    public static getDirAndFileName(UriOrPath): Object{
        let retObj = this.getPathNameAndExt(UriOrPath)
        let _dir = path.dirname(UriOrPath)
        retObj["dir"] = _dir;
        return retObj;
    }

    public static removeDir(dir): boolean {
        let files;
        try{
            files = fs.readdirSync(dir)
        }catch(err){
            if (err.code === 'ENOENT') {
                return false;
              } else {
                throw err;
              }
        }

        for(var i=0;i< files.length;i++){
            let newPath = path.join(dir,files[i]);
            let stat = fs.statSync(newPath)
            if(stat.isDirectory()){
                //如果是文件夹就递归
                this.removeDir(newPath);
            }
            else{
                //删除文件
                fs.unlinkSync(newPath);
            }
        }
        fs.rmdirSync(dir);
        return true;
    }

    // uri string -> path
    public static uriToPath(uri: string): string {
        let pathStr = URI.parse(uri).fsPath;
        return pathStr;
    }

}