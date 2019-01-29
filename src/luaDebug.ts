// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

import * as vscode from 'vscode';
import {
	Logger, logger,
	LoggingDebugSession,
	InitializedEvent, TerminatedEvent, StoppedEvent, BreakpointEvent, OutputEvent,
	Thread, StackFrame, Scope, Source, Breakpoint
} from 'vscode-debugadapter';
import { DebugProtocol } from 'vscode-debugprotocol';
import { basename } from 'path';
import { luaDebugRuntime, LuaBreakpoint } from './luaDebugRuntime';
const { Subject } = require('await-notify');
import * as Net from 'net';
import {dataProcesser} from './dataProcesser';
import {DebugLogger} from './LogManager';
import {StatusBarManager} from './StatusBarManager';

export class LuaDebugSession extends LoggingDebugSession {
	private static THREAD_ID = 1; 	  //调试器不支持多线程，硬编码THREAD_ID为1
	public static TCPPort = 0;			//和客户端连接的端口号，通过VScode的设置赋值
	private  static breakpointsArray; //在socket连接前临时保存断点的数组
	private static autoReconnect;
	private _configurationDone = new Subject();
	//自身单例
	private static instance: LuaDebugSession ;
	public static userConnectionFlag;      //这个标记位的作用是标记Adapter停止连接，因为Adapter是Server端，要等Client发来请求才能断开
	public static isListening;
	public static _server;

	public static getInstance():LuaDebugSession{
		return LuaDebugSession.instance;
	}

	//luaDebugRuntime实例
	private _runtime: luaDebugRuntime;
	private UseLoadstring : boolean = false ;
	private static currentframeId : number = 0;

	public getRuntime(){
		return this._runtime;
	}

	public constructor() {
		super("lua-debug.txt");
		//设置自身实例
		LuaDebugSession.instance = this;
		this.setDebuggerLinesStartAt1(true);
		this.setDebuggerColumnsStartAt1(true);
		//设置runtime实例
		this._runtime = new luaDebugRuntime();
		dataProcesser._runtime = this._runtime;
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

		this._runtime.on('output', (text, filePath, line, column) => {
			const e: DebugProtocol.OutputEvent = new OutputEvent(`${text}\n`);
			e.body.source = this.createSource(filePath);
			e.body.line = this.convertDebuggerLineToClient(line);
			e.body.column = this.convertDebuggerColumnToClient(column);
			this.sendEvent(e);
		});
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
		response.body.supportsSetVariable = false;//修改变量的值
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
		logger.setup(args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop, false);
		// 等待configurationDoneRequest的通知
		await this._configurationDone.wait(1000);
		//1. 配置初始化信息
		let os = require("os");
		let path = require("path");
		//去除out, Debugger/debugger_lib/plugins/Darwin/   libpdebug_版本号.so
		let  clibPath = path.dirname(__dirname) + '/Debugger/debugger_lib/plugins/'
		let sendArgs =new Array();
		sendArgs["stopOnEntry"] = !!args.stopOnEntry;
		sendArgs["luaFileExtension"] = args.luaFileExtension;
		sendArgs["cwd"] = args.cwd;
		sendArgs["TempFilePath"] = args.TempFilePath;
		sendArgs["logLevel"] = args.logLevel;
		sendArgs["debugMode"] = args.DebugMode;
		sendArgs["pathCaseSensitivity"] = args.pathCaseSensitivity;
		sendArgs["OSType"] = os.type();
		sendArgs["clibPath"] = clibPath;
		sendArgs["useHighSpeedModule"] = args.useHighSpeedModule;

		LuaDebugSession.autoReconnect = args.autoReconnect;
		//2. 初始化内存分析状态栏
		StatusBarManager.reset();
		//3. 把response装入回调
		let callbackArgs =new Array();
		callbackArgs.push(this);
		callbackArgs.push(response);
		//4. 启动Adapter的socket   |   VSCode = Server ; Debugger = Client
		LuaDebugSession._server = Net.createServer(socket=>{
			//--connect--
			DebugLogger.AdapterInfo("Debugger  " + socket.remoteAddress + ":" + socket.remotePort + "  connect!" );
			dataProcesser._socket = socket;
			//向debugger发送含配置项的初始化协议
			this._runtime.start((arr, info) => {
				DebugLogger.AdapterInfo("已建立连接，发送初始化协议和断点信息!");
				//设置标记位
				if (info.UseLoadstring == "1"){
					this.UseLoadstring = true;
				}else{
					this.UseLoadstring = false;
				}
				if (info.UseHookLib == "1"){}
				//已建立连接，并完成初始化
				let ins = arr[0];
				ins.sendResponse(arr[1]);
				LuaDebugSession.userConnectionFlag = true;
				LuaDebugSession.isListening = false;
				//发送断点信息
				for (var bkMap of LuaDebugSession.breakpointsArray) {
					this._runtime.setBreakPoint(bkMap.bkPath, bkMap.bksArray, null,null);
				}
			}, callbackArgs ,sendArgs);
			//--connect end--
			socket.on('end',()=>{
				DebugLogger.AdapterInfo('socket end');
			});

			socket.on('close',()=>{
				if (LuaDebugSession.isListening == true){
					DebugLogger.AdapterInfo('close socket when listening!');
					return;
				}
				DebugLogger.AdapterInfo('Socket close!');
				vscode.window.showInformationMessage('Stop connecting!');
				//停止连接
				LuaDebugSession._server.close();
				LuaDebugSession.userConnectionFlag = false;
				delete dataProcesser._socket;
				//停止VSCode的调试模式
				this.sendEvent(new TerminatedEvent(LuaDebugSession.autoReconnect));
			});

			socket.on('data',(data)=>{
				DebugLogger.AdapterInfo('[Get Msg]:' + data);
				dataProcesser.processMsg(data.toString());
			});
		}).listen(LuaDebugSession.TCPPort, function(){
			DebugLogger.AdapterInfo("listen");
		});
		LuaDebugSession.isListening = true;
		LuaDebugSession.breakpointsArray  = new Array();
		this.sendEvent(new InitializedEvent()); //收到返回后，执行setbreakpoint
	}

	/**
	 * VSCode -> Adapter 设置(删除)断点
	 */
	protected setBreakPointsRequest(response: DebugProtocol.SetBreakpointsResponse, args: DebugProtocol.SetBreakpointsArguments): void {
		DebugLogger.AdapterInfo('setBreakPointsRequest');
		const path = <string>args.source.path;
		const clientLines = args.lines || [];//clientLines中包含了本文件所有的断点行号
		let vscodeBreakpoints = new Array(); //VScode UI识别的断点（起始行号1）

		clientLines.map(l => {
			const id = this._runtime.getBreakPointId()
			const bp = <DebugProtocol.Breakpoint> new Breakpoint(true, l);
			bp.id= id;
			vscodeBreakpoints.push(bp);
		});
			response.body = {
				breakpoints: vscodeBreakpoints
			};

			if (dataProcesser._socket && LuaDebugSession.userConnectionFlag){
				//已建立连接
				let callbackArgs =new Array();
				callbackArgs.push(this);
				callbackArgs.push(response);
				this._runtime.setBreakPoint(path, vscodeBreakpoints, function(arr) {
					DebugLogger.AdapterInfo("确认断点");
					let ins = arr[0];
					ins.sendResponse(arr[1]);//在收到debugger的返回后，通知VSCode, VSCode界面的断点会变成已验证
				}, callbackArgs);
			}else{
				//未连接，记录断点
				if (LuaDebugSession.breakpointsArray != undefined){
					for (var bkMap of LuaDebugSession.breakpointsArray) {
						if (bkMap.bkPath == path){
							bkMap["bksArray"] = vscodeBreakpoints;
							this.sendResponse(response);
							return;
						}
					}

					let bk = new Object();
					bk["bkPath"] =path;
					bk["bksArray"] = vscodeBreakpoints;
					LuaDebugSession.breakpointsArray.push(bk);
				}
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
			stackFrames: stk.frames.map(f => new StackFrame(f.index, f.name, this.createSource(f.file), f.line)),
			totalFrames: stk.count
		};
		this.sendResponse(response);
	}

	/**
	 * 监控的变量
	 */
	protected evaluateRequest(response: DebugProtocol.EvaluateResponse, args: DebugProtocol.EvaluateArguments): void {
		//watch -- 监视窗口
		if (args.context == "watch" || args.context == "hover"){
			let callbackArgs =new Array();
			callbackArgs.push(this);
			callbackArgs.push(response);
			//把B["A"] ['A'] => B.A形式
			if(this.UseLoadstring == false){
				let watchString = args.expression;
				watchString = watchString.replace(/\[/g,".");
				watchString = watchString.replace(/\"/g,"");
				watchString = watchString.replace(/\'/g,"");
				watchString = watchString.replace(/]/g,"");
				args.expression = watchString;
			}

			this._runtime.getWatchedVariable((arr, info) => {
				if(info.length == 0){
					//没有查到
					arr[1].body = {
						result: 'nil',
						variablesReference: 0
					};
				}else{
					arr[1].body = {
						result: info[0].value,
						type: info[0].type,
						variablesReference: parseInt(info[0].variablesReference)
					};
				}
				let ins = arr[0];				//第一个参数是实例
				ins.sendResponse(arr[1]);//第二个参数是response
			}, callbackArgs,  args.expression, args.frameId);

		}else if(args.context == "repl"){
			//repl -- 调试控制台
			let callbackArgs =new Array();
			callbackArgs.push(this);
			callbackArgs.push(response);
			this._runtime.getREPLExpression((arr, info) => {
				if(info.length == 0){
					//没有查到
					arr[1].body = {
						result: 'nil',
						variablesReference: 0
					};
				}else{
					arr[1].body = {
						result: info[0].value,
						type: info[0].type,
						variablesReference: parseInt(info[0].variablesReference)
					};
				}
				let ins = arr[0];
				ins.sendResponse(arr[1]);
			}, callbackArgs,  args.expression, args.frameId);
		}else{
			this.sendResponse(response);
		}
	}

	/**
	 * 在变量大栏目中列举出的种类
	 */
	protected scopesRequest(response: DebugProtocol.ScopesResponse, args: DebugProtocol.ScopesArguments): void {
		LuaDebugSession.currentframeId = args.frameId; //frameId指示调用栈深度，从2开始
		const scopes = new Array<Scope>();
		//设置局部变量的reference是1w,  全局2w, upValue 3w
		scopes.push(new Scope("Local", 10000, false));
		scopes.push(new Scope("Global", 20000, true));
		scopes.push(new Scope("UpValue", 30000, false));
		response.body = {
			scopes: scopes
		};
		this.sendResponse(response);
	}

	/**
	 * 变量信息   断点的信息应该完全用一条协议单独发，因为点开Object，切换堆栈都需要单独请求断点信息
	 */
	protected variablesRequest(response: DebugProtocol.VariablesResponse, args: DebugProtocol.VariablesArguments): void {
		let callbackArgs =new Array();
		callbackArgs.push(this);
		callbackArgs.push(response);

		this._runtime.getVariable((arr, info) => {
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
		}, callbackArgs,  args.variablesReference, LuaDebugSession.currentframeId);
	}

	/**
	 * continue 执行
	 */
	protected continueRequest(response: DebugProtocol.ContinueResponse, args: DebugProtocol.ContinueArguments): void {
		let callbackArgs =new Array();
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
		let callbackArgs =new Array();
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
	protected stepInRequest(response: DebugProtocol.StepInResponse, args: DebugProtocol.StepInArguments): void{
		let callbackArgs =new Array();
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
	protected stepOutRequest(response: DebugProtocol.StepOutResponse, args: DebugProtocol.StepOutArguments): void{
		let callbackArgs =new Array();
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
	protected pauseRequest(response: DebugProtocol.PauseResponse, args: DebugProtocol.PauseArguments): void{
		vscode.window.showInformationMessage('pauseRequest!');
	}

	/**
	 * disconnect
	 */
	protected disconnectRequest(response: DebugProtocol.DisconnectResponse, args): void{
		DebugLogger.AdapterInfo("disconnectRequest");
		let restart = args.restart;
		//给lua发消息，让lua停止运行
		let callbackArgs =new Array();
		callbackArgs.push(restart);
		this._runtime.stopRun(arr => {
			//客户端主动断开连接，这里仅做确认
			DebugLogger.AdapterInfo("确认stop");
		}, callbackArgs, 'stopRun');
		LuaDebugSession.userConnectionFlag = false;
		this.sendResponse(response);
		LuaDebugSession._server.close();
	}

    protected restartRequest(response: DebugProtocol.RestartResponse, args: DebugProtocol.RestartArguments): void{
		DebugLogger.AdapterInfo("restartRequest");
	}

	protected restartFrameRequest(response: DebugProtocol.RestartFrameResponse, args: DebugProtocol.RestartFrameArguments): void{
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

	public LuaGarbageCollect(){
		this._runtime.luaGarbageCollect();
	}
}
