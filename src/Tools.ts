import * as vscode from 'vscode';
import { isArray } from 'util';
let path = require("path");
let pathReader = require('path-reader');
import { DebugLogger } from './LogManager';

export class Tools {
    public static extMap = new Object();  // 可处理的文件后缀列表
    public static fileNameToPathMap;   // 文件名-路径Map
    public static useAutoPathMode = false; 

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

    // 构建可接受的后缀列表
    public static rebuildAcceptExtMap(userSetExt? : string){
        this.extMap = new Object();
        this.extMap['lua'] = true;
        this.extMap['lua.txt'] = true;
        if(typeof userSetExt == 'string' && userSetExt != ''){
            this.extMap[userSetExt] = true;
        }
    }

    //建立/刷新 工程下 文件名-路径Map
    // 评估执行效率，这个函数可以考虑应该区分同步，以优化体验
    public static rebuildWorkspaceNamePathMap(rootPath : string){
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
        DebugLogger.AdapterInfo("文件Map刷新完毕，共计"+ workspaceFileCount +"个文件， 其中" + processFilNum + "个lua类型文件");
        this.fileNameToPathMap = _fileNameToPathMap;
    }

    // 检查同名文件
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
            DebugLogger.showTips("\nVSCode打开工程中存在同名lua文件, 详细信息请查看VSCode控制台 OUTPUT - Debugger/log 日志",2)
            sameNameFileStr = sameNameFileStr + "在自动路径模式下，同名文件可能造成断点无法被正确识别。请修改VSCode打开的文件夹，确保其中没有同名文件。或者关闭launch.json中的autoPathMode, 改为手动配置路径。\n详细参考: https://github.com/Tencent/LuaPanda/blob/master/Docs/Manual/access-guidelines.md#第二步-路径规范\n"
            DebugLogger.DebuggerInfo(sameNameFileStr);
            DebugLogger.AdapterInfo(sameNameFileStr);
        }
    }

    // 从URI分析出文件名和后缀
    public static getPathNameAndExt(UriOrPath): Object{
        let name_and_ext = path.basename(UriOrPath).split('.');
        let name = name_and_ext[0];								  //文件名
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
        let fullPath = this.fileNameToPathMap[fileName];
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
        DebugLogger.showTips("调试器没有找到文件 " + shortPath + " , 请检查 launch.json 中后缀是否配置正确", 2);
        return shortPath;
    }
}
