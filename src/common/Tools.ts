import * as vscode from 'vscode';
import { DebugLogger } from './logManager';
import * as fs from "fs";
import { isArray } from 'util';
let path = require("path");
let pathReader = require('path-reader');

export class Tools {
    public static extMap = new Object();  // 可处理的文件后缀列表
    public static fileNameToPathMap;   // 文件名-路径 Map
    public static useAutoPathMode = false; 
    public static pathCaseSensitivity = false; 
    public static adapterVersion;  //赋值放在了插件初始化时
    public static VSCodeOpenedFolder;   // VSCode当前打开的用户工程路径。打开文件夹后，由languageServer赋值
    public static luapandaPathInUserProj;   // 用户工程中luapanda文件所在的路径，它在调试器启动时赋值。但也可能工程中不存在luapanda文件导致路径为空
    public static VSCodeExtensionPath;  // VSCode插件所在路径，插件初始化时就会被赋值
    
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
        this.extMap = new Object();
        this.extMap['lua'] = true;
        this.extMap['lua.txt'] = true;
        this.extMap['lua.bytes'] = true;
        if(typeof userSetExt == 'string' && userSetExt != ''){
            this.extMap[userSetExt] = true;
        }
    }

    // 建立/刷新 工程下文件名-路径Map
    public static rebuildWorkspaceNamePathMap(rootPath : string){
        let beginMS = this.getCurrentMS();//启动时毫秒数
        let _fileNameToPathMap = new Array();      // 文件名-路径 cache
        let workspaceFiles = pathReader.files(rootPath, {sync:true});   //同步读取工程中所有文件名
        let workspaceFileCount = workspaceFiles.length;
        let processFilNum = 0; //记录最终处理了多少个文件
        for(let processingFileIdx = 0; processingFileIdx < workspaceFileCount ; processingFileIdx++){
            let nameExtObject = this.getPathNameAndExt(workspaceFiles[processingFileIdx]);
            if( !this.extMap[nameExtObject['ext']] ){
                // 文件类型不在可处理列表中
                continue;
            }
            processFilNum = processFilNum + 1;
            let fileNameKey = nameExtObject['name']; // key是文件名，不包含路径和文件后缀
            if(_fileNameToPathMap[fileNameKey]){
                //存在同名文件
                if(isArray(_fileNameToPathMap[fileNameKey])){
                    _fileNameToPathMap[fileNameKey].push(workspaceFiles[processingFileIdx]);
                }else if(typeof _fileNameToPathMap[fileNameKey] === "string"){
                    //冲突, 对应的key已有值（存在同名文件), 使用数组保存数据
                    let tempSaveValue = _fileNameToPathMap[fileNameKey];
                    let tempArray = new Array();
                    tempArray.push(tempSaveValue);
                    tempArray.push(workspaceFiles[processingFileIdx]);
                    _fileNameToPathMap[fileNameKey] = tempArray;
                }
            }else{
                _fileNameToPathMap[fileNameKey] = workspaceFiles[processingFileIdx]; 
            }
            // 显示进度
            let processingRate = Math.floor( processingFileIdx / workspaceFileCount * 100 );
            let completePath = '';
            if(isArray(_fileNameToPathMap[fileNameKey])){
                completePath = _fileNameToPathMap[fileNameKey][_fileNameToPathMap[fileNameKey].length-1];
            }else if(typeof _fileNameToPathMap[fileNameKey] === "string"){
                completePath = _fileNameToPathMap[fileNameKey];
            }
            DebugLogger.AdapterInfo(processingRate + "%  |  "  + fileNameKey + "   " + completePath);
        }
        let endMS = this.getCurrentMS();//文件分析结束时毫秒数
        DebugLogger.AdapterInfo("文件Map刷新完毕，使用了" +  (endMS - beginMS) + "毫秒。检索了"+ workspaceFileCount +"个文件， 其中" + processFilNum + "个lua类型文件");
        if(processFilNum <= 0){
            DebugLogger.showTips("没有在工程中检索到lua文件。请检查launch.json文件中lua后缀是否配置正确, 以及VSCode打开的工程是否正确",2)
            let noLuaFileTip = "[!] 没有在VSCode打开的工程中检索到lua文件，请进行如下检查\n 1. VSCode打开的文件夹是否正确 \n 2. launch.json 文件中 luaFileExtension 选项配置是否正确"
            DebugLogger.DebuggerInfo(noLuaFileTip);
            DebugLogger.AdapterInfo(noLuaFileTip);
        }
        this.fileNameToPathMap = _fileNameToPathMap;
    }

    // 获取当前毫秒数
    public static getCurrentMS(){
        let currentMS = new Date();//获取当前时间
        return currentMS.getTime();
    }

    // 检查同名文件, 如果存在，通过日志输出
    public static checkSameNameFile(){
        let sameNameFileStr;
        for (const nameKey in this.fileNameToPathMap) {
            let completePath = this.fileNameToPathMap[nameKey]
            if(isArray(completePath)){
                //初始化语句
                if(sameNameFileStr === undefined){
                    sameNameFileStr = "\n请注意VSCode打开工程中存在以下同名lua文件: \n";
                }
                sameNameFileStr = sameNameFileStr + " + " + completePath.join("\n + ") + "\n\n"
            }
        }

        if(sameNameFileStr){
            DebugLogger.showTips("\nVSCode打开工程中存在同名lua文件, 可能会影响调试器执行, 详细信息请查看VSCode控制台 OUTPUT - Debugger/log 日志",1)
            sameNameFileStr = sameNameFileStr + "调试器在自动路径模式下，可能无法识别同名lua文件中的断点，导致打开错误的文件。请修改VSCode打开的文件夹，确保其中没有同名文件。或者关闭launch.json中的autoPathMode, 改为手动配置路径。\n详细参考: https://github.com/Tencent/LuaPanda/blob/master/Docs/Manual/access-guidelines.md#第二步-路径规范 \n"
            DebugLogger.DebuggerInfo(sameNameFileStr);
            DebugLogger.AdapterInfo(sameNameFileStr);
        }
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

    // 传入局部路径，返回完整路径
    public static checkFullPath( shortPath: string ): string{
        if(this.useAutoPathMode === false){
            return shortPath;
        }

        //如果首字符是@，去除@
        if('@' === shortPath.substr(0,1)){
            shortPath = shortPath.substr(1);
        }

        let nameExtObject = this.getPathNameAndExt(shortPath);
        let fileName = nameExtObject['name'];
        
        let fullPath;
        if(this.pathCaseSensitivity){
            fullPath = this.fileNameToPathMap[fileName];
        }else{
            for (const keyPath in this.fileNameToPathMap) {
                if(keyPath.toLowerCase() === fileName){
                    fullPath = this.fileNameToPathMap[keyPath];
                    break;
                }
            }
        }

        if(fullPath){
            if(isArray(fullPath)){
                // 存在同名文件
                for (const key in fullPath) {
                    const element = fullPath[key];
                    if(element.indexOf(shortPath)){
                        return element; // 这里固定返回第一个元素
                    }
                }
            }else if(typeof fullPath === "string"){
                return fullPath;
            }
        }
        //最终没有找到，返回输入的地址
        DebugLogger.showTips("调试器没有找到文件 " + shortPath + " 。 请检查launch.json文件中lua后缀是否配置正确, 以及VSCode打开的工程是否正确", 2);
        return shortPath;
    }
}