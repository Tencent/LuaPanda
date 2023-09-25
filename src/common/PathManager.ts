import { DebugLogger } from './logManager';
import { Tools } from './tools';
import { isArray } from 'util';
import * as vscode from 'vscode';

let pathReader = require('path-reader');
// let path = require("path");

export class PathManager {
    public fileNameToPathMap;   // 文件名-路径 Map
    public useAutoPathMode = false; 
    public pathCaseSensitivity = false; 
    public VSCodeOpenedFolder;   // VSCode当前打开的用户工程路径。打开文件夹后，由languageServer赋值
    public LuaPandaPath;   // 用户工程中luapanda.lua文件所在的路径，它在调试器启动时赋值。但也可能工程中不存在luapanda文件导致路径为空
    public CWD;
    public rootFolder;
    public static rootFolderArray = {}; // name uri
    private consoleLog;
    private luaDebugInstance;
    public constructor(_luaDebugInstance, _consoleLog){
        this.luaDebugInstance = _luaDebugInstance;
        this.consoleLog = _consoleLog;
    }

    // 建立/刷新 工程下文件名-路径Map
    public rebuildWorkspaceNamePathMap(rootPath : string){
        let beginMS = Tools.getCurrentMS();//启动时毫秒数
        let _fileNameToPathMap = new Array();      // 文件名-路径 cache
        let workspaceFiles = pathReader.files(rootPath, {sync:true});   //同步读取工程中所有文件名
        let workspaceFileCount = workspaceFiles.length;
        let processFilNum = 0; //记录最终处理了多少个文件
        for(let processingFileIdx = 0; processingFileIdx < workspaceFileCount ; processingFileIdx++){
            let formatedPath = Tools.genUnifiedPath(workspaceFiles[processingFileIdx]);
            let nameExtObject = Tools.getPathNameAndExt(formatedPath);
            if( !Tools.extMap[nameExtObject['ext']] ){
                // 文件类型不在可处理列表中
                continue;
            }
            processFilNum = processFilNum + 1;
            let fileNameKey = nameExtObject['name']; // key是文件名，不包含路径和文件后缀
            if(_fileNameToPathMap[fileNameKey]){
                //存在同名文件
                if(isArray(_fileNameToPathMap[fileNameKey])){
                    _fileNameToPathMap[fileNameKey].push(formatedPath);
                }else if(typeof _fileNameToPathMap[fileNameKey] === "string"){
                    //冲突, 对应的key已有值（存在同名文件), 使用数组保存数据
                    let tempSaveValue = _fileNameToPathMap[fileNameKey];
                    let tempArray = new Array();
                    tempArray.push(tempSaveValue);
                    tempArray.push(formatedPath);
                    _fileNameToPathMap[fileNameKey] = tempArray;
                }else{
                    // 可能和元方法冲突, 此时key是一个function
                    _fileNameToPathMap[fileNameKey] = formatedPath; 
                }
            }else{
                _fileNameToPathMap[fileNameKey] = formatedPath; 
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
            // record LuaPanda.lua Path
            if(fileNameKey === "LuaPanda"){
                this.LuaPandaPath = completePath;
            }
        }
        let endMS = Tools.getCurrentMS();//文件分析结束时毫秒数
        DebugLogger.AdapterInfo("文件Map刷新完毕，使用了" +  (endMS - beginMS) + "毫秒。检索了"+ workspaceFileCount +"个文件， 其中" + processFilNum + "个lua类型文件");
        if(processFilNum <= 0){
            vscode.window.showErrorMessage("没有在工程中检索到lua文件。请检查launch.json文件中lua后缀(luaFileExtension)是否配置正确, 以及VSCode打开的工程是否正确", "确定")
            let noLuaFileTip = "[!] 没有在VSCode打开的工程中检索到lua文件，请进行如下检查\n 1. VSCode打开的文件夹是否正确 \n 2. launch.json 文件中 luaFileExtension 选项配置是否正确"
            DebugLogger.DebuggerInfo(noLuaFileTip);
            DebugLogger.AdapterInfo(noLuaFileTip);
        }
        this.fileNameToPathMap = _fileNameToPathMap;
    }

    // 检查同名文件, 如果存在，通过日志输出
    public  checkSameNameFile(distinguishSameNameFile){
        let sameNameFileStr;
        for (const nameKey in this.fileNameToPathMap) {
            let completePath = this.fileNameToPathMap[nameKey]
            if(isArray(completePath)){
                //初始化语句
                if(sameNameFileStr === undefined){
                    sameNameFileStr = "\nVSCode打开工程中存在以下同名lua文件: \n";
                }
                sameNameFileStr = sameNameFileStr + " + " + completePath.join("\n + ") + "\n\n"
            }
        }

        if(sameNameFileStr){
            if(distinguishSameNameFile){
                sameNameFileStr = sameNameFileStr + "distinguishSameNameFile 已开启。调试器[可以区分]同名文件中的断点。\n"
            }else{
                let sameNameFileTips = "[Tips] VSCode 打开目录中存在同名 lua 文件，请避免在这些文件中打断点。如确定需要区分同名文件中的断点，可按以下选择适合自己项目的操作:\n";
                sameNameFileTips += "方法1: LuaPanda启动时会索引 cwd 目录中的 lua 文件, 修改 launch.json 中的 cwd 配置路径, 过滤掉不参与运行的文件夹, 缩小索引范围来避免重复文件;\n";
                sameNameFileTips += "方法2: 在 launch.json 中加入 distinguishSameNameFile:true , 开启同名文件区分 (会采用更严格的路径校验方式区分同名文件);\n";
                sameNameFileTips += "方法3: 同名文件信息展示在 VSCode 控制台 OUTPUT - LuaPanda Debugger 中, 也可以尝试修改文件名;\n";   
                this.consoleLog(sameNameFileTips, this.luaDebugInstance);
            }

            DebugLogger.DebuggerInfo(sameNameFileStr);
            DebugLogger.AdapterInfo(sameNameFileStr);
        }
    }

    // 传入局部路径，返回完整路径
    public checkFullPath( shortPath: string , oPath?: string): string{
        if(this.useAutoPathMode === false){
            return shortPath;
        }

        //如果首字符是@，去除@
        if('@' === shortPath.substr(0,1)){
            shortPath = shortPath.substr(1);
        }

        let nameExtObject = Tools.getPathNameAndExt(shortPath);
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
                if(oPath){
                    return this.checkRightPath( shortPath , oPath , fullPath);
                }else{
                    // 如果lua文件没有更新，没有传过来oPath，则打开第一个文件
                    for (const element of fullPath) {
                        // @ts-ignore
                        if(element.indexOf(shortPath)){
                            // @ts-ignore
                            return element; // 这里固定返回第一个元素
                        }
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

    // 存在同名文件的情况下, 根据lua虚拟机传来的 fullPath , 判断断点处具体是哪一个文件
    public checkRightPath( fileName: string , oPath: string, fullPathArray): string{
        //------ 这部分还需要么？
        //如果首字符是@，去除@
        if('@' === oPath.substr(0,1)){
            oPath = oPath.substr(1);
        }
        //如果是相对路径，把 ./ 替换成 /
        if('./' === oPath.substr(0,2)){
            oPath = oPath.substr(1);
        }

        //标准化路径, 盘符变成小写
        oPath = Tools.genUnifiedPath(oPath);

        if(!this.pathCaseSensitivity){
            oPath = oPath.toLowerCase();
        }

        //因为 filename 存在不确定性（是否包含后缀），这里把后缀去掉进行对比
        let nameExtObject = Tools.getPathNameAndExt(fileName);
        fileName = nameExtObject['name'];

        // 从oPath中把文件名截取掉
        let idx = oPath.lastIndexOf(fileName);
        oPath = oPath.substring(0, idx - 1); // 此时opath是dir
        oPath = oPath + '/' + fileName;
        // oPath中的. 替换成 /
        oPath = oPath.replace(/\./g, "/");
        //------

        for (const iteratorPath of fullPathArray) {
            let pathForCompare = iteratorPath;
            if(!this.pathCaseSensitivity){
                pathForCompare = iteratorPath.toLowerCase()
            }
            if(pathForCompare.indexOf(oPath) >= 0){
                // fullPathArray 中包含oPath, 命中
                return iteratorPath;
            }
        }
        // 如果最终都无法命中， 默认第一条。这种情况要避免，否则二次验证也通不过
        if(Tools.developmentMode === true){
            // 开发模式下提示
            let str = "file_name:" + fileName +  "  opath:" + oPath + "无法命中任何文件路径!"
            DebugLogger.showTips(str);
            let Adapterlog = "同名文件无法命中!\n";
            for (const iteratorPath of fullPathArray) {
                Adapterlog += " + " + iteratorPath + "\n";
            }
            Adapterlog += str;
            DebugLogger.AdapterInfo(Adapterlog);
        }
        return fullPathArray[0];
    }
}
