'use strict';
import * as vscode from 'vscode';
import * as Net from 'net';

import { LuaDebugSession } from './luaDebug';
import { DebugLogger } from './LogManager';
import { StatusBarManager } from './StatusBarManager';
import { Tools } from './Tools';

export function activate(context: vscode.ExtensionContext) {
    //reloadWindow
    let reloadWindow = vscode.commands.registerCommand('luapanda.reloadLuaDebug', function () {
        vscode.commands.executeCommand("workbench.action.reloadWindow")
    });
    context.subscriptions.push(reloadWindow);
    //force garbage collect
    let LuaGarbageCollect = vscode.commands.registerCommand('luapanda.LuaGarbageCollect', function () {
        LuaDebugSession.getInstance().LuaGarbageCollect();
        vscode.window.showInformationMessage('Lua Garbage Collect!');
    });
    context.subscriptions.push(LuaGarbageCollect);

    const provider = new LuaConfigurationProvider()
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('lua', provider));
    context.subscriptions.push(provider);
    //init log
    DebugLogger.init();
    StatusBarManager.init();
}

export function deactivate() {
    // nothing to do
}

class LuaConfigurationProvider implements vscode.DebugConfigurationProvider {
    private _server?: Net.Server;
    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
        // if launch.json is missing or empty
        if (!config.type && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'lua') {
                vscode.window.showInformationMessage('请先正确配置launch文件!');
                config.type = 'lua';
                config.name = 'LuaPanda';
                config.request = 'launch';
            }
        }

        // 不调试而直接运行当前文件
        if(config.noDebug){
            // 获取活跃窗口
            let retObject = Tools.getVSCodeAvtiveFilePath();
            if( retObject["retCode"] !== 0 ){
                DebugLogger.DebuggerInfo(retObject["retMsg"]);
                return;
            }
            let filePath = retObject["filePath"];

            const terminal = vscode.window.createTerminal({
                name: "Run Lua File (LuaPanda)",
                env: {}, 
            });

            // 把路径加入package.path
            let path = require("path");
            let pathCMD = "'";
            let pathArr = path.dirname(__dirname).split( path.sep );
            let stdPath =  pathArr.join('/');
            pathCMD = pathCMD + stdPath + "/Debugger/?.lua;"
            pathCMD = pathCMD + config.packagePath.join(';')
            pathCMD = pathCMD + "'";
            //拼接命令
            pathCMD = " \"package.path = " + pathCMD + ".. package.path;\" ";
            let doFileCMD =  filePath;
            let runCMD = pathCMD + doFileCMD;

            let LuaCMD;
            if(config.luaPath && config.luaPath !== ''){
                LuaCMD = config.luaPath + " -e "
            }else{
                LuaCMD = "lua -e ";
            }
            terminal.sendText( LuaCMD + runCMD , true);
            terminal.show();
            return ;
        }

        // 关于打开调试控制台的自动设置
        if(config.name === "LuaPanda"){
            if(!config.internalConsoleOptions){
                config.internalConsoleOptions = "openOnFirstSessionStart";
            }
        }else if(config.name === "LuaPanda-DebugFile"){
            if(!config.internalConsoleOptions){
                config.internalConsoleOptions = "neverOpen";
            }
        }

        if(!config.program){
            config.program = '';
        }

        if(!config.autoPathMode){
            config.autoPathMode = false;
        }

        if(!config.args){
            config.args = new Array<string>();
        }

        if (!config.request) {
            vscode.window.showInformationMessage("请在launch中配置request方式!");
            config.request = 'launch';
        }

        if (!config.cwd) {
            vscode.window.showInformationMessage("请在launch中配置cwd工作路径!");
            config.cwd = '${workspaceFolder}';
        }

        if (!config.TempFilePath) {
            // vscode.window.showInformationMessage("请在launch中配置TempFilePath路径!");
            config.TempFilePath = '${workspaceFolder}';
        }

        if (!config.luaFileExtension) {
            config.luaFileExtension = '';
        }else{
            let firseLetter = config.luaFileExtension.substr(0, 1);
            if(firseLetter === '.'){
                config.luaFileExtension =  config.luaFileExtension.substr(1);
            }
        }

        if (config.stopOnEntry == undefined) {
            vscode.window.showInformationMessage("请在launch中配置是否stopOnEntry")
            config.stopOnEntry = true;
        }

        if (config.pathCaseSensitivity == undefined) {
            //vscode.window.showInformationMessage("请在launch中配置pathCaseSensitivity")
            config.pathCaseSensitivity = true;
        }

        if (config.trace == undefined) {
            config.trace = false;
        }

        if (config.connectionPort == undefined) {
            LuaDebugSession.TCPPort = 8818;
        } else {
            LuaDebugSession.TCPPort = config.connectionPort;
        }

        if (config.logLevel == undefined) {
            config.logLevel = 1;
        }

        if (config.autoReconnect != true) {
            config.autoReconnect = false;
        }

        //隐藏属性
        if (config.DebugMode == undefined) {
            config.DebugMode = false;
        }

        if (config.useCHook == undefined) {
            config.useCHook = true;
        }

        if (config.isNeedB64EncodeStr == undefined) {
            config.isNeedB64EncodeStr = true;
        }
        
        if (!this._server) {
            this._server = Net.createServer(socket => {
                const session = new LuaDebugSession();
                session.setRunAsServer(true);
                session.start(<NodeJS.ReadableStream>socket, socket);
            }).listen(0);
        }
        // make VS Code connect to debug server instead of launching debug adapter
        config.debugServer = this._server.address().port;
        return config;
    }

    dispose() {
        if (this._server) {
            this._server.close();
        }
    }
}
