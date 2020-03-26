// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

import * as vscode from 'vscode';
import {
    LoggingDebugSession,
    InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
    Thread, StackFrame, Scope, Source, Handles
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { basename } from 'path';
import { LuaDebugRuntime, LuaBreakpoint } from './luaDebugRuntime';
const { Subject } = require('await-notify');
import * as Net from 'net';
import { DataProcessor } from './dataProcessor';
import { DebugLogger } from '../common/logManager';
import { StatusBarManager } from '../common/statusBarManager';
import { LineBreakpoint, ConditionBreakpoint, LogPoint } from './breakpoint';
import { Tools } from '../common/Tools';
import { UpdateManager } from './updateManager';
import { ThreadManager } from '../common/ThreadManager';
import { PathManager } from '../common/PathManager';
import { VisualSetting } from './visualSetting'

export class LuaDebugSession extends LoggingDebugSession {
    public TCPPort;			//和客户端连接的端口号，通过VScode的设置赋值
    public connectionIP;
    public _server;    // adapter 作为server
    public _client;    // adapter 作为client
    private VSCodeAsClient;
    private breakpointsArray;  //在socket连接前临时保存断点的数组
    private autoReconnect;
    private _configurationDone = new Subject();
    private _variableHandles = new Handles<string>(50000);//Handle编号从50000开始
    private replacePath; //替换路径数组
    private connectInterval; // client 循环连接的句柄
    //luaDebugRuntime实例
    private _runtime: LuaDebugRuntime;  
    private _dataProcessor: DataProcessor;
    private _threadManager:ThreadManager;
    private _pathManager: PathManager;
    private UseLoadstring: boolean = false;

    //terminal实例，便于销毁
    private _debugFileTermianl;
    private _programTermianl;
    //保存所有活动的LuaDebugSession实例
    private static _debugSessionArray:Map<number ,LuaDebugSession> = new Map<number ,LuaDebugSession>();
    static get debugSessionArray(){    return LuaDebugSession._debugSessionArray; }

    public constructor() {
        super("lua-debug.txt");
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
        this._threadManager = new ThreadManager();  // 线程实例 调用this._threadManager.CUR_THREAD_ID可以获得当前线程号
        this._pathManager = new PathManager();
        this._runtime = new LuaDebugRuntime();  // _runtime and _dataProcessor 相互持有实例
        this._dataProcessor = new DataProcessor();
        this._dataProcessor._runtime = this._runtime;
        this._runtime._dataProcessor = this._dataProcessor;
        this._runtime._pathManager = this._pathManager;

        LuaDebugSession._debugSessionArray.set(this._threadManager.CUR_THREAD_ID, this);
        this._runtime.TCPSplitChar = "|*|";
        this._runtime.on('stopOnEntry', () => {
            this.sendEvent(new StoppedEvent('entry', this._threadManager.CUR_THREAD_ID));
        });
        this._runtime.on('stopOnStep', () => {
            this.sendEvent(new StoppedEvent('step', this._threadManager.CUR_THREAD_ID));
        });

        this._runtime.on('stopOnStepIn', () => {
            this.sendEvent(new StoppedEvent('step', this._threadManager.CUR_THREAD_ID));
        });

        this._runtime.on('stopOnStepOut', () => {
            this.sendEvent(new StoppedEvent('step', this._threadManager.CUR_THREAD_ID));
        });

        this._runtime.on('stopOnBreakpoint', () => {
            // 因为breakpoint在lua端可能出现同名文件错误匹配，这里要再次校验
            
            // breakpointsArray 中是否包含断点
            if(this.checkIsRealHitBreakpoint()){
                this.sendEvent(new StoppedEvent('breakpoint', this._threadManager.CUR_THREAD_ID));
            }else{
                // go on running
                this._runtime.continueWithFakeHitBk(() => {
                    DebugLogger.AdapterInfo("错误命中同名文件中的断点, 确认继续运行");
                });
            }
        });
        this._runtime.on('stopOnException', () => {
            this.sendEvent(new StoppedEvent('exception', this._threadManager.CUR_THREAD_ID));
        });
        this._runtime.on('stopOnPause', () => {
            this.sendEvent(new StoppedEvent('exception', this._threadManager.CUR_THREAD_ID));
        });
        this._runtime.on('breakpointValidated', (bp: LuaBreakpoint) => {
            this.sendEvent(new BreakpointEvent('changed', <DebugProtocol.Breakpoint>{ verified: bp.verified, id: bp.id }));
        });

        this._runtime.on('logInDebugConsole', (message) => {
            this.printLogInDebugConsole(message);
        });
    }

    // 在有同名文件的情况下，需要再次进行命中判断。
    private checkIsRealHitBreakpoint(){
        let steak = this._runtime.breakStack;
        let steakPath = steak[0].file;
        let steakLine = steak[0].line;
        for (let bkMap of this.breakpointsArray) {
            if(bkMap.bkPath === steakPath){
                for (const node of bkMap.bksArray) {
                    if(node.line == steakLine){
                        return true;
                    }
                }
            }
        }
        return false;
    }

    // 在调试控制台打印日志
    public printLogInDebugConsole(message){
        this.sendEvent(new OutputEvent(message + '\n', 'console'));
    }

    /**
     * VScode前端的首个请求，询问debug adapter所能提供的特性
     * 这个方法是VSCode调过来的，adapter拿到其中的参数进行填充. 再回给VSCode,VSCode根据这些设置做不同的显示
     */
    protected initializeRequest(response: DebugProtocol.InitializeResponse, args: DebugProtocol.InitializeRequestArguments): void {
        DebugLogger.AdapterInfo("initializeRequest!");
        //设置Debug能力
        response.body = response.body || {};
        response.body.supportsConfigurationDoneRequest = true;
        //后面可以支持Hovers显示值
        response.body.supportsEvaluateForHovers = true;//悬停请求变量的值
        response.body.supportsStepBack = false;//back按钮
        response.body.supportsSetVariable = true;//修改变量的值
        response.body.supportsFunctionBreakpoints = false;
        response.body.supportsConditionalBreakpoints = true;
        response.body.supportsHitConditionalBreakpoints = true;
        response.body.supportsLogPoints = true;
        // response.body.supportsRestartRequest = false;
        // response.body.supportsRestartFrame = false;

        
        this.sendResponse(response);
    }

    /**
     * configurationDone后通知launchRequest
     */
    protected configurationDoneRequest(response: DebugProtocol.ConfigurationDoneResponse, args: DebugProtocol.ConfigurationDoneArguments): void {
        super.configurationDoneRequest(response, args);
        this._configurationDone.notify();
    }

    /**
     * Attach 模式初始化代码
     */
    protected async attachRequest(response: DebugProtocol.AttachResponse, args) {
        await this._configurationDone.wait(1000);
        this.initProcess(response, args);
        this.printLogInDebugConsole("[Listening] 调试器插件已启动，正在等待连接。   Target:" + args.name  + " Port:" + args.connectionPort );
        this.sendResponse(response);
    }

    /**
     * Launch 模式初始化代码
     */
    protected async launchRequest(response: DebugProtocol.LaunchResponse, args) {
        await this._configurationDone.wait(1000);
        this.initProcess(response, args);
        this.printLogInDebugConsole("[Listening] 调试器插件已启动，正在等待连接。  Target:" + args.name  + " Port:" + args.connectionPort );
        this.sendResponse(response);
    }

    private copyAttachConfig(args){
        if(args.tag === "attach"){
            if(args.rootFolder){
                // 把launch中的配置拷贝到attach. 判断attach中是否有，如果有的话不再覆盖，没有的话覆盖。 
                let settings = VisualSetting.readLaunchjson(args.rootFolder);
                for (const launchValue of settings.configurations) {
                    if(launchValue["tag"] === "normal" || launchValue["name"] === "LuaPanda"){
                        for (const key in launchValue) {
                            if(key === "name" || key === "program" || args[key]){
                                continue;
                            }

                            if(key === "cwd"){
                                args[key] = launchValue[key].replace(/\${workspaceFolder}/, args.rootFolder );
                                continue;
                            }

                            args[key] = launchValue[key];
                        }
                    }
                }
            }
        }
        return args;
    }

    private initProcess(response, args){
        //1. 配置初始化信息
        let os = require("os");
        let path = require("path");

        this.copyAttachConfig(args)
        this.VSCodeAsClient = args.VSCodeAsClient;
        this.connectionIP = args.connectionIP;
        this.TCPPort = args.connectionPort;
        this._pathManager.CWD = args.cwd;
        this._pathManager.rootFolder = args.rootFolder;
        this._pathManager.useAutoPathMode = !!args.autoPathMode;
        this._pathManager.pathCaseSensitivity = !!args.pathCaseSensitivity;

        if(this._pathManager.useAutoPathMode === true){
            Tools.rebuildAcceptExtMap(args.luaFileExtension);
            this._pathManager.rebuildWorkspaceNamePathMap(args.cwd);
            this._pathManager.checkSameNameFile();
        }

        // 普通模式下才需要检查升级，单文件调试不用
        if(args.tag != "single_file"){
            try {
                new UpdateManager().checkIfLuaPandaNeedUpdate(this._pathManager.LuaPandaPath, args.cwd);
            } catch (error) {
                DebugLogger.AdapterInfo("[Error] 检查升级信息失败，可选择后续手动升级。 https://github.com/Tencent/LuaPanda/blob/master/Docs/Manual/update.md ");
            }      
        }

        let sendArgs = new Array();
        sendArgs["stopOnEntry"] = !!args.stopOnEntry;
        sendArgs["luaFileExtension"] = args.luaFileExtension;
        sendArgs["cwd"] = args.cwd;
        sendArgs["isNeedB64EncodeStr"] = !!args.isNeedB64EncodeStr;
        sendArgs["TempFilePath"] = args.TempFilePath;
        sendArgs["logLevel"] = args.logLevel;
        sendArgs["pathCaseSensitivity"] = args.pathCaseSensitivity;
        sendArgs["OSType"] = os.type();
        sendArgs["clibPath"] = Tools.getClibPathInExtension();
        sendArgs["useCHook"] = args.useCHook;
        sendArgs["adapterVersion"] = String(Tools.adapterVersion);
        sendArgs["autoPathMode"] = this._pathManager.useAutoPathMode;
        
        if(args.docPathReplace instanceof Array && args.docPathReplace.length === 2 ){
            this.replacePath = new Array( Tools.genUnifiedPath(String(args.docPathReplace[0])), Tools.genUnifiedPath(String(args.docPathReplace[1])));
        }else{
            this.replacePath = null;
        }

        this.autoReconnect = args.autoReconnect;
        //2. 初始化内存分析状态栏
        StatusBarManager.reset();
        if(this.VSCodeAsClient){
            // VSCode = Client ; Debugger = Server
            this.startClient(sendArgs);
        }else{
            this.startServer(sendArgs);
        }

        this.breakpointsArray = new Array();
        this.sendEvent(new InitializedEvent()); //收到返回后，执行setbreakpoint
        
        //单文件调试模式
        if( args.tag === "single_file" ){       
            // 获取活跃窗口
            let retObject = Tools.getVSCodeAvtiveFilePath();
            if( retObject["retCode"] !== 0 ){
                DebugLogger.DebuggerInfo(retObject["retMsg"]);
                return;
            }
            let filePath = retObject["filePath"];

            if(this._debugFileTermianl){
                this._debugFileTermianl.dispose();
            }
            this._debugFileTermianl = vscode.window.createTerminal({
                name: "Debug Lua File (LuaPanda)",
                env: {}, 
            });

            // 把路径加入package.path
            let pathCMD = "'";
            let pathArr = Tools.VSCodeExtensionPath.split( path.sep );
            let stdPath = pathArr.join('/');
            pathCMD = pathCMD + stdPath + "/Debugger/?.lua;"
            pathCMD = pathCMD + args.packagePath.join(';')
            pathCMD = pathCMD + "'";
            //拼接命令
            pathCMD = " \"package.path = " + pathCMD + ".. package.path; ";
            let reqCMD = "require('LuaPanda').start('127.0.0.1'," + this.TCPPort + ");\" ";
            let doFileCMD = filePath;
            let runCMD = pathCMD + reqCMD + doFileCMD;

            let LuaCMD;
            if(args.luaPath && args.luaPath !== ''){
                LuaCMD = args.luaPath + " -e "
            }else{
                LuaCMD = "lua -e ";
            }
            this._debugFileTermianl.sendText( LuaCMD + runCMD , true);
            this._debugFileTermianl.show();
        }
        else{
            // 非单文件调试模式下，拉起program
            if(args.program != undefined && args.program.trim() != ''){
                let fs = require('fs');
                if(fs.existsSync(args.program) && fs.statSync(args.program).isFile()){
                    //program 和 args 分开
                    if(this._programTermianl){
                        this._programTermianl.dispose();
                    }
                    this._programTermianl = vscode.window.createTerminal({
                        name: "Run Program File (LuaPanda)",
                        env: {}, 
                    });
    
                    let progaamCmdwithArgs = args.program;
                    for (const arg of args.args) {
                        progaamCmdwithArgs = progaamCmdwithArgs + " " + arg;
                    }
                    
                    this._programTermianl.sendText(progaamCmdwithArgs , true);
                    this._programTermianl.show(); 
                }else{
                    vscode.window.showErrorMessage("[Error] launch.json 文件中 program 路径错误：program可以该指向一个二进制文件, 调试器启动时会拉起这个文件。如不需要此设置，可以设置为\"\"。 当前目标" + args.program + " 不存在，请修改后再试。" , "好的");
                }
            }
        }
    }

    private startServer(sendArgs){
        //3. 启动Adapter的socket   |   VSCode = Server ; Debugger = Client
        this._server = Net.createServer(socket => {
            //--connect--
            this._dataProcessor._socket = socket;
            //向debugger发送含配置项的初始化协议
            this._runtime.start(( _ , info) => {
                let connectMessage = "[Connected] VSCode Server Connected! Remote device info  " + socket.remoteAddress + ":" + socket.remotePort ;
                DebugLogger.AdapterInfo(connectMessage);
                this.printLogInDebugConsole(connectMessage);
                this.printLogInDebugConsole("[Tips] 当停止在断点处时，可使用调试控制台观察变量或执行表达式. 调试控制台使用帮助: http://" );

                if (info.UseLoadstring === "1") {
                    this.UseLoadstring = true;
                } else {
                    this.UseLoadstring = false;
                }
                if (info.isNeedB64EncodeStr === "true") {
                    this._dataProcessor.isNeedB64EncodeStr = true;
                } else {
                    this._dataProcessor.isNeedB64EncodeStr = false;
                }
                if (info.UseHookLib === "1") { }
                //已建立连接，并完成初始化
                //发送断点信息
                for (let bkMap of this.breakpointsArray) {
                    this._runtime.setBreakPoint(bkMap.bkPath, bkMap.bksArray, null, null);
                }
            }, sendArgs);
            //--connect end--
            socket.on('end', () => {
                DebugLogger.AdapterInfo('socket end');
            });

            socket.on('close', () => {
                DebugLogger.AdapterInfo('Socket close!');
                vscode.window.showInformationMessage('Stop connecting!');
                // this._dataProcessor._socket 是在建立连接后赋值，所以在断开连接时删除
                delete this._dataProcessor._socket;
                this.sendEvent(new TerminatedEvent(this.autoReconnect));
            });

            socket.on('data', (data) => {
                DebugLogger.AdapterInfo('[Get Msg]:' + data);
                this._dataProcessor.processMsg(data.toString());
            });
        }).listen(this.TCPPort, 1 , function () {
            DebugLogger.AdapterInfo("listening...");
            DebugLogger.DebuggerInfo("listening...");

        });

    }

    private startClient(sendArgs){
        // 循环发送connect请求，每次请求持续1s。 
        // 停止循环的时机 :  1建立连接后 2未建立连接，但是用户点击VScode stop按钮
		this.connectInterval = setInterval(begingConnect, 1000, this);

		function begingConnect(instance){
			instance._client = Net.createConnection(instance.TCPPort, instance.connectionIP);
			//设置超时时间
			instance._client.setTimeout(800);

			instance._client.on('connect', () => {
				clearInterval(instance.connectInterval);		 //连接后清除循环请求
                instance._dataProcessor._socket = instance._client;
				instance._runtime.start(( _ , info) => {
                    let connectMessage = "[Connected] VSCode Client Connected!";
                    DebugLogger.AdapterInfo(connectMessage);
                    instance.printLogInDebugConsole(connectMessage);
                    instance.printLogInDebugConsole("[Tips] 当停止在断点处时，可使用调试控制台观察变量或执行表达式. 调试控制台使用帮助: http://" );
                    //已建立连接，并完成初始化
					if (info.UseLoadstring === "1") {
                        instance.UseLoadstring = true;
                    } else {
                        instance.UseLoadstring = false;
                    }
                    if (info.isNeedB64EncodeStr === "true") {
                        instance._dataProcessor.isNeedB64EncodeStr = true;
                    } else {
                        instance._dataProcessor.isNeedB64EncodeStr = false;
                    }
                    if (info.UseHookLib === "1") { }
                    //已建立连接，并完成初始化
                    //发送断点信息
                    for (let bkMap of instance.breakpointsArray) {
                        instance._runtime.setBreakPoint(bkMap.bkPath, bkMap.bksArray, null, null);
                    }
                    }, sendArgs);
            });
            
			instance._client.on('end', () => {
                // VScode client 主动发起断开连接
                DebugLogger.AdapterInfo("client end");
                vscode.window.showInformationMessage('Stop connecting!');
                // this._dataProcessor._socket 是在建立连接后赋值，所以在断开连接时删除
                delete instance._dataProcessor._socket;
                instance.sendEvent(new TerminatedEvent(instance.autoReconnect));
			});

			instance._client.on('close', () => {
                // 可能是连接后断开，也可能是超时关闭socket
                // DebugLogger.AdapterInfo('client close!');
            });
            //接收消息
			instance._client.on('data',  (data) => {
                DebugLogger.AdapterInfo('[Get Msg]:' + data);
                instance._dataProcessor.processMsg(data.toString());
			});
		}
	}

    /**
     * VSCode -> Adapter 设置(删除)断点
     */
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        DebugLogger.AdapterInfo('setBreakPointsRequest');
        let path = <string>args.source.path;
        path = Tools.genUnifiedPath(path);

        if(this.replacePath && this.replacePath.length === 2){
            path = path.replace(this.replacePath[1], this.replacePath[0]);
        }        

        let vscodeBreakpoints = new Array(); //VScode UI识别的断点（起始行号1）

        args.breakpoints!.map(bp => {
            const id = this._runtime.getBreakPointId()

            let breakpoint; // 取出args中的断点并判断类型。
            if (bp.condition) {
                breakpoint = new ConditionBreakpoint(true, bp.line, bp.condition, id);
            }
            else if (bp.logMessage) {
                breakpoint = new LogPoint(true, bp.line, bp.logMessage, id);
            }
            else {
                breakpoint = new LineBreakpoint(true, bp.line, id);
            }

            vscodeBreakpoints.push(breakpoint);
        });

        response.body = {
            breakpoints: vscodeBreakpoints
        };

        // 更新记录数据中的断点
        if (this.breakpointsArray == undefined) {
            this.breakpointsArray = new Array();
        }

        let isbkPathExist = false;  //断点路径已经存在于断点列表中
        for (let bkMap of this.breakpointsArray) {
            if (bkMap.bkPath === path) {
                bkMap["bksArray"] = vscodeBreakpoints;
                isbkPathExist = true;
            }
        }

        if(!isbkPathExist){
            let bk = new Object();
            bk["bkPath"] = path;
            bk["bksArray"] = vscodeBreakpoints;
            this.breakpointsArray.push(bk);
        }

        if (this._dataProcessor._socket) {
            //已建立连接
            let callbackArgs = new Array();
            callbackArgs.push(this);
            callbackArgs.push(response);
            this._runtime.setBreakPoint(path, vscodeBreakpoints, function (arr) {
                DebugLogger.AdapterInfo("确认断点");
                let ins = arr[0];
                ins.sendResponse(arr[1]);//在收到debugger的返回后，通知VSCode, VSCode界面的断点会变成已验证
            }, callbackArgs);
        } else {
            //未连接，直接返回
            this.sendResponse(response);
        }
    }

    /**
     * 断点的堆栈追踪
     */
    protected stackTraceRequest(response: DebugProtocol.StackTraceResponse, args: DebugProtocol.StackTraceArguments): void {
        const startFrame = typeof args.startFrame === 'number' ? args.startFrame : 0;
        const maxLevels = typeof args.levels === 'number' ? args.levels : 1000;
        const endFrame = startFrame + maxLevels;
        const stk = this._runtime.stack(startFrame, endFrame);
        response.body = {
            stackFrames: stk.frames.map(f => {
                    let source = f.file;
                    if(this.replacePath && this.replacePath.length === 2){
                        source = source.replace(this.replacePath[0], this.replacePath[1]);
                    }
                    return new StackFrame(f.index, f.name, this.createSource(source), f.line);
                }
            ),
            totalFrames: stk.count
        };
        this.sendResponse(response);
    }

    /**
     * 监控的变量
     */
    protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
        //watch -- 监视窗口
        if (args.context == "watch" || args.context == "hover") {
            let callbackArgs = new Array();
            callbackArgs.push(this);
            callbackArgs.push(response);
            //把B["A"] ['A'] => B.A形式
            if (this.UseLoadstring == false) {
                let watchString = args.expression;
                watchString = watchString.replace(/\[/g, ".");
                watchString = watchString.replace(/\"/g, "");
                watchString = watchString.replace(/\'/g, "");
                watchString = watchString.replace(/]/g, "");
                args.expression = watchString;
            }

            this._runtime.getWatchedVariable((arr, info) => {
                if (info.length === 0) {
                    //没有查到
                    arr[1].body = {
                        result: '未能查到变量的值',
                        type: 'string',
                        variablesReference: 0
                    };
                } else {
                    arr[1].body = {
                        result: info[0].value,
                        type: info[0].type,
                        variablesReference: parseInt(info[0].variablesReference)
                    };
                }
                let ins = arr[0];				//第一个参数是实例
                ins.sendResponse(arr[1]);//第二个参数是response
            }, callbackArgs, args.expression, args.frameId);

        } else if (args.context == "repl") {
            //repl -- 调试控制台
            let callbackArgs = new Array();
            callbackArgs.push(this);
            callbackArgs.push(response);
            this._runtime.getREPLExpression((arr, info) => {
                if (info.length === 0) {
                    //没有查到
                    arr[1].body = {
                        result: 'nil',
                        variablesReference: 0
                    };
                } else {
                    arr[1].body = {
                        result: info[0].value,
                        type: info[0].type,
                        variablesReference: parseInt(info[0].variablesReference)
                    };
                }
                let ins = arr[0];
                ins.sendResponse(arr[1]);
            }, callbackArgs, args.expression, args.frameId);
        } else {
            this.sendResponse(response);
        }
    }

    /**
     * 在变量大栏目中列举出的种类
     */
    protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
        const frameReference = args.frameId;
        const scopes = new Array<Scope>();
        //local 10000,  global 20000, upvalue 30000
        scopes.push(new Scope("Local", this._variableHandles.create("10000_" + frameReference), false));
        scopes.push(new Scope("Global", this._variableHandles.create("20000_" + frameReference), true));
        scopes.push(new Scope("UpValue", this._variableHandles.create("30000_" + frameReference), false));
        response.body = {
            scopes: scopes
        };
        this.sendResponse(response);
    }

    /**
     * 设置变量的值
     */
    protected setVariableRequest(response: DebugProtocol.SetVariableResponse, args: DebugProtocol.SetVariableArguments){
        let callbackArgs = new Array();
        callbackArgs.push(this);
        callbackArgs.push(response);   
    
        let referenceString = this._variableHandles.get(args.variablesReference);
        let referenceArray : string[] = [];
        if(referenceString != null)  {
            referenceArray = referenceString.split('_');
            if (referenceArray.length < 2) {
                DebugLogger.AdapterInfo("[variablesRequest Error] #referenceArray < 2 , #referenceArray = "+ referenceArray.length);
                this.sendResponse(response);
                return;
            }
        }else{
            //_variableHandles 取不到的情况下 referenceString 即为真正的变量 ref
            referenceArray[0] = String(args.variablesReference);
        }

        this._runtime.setVariable((arr, info) => {
            if(info.success === "true"){
                arr[1].body = {
                    value: String(info.value),
                    type: String(info.type),
                    variablesReference: parseInt(info.variablesReference)
                };
                DebugLogger.showTips( info.tip );
            }else{
                DebugLogger.showTips("变量赋值失败 [" + info.tip + "]" );
            }
            let ins = arr[0];
            ins.sendResponse(arr[1]);   
        }, callbackArgs,  args.name,  args.value, parseInt(referenceArray[0]) , parseInt(referenceArray[1]));
    }

    /**
     * 变量信息   断点的信息应该完全用一条协议单独发，因为点开Object，切换堆栈都需要单独请求断点信息
     */
    protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
        let callbackArgs = new Array();
        callbackArgs.push(this);
        callbackArgs.push(response);

        let referenceString = this._variableHandles.get(args.variablesReference);
        let referenceArray : string[] = [];
        if(referenceString != null)  {
            referenceArray = referenceString.split('_');
            if (referenceArray.length < 2) {
                DebugLogger.AdapterInfo("[variablesRequest Error] #referenceArray < 2 , #referenceArray = "+ referenceArray.length);
                this.sendResponse(response);
                return;
            }
        }else{
            //_variableHandles 取不到的情况下 referenceString 即为真正的变量ref
            referenceArray[0] = String(args.variablesReference);
        }

        this._runtime.getVariable((arr, info) => {
            if( info == undefined ){
                info = new Array();
            }
            const variables = new Array<DebugProtocol.Variable>();
            info.forEach(element => {
                variables.push({
                    name: element.name,
                    type: element.type,
                    value: element.value,
                    variablesReference: parseInt(element.variablesReference)
                });
            });
            arr[1].body = {
                variables: variables
            };
            let ins = arr[0];
            ins.sendResponse(arr[1]);
        }, callbackArgs, parseInt(referenceArray[0]) , parseInt(referenceArray[1]));
    }

    /**
     * continue 执行
     */
    protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
        let callbackArgs = new Array();
        callbackArgs.push(this);
        callbackArgs.push(response);
        this._runtime.continue(arr => {
            DebugLogger.AdapterInfo("确认继续运行");
            let ins = arr[0];
            ins.sendResponse(arr[1]);
        }, callbackArgs);
    }

    /**
     * step 单步执行
     */
    protected nextRequest(response: DebugProtocol.NextResponse, args: DebugProtocol.NextArguments): void {
        let callbackArgs = new Array();
        callbackArgs.push(this);
        callbackArgs.push(response);
        this._runtime.step(arr => {
            DebugLogger.AdapterInfo("确认单步");
            let ins = arr[0];
            ins.sendResponse(arr[1]);
        }, callbackArgs);
    }

    /**
     * step in
     */
    protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void {
        let callbackArgs = new Array();
        callbackArgs.push(this);
        callbackArgs.push(response);
        this._runtime.step(arr => {
            DebugLogger.AdapterInfo("确认StepIn");
            let ins = arr[0];
            ins.sendResponse(arr[1]);
        }, callbackArgs, 'stopOnStepIn');
    }

    /**
     * step out
     */
    protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void {
        let callbackArgs = new Array();
        callbackArgs.push(this);
        callbackArgs.push(response);
        this._runtime.step(arr => {
            DebugLogger.AdapterInfo("确认StepOut");
            let ins = arr[0];
            ins.sendResponse(arr[1]);
        }, callbackArgs, 'stopOnStepOut');
    }

    /**
     * pause 暂不支持
     */
    protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): void {
        vscode.window.showInformationMessage('pauseRequest!');
    }

    /**
     * 断开和lua的连接
     * 关闭连接的调用顺序 停止连接时的公共方法要放入 disconnectRequest.
     * 未建立连接 : disconnectRequest
     * 当VScode主动停止连接 : disconnectRequest - > socket end -> socket close
     * 当lua进程主动停止连接 : socket end -> socket close -> disconnectRequest
     */
    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args): void {
        let disconnectMessage = "[Disconnect Request] disconnectRequest";
        DebugLogger.AdapterInfo(disconnectMessage);
        this.printLogInDebugConsole(disconnectMessage);

        let restart = args.restart;
        if(this.VSCodeAsClient){
            clearInterval(this.connectInterval);// 在未建立连接的情况下清除循环
            this._client.end();                 // 结束连接
        }else{
            // 给lua发消息，让lua client停止运行
            let callbackArgs = new Array();
            callbackArgs.push(restart);
            this._runtime.stopRun(arr => {
                //客户端主动断开连接，这里仅做确认
                DebugLogger.AdapterInfo("确认stop");
            }, callbackArgs, 'stopRun');
            this._server.close();               // 关闭 server, 停止 listen. 放在这里的原因是即使未建立连接，也可以停止listen.
        }

        // 删除自身的线程id, 并从LuaDebugSession实例列表中删除自身
        this._threadManager.destructor();
        LuaDebugSession._debugSessionArray.delete(this._threadManager.CUR_THREAD_ID);
        this.sendResponse(response);
    }

    protected restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments): void {
        DebugLogger.AdapterInfo("restartRequest");
    }

    protected restartFrameRequest(response: DebugProtocol.RestartFrameResponse, args: DebugProtocol.RestartFrameArguments): void {
        DebugLogger.AdapterInfo("restartFrameRequest");
    }

    private createSource(filePath: string): Source {
        return new Source(basename(filePath), this.convertDebuggerPathToClient(filePath), undefined, undefined, undefined);
    }

    protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
        response.body = {
            threads: [
                new Thread(this._threadManager.CUR_THREAD_ID, "thread " + this._threadManager.CUR_THREAD_ID)
            ]
        };
        this.sendResponse(response);
    }

    public LuaGarbageCollect() {
        this._runtime.luaGarbageCollect();
    }
}
