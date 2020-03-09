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
import { Tools } from '../common/tools';
import { UpdateManager } from './updateManager';

export class LuaDebugSession extends LoggingDebugSession {
    public static isNeedB64EncodeStr: boolean = true;
    private static THREAD_ID = 1; 	  //调试器不支持多线程，硬编码THREAD_ID为1
    public static TCPPort = 0;			//和客户端连接的端口号，通过VScode的设置赋值
    private static breakpointsArray;  //在socket连接前临时保存断点的数组
    private static autoReconnect;
    private _configurationDone = new Subject();
    private _variableHandles = new Handles<string>(50000);//Handle编号从50000开始
    private static replacePath; //替换路径数组
    //自身单例
    private static instance: LuaDebugSession;
    public static userConnectionFlag;      //这个标记位的作用是标记Adapter停止连接，因为Adapter是Server端，要等Client发来请求才能断开
    public static isListening;
    public static _server;

    public static getInstance(): LuaDebugSession {
        return LuaDebugSession.instance;
    }

    //luaDebugRuntime实例
    private _runtime: LuaDebugRuntime;
    private UseLoadstring: boolean = false;

    //terminal实例，便于销毁
    private static _debugFileTermianl;
    private static _programTermianl;

    public getRuntime() {
        return this._runtime;
    }

    public constructor() {
        super("lua-debug.txt");
        //设置自身实例
        LuaDebugSession.instance = this;
        this.setDebuggerLinesStartAt1(true);
        this.setDebuggerColumnsStartAt1(true);
        //设置runtime实例
        this._runtime = new LuaDebugRuntime();
        DataProcessor._runtime = this._runtime;
        this._runtime.TCPSplitChar = "|*|";
        //给状态绑定监听方法
        this._runtime.on('stopOnEntry', () => {
            this.sendEvent(new StoppedEvent('entry', LuaDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnStep', () => {
            this.sendEvent(new StoppedEvent('step', LuaDebugSession.THREAD_ID));
        });

        this._runtime.on('stopOnStepIn', () => {
            this.sendEvent(new StoppedEvent('step', LuaDebugSession.THREAD_ID));
        });

        this._runtime.on('stopOnStepOut', () => {
            this.sendEvent(new StoppedEvent('step', LuaDebugSession.THREAD_ID));
        });

        this._runtime.on('stopOnBreakpoint', () => {
            this.sendEvent(new StoppedEvent('breakpoint', LuaDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnException', () => {
            this.sendEvent(new StoppedEvent('exception', LuaDebugSession.THREAD_ID));
        });
        this._runtime.on('stopOnPause', () => {
            this.sendEvent(new StoppedEvent('exception', LuaDebugSession.THREAD_ID));
        });
        this._runtime.on('breakpointValidated', (bp: LuaBreakpoint) => {
            this.sendEvent(new BreakpointEvent('changed', <DebugProtocol.Breakpoint>{ verified: bp.verified, id: bp.id }));
        });

        this._runtime.on('logInDebugConsole', (message) => {
            this.printLogInDebugConsole(message);
        });
    }

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
        response.body.supportsHitConditionalBreakpoints = false;
        response.body.supportsLogPoints = true;
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
     * launchRequest的args会把在Launch.json中的配置读取出来, 在这里通过socket传给Debugger
     */
    protected async launchRequest(response: DebugProtocol.LaunchResponse, args) {
        // 等待configurationDoneRequest的通知
        await this._configurationDone.wait(1000);
        this.printLogInDebugConsole("调试器已启动，正在等待连接.");

        //1. 配置初始化信息
        let os = require("os");
        let path = require("path");

        Tools.useAutoPathMode = !!args.autoPathMode;
        Tools.pathCaseSensitivity = !!args.pathCaseSensitivity;

        if(Tools.useAutoPathMode === true){
            Tools.rebuildAcceptExtMap(args.luaFileExtension);
            Tools.rebuildWorkspaceNamePathMap(args.cwd);
            Tools.checkSameNameFile();
        }

        // 普通模式下才需要检查升级，单文件调试不用
        if(!(args.tag === "single_file" || args.name === "LuaPanda-DebugFile")){
            try {
                UpdateManager.checkIfLuaPandaNeedUpdate();
            } catch (error) {
                DebugLogger.AdapterInfo("[Error] 检查升级信息失败，可选择后续手动升级。 https://github.com/Tencent/LuaPanda/blob/master/Docs/Manual/update.md ");
            }      
        }

        // 去除out, Debugger/debugger_lib/plugins/Darwin/   libpdebug_版本号.so
        let sendArgs = new Array();
        sendArgs["stopOnEntry"] = !!args.stopOnEntry;
        sendArgs["luaFileExtension"] = args.luaFileExtension;
        sendArgs["cwd"] = args.cwd;
        sendArgs["isNeedB64EncodeStr"] = !!args.isNeedB64EncodeStr;
        sendArgs["TempFilePath"] = args.TempFilePath;
        sendArgs["logLevel"] = args.logLevel;
        sendArgs["debugMode"] = args.DebugMode;
        sendArgs["pathCaseSensitivity"] = args.pathCaseSensitivity;
        sendArgs["OSType"] = os.type();
        sendArgs["clibPath"] = Tools.getClibPathInExtension();
        sendArgs["useCHook"] = args.useCHook;
        sendArgs["adapterVersion"] = String(Tools.adapterVersion);
        sendArgs["autoPathMode"] = Tools.useAutoPathMode;

        if(args.docPathReplace instanceof Array && args.docPathReplace.length === 2 ){
            LuaDebugSession.replacePath = new Array( Tools.genUnifiedPath(String(args.docPathReplace[0])), Tools.genUnifiedPath(String(args.docPathReplace[1])));
        }else{
            LuaDebugSession.replacePath = null;
        }

        LuaDebugSession.autoReconnect = args.autoReconnect;
        //2. 初始化内存分析状态栏
        StatusBarManager.reset();
        //3. 把response装入回调
        let callbackArgs = new Array();
        callbackArgs.push(this);
        callbackArgs.push(response);
        //4. 启动Adapter的socket   |   VSCode = Server ; Debugger = Client
        LuaDebugSession._server = Net.createServer(socket => {
            //--connect--
            DebugLogger.AdapterInfo("Debugger  " + socket.remoteAddress + ":" + socket.remotePort + "  connect!");
            DataProcessor._socket = socket;
            //向debugger发送含配置项的初始化协议
            this._runtime.start((arr, info) => {
                let connectMessage = "已建立连接，发送初始化协议和断点信息!"
                DebugLogger.AdapterInfo(connectMessage);
                this.printLogInDebugConsole("调试器已建立连接, 可以在断点处使用调试控制台观察变量或执行表达式.");

                //对luapanda.lua的版本控制，低于一定版本要提示升级
                if (typeof info.debuggerVer == "string"){
                    //转数字
                    let DVerArr = info.debuggerVer.split(".");
                    let AVerArr = String(Tools.adapterVersion).split(".");
                    if (DVerArr.length === AVerArr.length && DVerArr.length === 3 ){
                        //在adapter和debugger版本号长度相等的前提下，比较大版本，大版本 <2 或者 小版本 < 1 就提示. 2.1.0以下会提示
                        let intDVer = parseInt(DVerArr[0]) * 10000  + parseInt(DVerArr[1]) * 100 + parseInt(DVerArr[2]);
                        if ( intDVer < 20100 ){
                            DebugLogger.showTips("当前调试器的lua文件版本过低，可能无法正常使用，请升级到最新版本。帮助文档 https://github.com/Tencent/LuaPanda/blob/master/Docs/Manual/update.md ", 2);
                        }
                    }else{
                        DebugLogger.showTips("调试器版本号异常:" + info.debuggerVer + ". 建议升级至最新版本。帮助文档 https://github.com/Tencent/LuaPanda/blob/master/Docs/Manual/update.md ", 1);
                    }
                }
                if (info.UseLoadstring === "1") {
                    this.UseLoadstring = true;
                } else {
                    this.UseLoadstring = false;
                }
                if (info.isNeedB64EncodeStr === "true") {
                    LuaDebugSession.isNeedB64EncodeStr = true;
                } else {
                    LuaDebugSession.isNeedB64EncodeStr = false;
                }
                if (info.UseHookLib === "1") { }
                //已建立连接，并完成初始化
                let ins = arr[0];
                ins.sendResponse(arr[1]);
                LuaDebugSession.userConnectionFlag = true;
                LuaDebugSession.isListening = false;
                //发送断点信息
                for (let bkMap of LuaDebugSession.breakpointsArray) {
                    this._runtime.setBreakPoint(bkMap.bkPath, bkMap.bksArray, null, null);
                }
            }, callbackArgs, sendArgs);
            //--connect end--
            socket.on('end', () => {
                DebugLogger.AdapterInfo('socket end');
            });

            socket.on('close', () => {
                if (LuaDebugSession.isListening == true) {
                    DebugLogger.AdapterInfo('close socket when listening!');
                    return;
                }
                DebugLogger.AdapterInfo('Socket close!');
                vscode.window.showInformationMessage('Stop connecting!');
                //停止连接
                LuaDebugSession._server.close();
                LuaDebugSession.userConnectionFlag = false;
                delete DataProcessor._socket;
                //停止VSCode的调试模式
                this.sendEvent(new TerminatedEvent(LuaDebugSession.autoReconnect));
            });

            socket.on('data', (data) => {
                DebugLogger.AdapterInfo('[Get Msg]:' + data);
                DataProcessor.processMsg(data.toString());
            });
        }).listen(LuaDebugSession.TCPPort, function () {
            DebugLogger.AdapterInfo("listening...");
            DebugLogger.DebuggerInfo("listening...");

        });
        LuaDebugSession.isListening = true;
        LuaDebugSession.breakpointsArray = new Array();
        this.sendEvent(new InitializedEvent()); //收到返回后，执行setbreakpoint
        
        //单文件调试模式
        if(args.tag === "single_file" || args.name === "LuaPanda-DebugFile"){       
            // 获取活跃窗口
            let retObject = Tools.getVSCodeAvtiveFilePath();
            if( retObject["retCode"] !== 0 ){
                DebugLogger.DebuggerInfo(retObject["retMsg"]);
                return;
            }
            let filePath = retObject["filePath"];

            if(LuaDebugSession._debugFileTermianl){
                LuaDebugSession._debugFileTermianl.dispose();
            }
            LuaDebugSession._debugFileTermianl = vscode.window.createTerminal({
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
            let reqCMD = "require('LuaPanda').start('127.0.0.1'," + LuaDebugSession.TCPPort + ");\" ";
            let doFileCMD = filePath;
            let runCMD = pathCMD + reqCMD + doFileCMD;

            let LuaCMD;
            if(args.luaPath && args.luaPath !== ''){
                LuaCMD = args.luaPath + " -e "
            }else{
                LuaCMD = "lua -e ";
            }
            LuaDebugSession._debugFileTermianl.sendText( LuaCMD + runCMD , true);
            LuaDebugSession._debugFileTermianl.show();
        }
        else{
            // 非单文件调试模式下，拉起program
            if(args.program != undefined && args.program.trim() != ''){
                let fs = require('fs');
                if(fs.existsSync(args.program) && fs.statSync(args.program).isFile()){
                    //program 和 args 分开
                    if(LuaDebugSession._programTermianl){
                        LuaDebugSession._programTermianl.dispose();
                    }
                    LuaDebugSession._programTermianl = vscode.window.createTerminal({
                        name: "Run Program File (LuaPanda)",
                        env: {}, 
                    });
    
                    let progaamCmdwithArgs = args.program;
                    for (const arg of args.args) {
                        progaamCmdwithArgs = progaamCmdwithArgs + " " + arg;
                    }
                    
                    LuaDebugSession._programTermianl.sendText(progaamCmdwithArgs , true);
                    LuaDebugSession._programTermianl.show(); 
                }else{
                    vscode.window.showErrorMessage("launch.json 文件中 program 设置的路径错误： 文件 " + args.program + " 不存在，请修改后再试。" , "好的");
                }
            }
        }
    }

    /**
     * VSCode -> Adapter 设置(删除)断点
     */
    protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
        DebugLogger.AdapterInfo('setBreakPointsRequest');
        let path = <string>args.source.path;
        path = Tools.genUnifiedPath(path);

        if(LuaDebugSession.replacePath && LuaDebugSession.replacePath.length === 2){
            path = path.replace(LuaDebugSession.replacePath[1], LuaDebugSession.replacePath[0]);
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
        if (LuaDebugSession.breakpointsArray == undefined) {
            LuaDebugSession.breakpointsArray = new Array();
        }

        let isbkPathExist = false;  //断点路径已经存在于断点列表中
        for (let bkMap of LuaDebugSession.breakpointsArray) {
            if (bkMap.bkPath === path) {
                bkMap["bksArray"] = vscodeBreakpoints;
                isbkPathExist = true;
            }
        }

        if(!isbkPathExist){
            let bk = new Object();
            bk["bkPath"] = path;
            bk["bksArray"] = vscodeBreakpoints;
            LuaDebugSession.breakpointsArray.push(bk);
        }

        if (DataProcessor._socket && LuaDebugSession.userConnectionFlag) {
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
                    if(LuaDebugSession.replacePath && LuaDebugSession.replacePath.length === 2){
                        source = source.replace(LuaDebugSession.replacePath[0], LuaDebugSession.replacePath[1]);
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
     * disconnect
     */
    protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args): void {
        DebugLogger.AdapterInfo("disconnectRequest");
        let restart = args.restart;
        //给lua发消息，让lua停止运行
        let callbackArgs = new Array();
        callbackArgs.push(restart);
        this._runtime.stopRun(arr => {
            //客户端主动断开连接，这里仅做确认
            DebugLogger.AdapterInfo("确认stop");
        }, callbackArgs, 'stopRun');
        LuaDebugSession.userConnectionFlag = false;
        this.sendResponse(response);
        LuaDebugSession._server.close();
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
                new Thread(LuaDebugSession.THREAD_ID, "thread 1")
            ]
        };
        this.sendResponse(response);
    }

    public LuaGarbageCollect() {
        this._runtime.luaGarbageCollect();
    }
}
