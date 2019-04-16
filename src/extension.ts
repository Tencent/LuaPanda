'use strict';
import * as vscode from 'vscode';
import * as Net from 'net';

import { LuaDebugSession } from './luaDebug';
import { DebugLogger } from './LogManager';
import { StatusBarManager } from './StatusBarManager';

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

        if(config.noDebug){
            let activeWindow =  vscode.window.activeTextEditor;
            if (activeWindow){  
                //有活动的窗口
                let path = require("path");
                let filePath = activeWindow.document.uri.fsPath;
                let fileParser = path.parse(filePath);
                let fileName = fileParser.name;
                let dirName = fileParser.dir;

                let pathCMD = "'" + dirName + "/?.lua;"
                if(config.packagePath){
                    for (let index = 0; index < config.packagePath.length; index++) {
                        const joinPath = config.packagePath[index];
                        pathCMD = pathCMD + joinPath + ";";
                    }
                }
                pathCMD = pathCMD + "'";
                //拼接命令
                pathCMD = " \"package.path = " + pathCMD + ".. package.path; ";
                let doFileCMD = "require('"  +  fileName + "'); \" ";
                let runCMD = pathCMD + doFileCMD;
                const terminal = vscode.window.createTerminal({
                    name: "Run Lua File (LuaPanda)",
                    // shellPath: folder.uri.path,
                    env: {}, 
                });
                terminal.show();
                let LuaCMD;
                if(config.luaPath && config.luaPath != ''){
                    LuaCMD = config.luaPath + " -e "
                }else{
                    LuaCMD = "lua -e ";
                }
                terminal.sendText( LuaCMD + runCMD , true);
            }
            return ;
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
            vscode.window.showInformationMessage("请在launch中配置TempFilePath路径!");
            config.TempFilePath = '${workspaceFolder}';
        }

        if (!config.luaFileExtension) {
            config.luaFileExtension = '';
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
