// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

import { Logger } from './codeLogManager';
import URI from 'vscode-uri';
let path = require('path');
let dir = require('path-reader');
let os = require('os');
let urlencode = require('urlencode');

import {
	Location,
	Position,
	SymbolKind,
	Range,
	Connection,
	DocumentSymbol
} from 'vscode-languageserver';
import * as fs from "fs";
// import { isArray } from 'util';
//-----------------------------------------------------------------------------
//-- 暂存的数据
//-----------------------------------------------------------------------------

let initParameter; //初始化参数
export function getInitPara(){
	return initParameter;
}
export function setInitPara(para){
	initParameter = para;
}

let loadedExt;	// 已经过处理的文件后缀
export function initLoadedExt(){
	loadedExt = new Object();
}

export function getLoadedExt(){
	return loadedExt;
}

export function setLoadedExt(key){
	loadedExt[key] = true;
}

let connection: Connection; //保存一份connection
export function setToolsConnection(conn: Connection) {
	connection = conn;
}

let rootFiles;
let fileName_Uri_Cache;

//-----------------------------------------------------------------------------
//-- 枚举
//-----------------------------------------------------------------------------
//搜索类型
export enum SearchMode{
	ContinuousMatching,
	ExactlyEqual,		//精确查找
	FuzzyMatching,	  //模糊查找
	FirstLetterContinuousMatching,	//前序匹配查找
}

//搜索范围
export enum SearchRange{
	AllSymbols,	//全体符号
	GlobalSymbols,
	LocalSymbols
}

// 记录tag的原因
export enum TagReason{
	UserTag,
	Equal,
	MetaTable
}

//-----------------------------------------------------------------------------
//-- 常用结构体
//-----------------------------------------------------------------------------

// 生成的符号信息
export interface SymbolInformation {
	name: string;                   			//展示名   local a.b.c  |   function mt:fcun(para1)
	searchName: string;						//搜索名   a.b.c	 |   mt:func (searchName在保存的时候，：全都用 . )
	originalName: string     				 //符号原本名   c  |  func
	kind: SymbolKind;						 //类型
	location: Location;						  //位置
	isLocal: boolean;             			  // local / global
	containerURI: string;           // 所属的URI (file://)
	containerPath: string;          // 所属的文件路径
	containerName?: string;   			  // 所属的函数名（展示用）
	containerList?: Array<chunkClass>;		 // 容器列表array
	funcParamArray?: Array<string>;   // 函数参数数组，生成注释用
	tagType?: string; 						 // 用户标记此符号的类型，用于处理 local a = require("xxx") 等接收返回值的形式
	requireFile?:string;					   // 符号是require文件的返回
	funcRets?;						  // 如果此符号是function的返回值，记录对应的function . 值是{ name; local }结构
	tagReason?: TagReason;				// 标记原因，有标记必须写原因
	chunk?:chunkClass;					   // 如果此符号是一个function, 对应的chunk结构
}

// 搜索符号返回结构
// 这个结构类似一个联合体，其中可能有搜索到的符号retSymbol， 也可以记录baseinfo信息。使用isFindout来指示是否搜索到符号
export class searchRet {
	isFindout: boolean;							 //是否找到
	container?: string[];						   //深度层级列表
	retSymbol?: searchSymbolRet;		  //符号自身的信息
	baseinfo?: baseInfo;						//基础层级的信息
	constructor(){
		this.isFindout = false;
	}
}

// 搜索结果（searchRet的子结构）
export interface searchSymbolRet {
	name: string;                    			//展示名
	isLocal: boolean;              			  //是否local符号. 下面三个属性是找到才需要的
	location?: Location;
	containerURI: string | null;           	//所属的文件名
}

// base 基类(table)信息 （searchRet的子结构）
export interface baseInfo {
	name: string;                    			//展示名
	isLocal: boolean;              			  //是否local符号. 下面三个属性是找到才需要的
	identiferStr?:string;
}

// 注释的类型信息
export interface commentTypeInfo {
	reason: TagReason;							//注释的原因
	newType: string;                    		   //新类型
	oldType?: string;								//旧类型 setmetatable(旧，新)
	location?: Location;
	name?:string;									//被注释的变量名
}

// 注释的类型信息
export interface functionRetInfo {
	functionName:string;						// 如果是函数返回信息，要填充这个参数
	loc: Location;
}

// 引用文件的信息, require保存文件名是为了实现点击文件名跳转
export interface requireFileInfo{
	reqName:string;
	loc:Location;
}

//chunks 结构体
export class chunkClass {
	chunkName:string;
	loc:Location;
	returnSymbol;		//返回的变量值
	constructor(name,  loc){
		this.chunkName = name;
		this.loc = loc;
	}
}

// 一个lua文件中包含的所有信息
export class docInformation {
	// lua文本基础内容
	docAST; //文本解析出的AST树
	docUri:string; //文件URL
	docPath :string; //文件路径
	// 符号表
	defineSymbols;	//定义符号表
	// 文件的引用和被引用情况
	requires:requireFileInfo[]; //本文件引用的文件列表(require 是有序的，类型是array) 
	references: string[]; // require本文件的其他文件的uri(array)

	constructor(docAST , docUri , docPath){
		this.docAST = docAST;
		this.docUri = docUri;
		this.docPath = docPath;
		this.defineSymbols = new Object();
		this.defineSymbols["allSymbols"] = new Array<SymbolInformation>();
		this.defineSymbols["allSymbolsArray"] = new Array<SymbolInformation>();
		this.defineSymbols["globalSymbols"] = new Array<SymbolInformation>();
		this.defineSymbols["globalSymbolsArray"] = new Array<SymbolInformation>();
		this.defineSymbols["localSymbols"] = new Array<SymbolInformation>();
		this.defineSymbols["localSymbolsArray"] = new Array<SymbolInformation>();
		this.defineSymbols["chunks"] = new Array<SymbolInformation>(); 		//记录每个chunk中的名字，位置，global/local，(文件/函数)返回信息
		this.defineSymbols["chunksArray"] = new Array<SymbolInformation>(); 		//记录每个chunk中的名字，位置，global/local，返回信息
		this.requires = new Array<requireFileInfo>();
		this.references = new Array<string>();
	}
}

//-----------------------------------------------------------------------------
//-- 工具方法
//-----------------------------------------------------------------------------

// uri 中html编码转换为原字符
export function urlDecode(url):string{
	return urlencode.decode(url);
}

// 从URI分析出文件名和后缀
export function getPathNameAndExt(UriOrPath): Object{
	let name_and_ext = path.basename(UriOrPath).split('.');
	let name = name_and_ext[0];								  //文件名
	let ext = name_and_ext[1];											  //文件后缀
	for (let index = 2; index < name_and_ext.length; index++) {
		ext = ext + '.' + name_and_ext[index];
	}
	return { name, ext };
}

export function get_FileName_Uri_Cache(){
	return fileName_Uri_Cache;
}

// 向cache中添加内容
export function AddTo_FileName_Uri_Cache(name , uri){
	fileName_Uri_Cache[name] = urlDecode(uri);
}

// 刷新Cache
export function refresh_FileName_Uri_Cache(){
	//Cache 中没有找到，遍历RootPath
	// Logger.InfoLog("start refresh_FileName_Uri_Cache: ");
	rootFiles = new Array<string>();
	fileName_Uri_Cache = new Array();
	let processFilNum = 0;
	let LuaPandaPath = '';
	if(initParameter && initParameter.rootPath){
		//rootFiles为空，构建rootFilesMap，这个步骤应该放在init时，或者打开首个文件时
		//构建操作，只执行一次
		if(rootFiles.length < 1){
			rootFiles = dir.files(initParameter.rootPath, {sync:true});
			let totalFileNum = rootFiles.length;
			for(let idx = 0, len = rootFiles.length; idx < len ; idx++){
				let currentFileIdx = idx + 1;
				let name_and_ext = getPathNameAndExt(rootFiles[idx]);
				let trname = name_and_ext['name'];
				let ext = name_and_ext['ext'];
				let validExt = getLoadedExt();										 //可用的文件后缀
				if(validExt[ext]){
					let trUri = pathToUri(rootFiles[idx]);							 //uri
					fileName_Uri_Cache[trname] = urlDecode(trUri);
					// 文件信息
					Logger.DebugLog(trUri);
					processFilNum = processFilNum + 1;
					// 显示进度
					let rate = Math.floor(currentFileIdx / totalFileNum * 100);
					showProgressMessage(rate, trUri);
					if(trname === "LuaPanda"){
						LuaPandaPath = rootFiles[idx];
					}
				}
			}
		}
	}
	Logger.InfoLog("文件Cache刷新完毕，共计"+ rootFiles.length +"个文件， 其中" + processFilNum + "个lua类型文件");
	if(LuaPandaPath){
		connection.sendNotification("setLuaPandaPath", LuaPandaPath);
	}
	showProgressMessage(100, "done!");
}

// 把文件名转换为 uri
// @fileName 文件名
// @return uri string
export function transFileNameToUri(requireName : string): string{
	if(requireName == null){
		return '';	
	}
	//从路径中提取文件名
	let parseName = path.parse(requireName);
	//从fileMap中查找文件全路径
	let cacheUri = fileName_Uri_Cache[parseName.name];
	if(cacheUri){
		return cacheUri;
	}
	return '';
}

//把win下盘符转换成大写
export function transWinDiskToUpper(uri: string):string{
	if (os.type() == "Windows_NT") {
		let reg = /^file:\/\/\/(\w)/;
		uri = uri.replace(reg,function(m){
			let diskSymbol = m.charAt(8);
			diskSymbol = 'file:///' + diskSymbol.toUpperCase()
		  	return diskSymbol});
		return uri;
	}
}

// path -> uri string
export function pathToUri(pathStr : string): string{
	let retUri;
	if (os.type() == "Windows_NT") {
		let pathArr = pathStr.split( path.sep );
		let stdPath = pathArr.join('/');
		retUri = 'file:///' + stdPath;
	}
	else{
		//Darwin
		retUri = 'file://' + pathStr;
	}

	return retUri;
}

// uri string -> path
export function uriToPath(uri: string): string {
	return URI.parse(uri).fsPath;
}

// 返回整个目录下的文件列表
// @path 文件夹路径
// @return string[] | 返回的文件列表
export function getDirFiles(path : string){
	if(path){
		return dir.files(path, {sync:true});
	}
}

// 读文本文件内容
// @path 文件路径
// @return 文件内容
export function getFileContent(path: string): string {
	if(path == '' || path == undefined){
		return '';
	}
	let data = fs.readFileSync(path);
	let dataStr = data.toString();
	return dataStr;
}

// 把position中起始行号转换为1 (用户选择- > vacode)
export function transPosStartLineTo1(position){
	position.line = position.line + 1;
}

export function transPosStartLineTo0(position){
	position.line = position.line - 1;
}


// 从给定文本中，读出pos位置处的信息
// @luaText 文本
// @pos 位置信息
// @return 指定位置的lua字符串
export function getTextByPosition(luaText : string, pos : Position): string{
	if(luaText == null){
		return '';
	}
	// 拆分luaText
	let stringArr = luaText.split(/\r\n|\r|\n/);
	let startStr = stringArr[pos.line].substring(0, pos.character);
	//使用正则搜索最后一个出现的 符号或者空格 TODO 待完善
	// let reg= /[~!#%&\*\(\)\|,<>\?"';\+\-\=\[\]\{\}]/g;
	let reg= /[~!#%&\*\(\)\|,<>\?"';\+\=\[\]\{\}]/g; // 保留"-"，用于触发文档注释
	let blankStr = startStr.replace(reg, ' ');
	let finalArr = blankStr.split(' ');
	let retStr = finalArr.pop();
	return retStr;
}

/**
 * isNextLineHasFunction 使用正则判断下一行是否有function关键字，如果有返回true
 * @param luaText 文件内容
 * @param position 位置
 */
export function isNextLineHasFunction(luaText: string, position: Position): boolean {
	let luaTextArray = luaText.split(/\r\n|\r|\n/);

	// 溢出
	if (luaTextArray.length <= position.line + 1) {
		return false;
	}

	let nextLineText = luaTextArray[position.line + 1];
	let regExp = /\bfunction\b/;
	if (regExp.exec(nextLineText)) {
		return true;
	}
	return false;
}

export function createEmptyLocation(uri) {
	let pos =  Position.create(0,0);
	let rg =  Range.create(pos, pos)
	let retLoc = Location.create(uri, rg);
	return retLoc;
}

// 根据uri判断文件是否在预设的忽略列表里
// @param ignoreRegExp 要忽略的文件夹的正则表达式数组
export function isMatchedIgnoreRegExp(uri: string, ignoreRegExp: string[]): boolean {
	for (let i = 0; i < ignoreRegExp.length; i++) {
		if (ignoreRegExp[i] === "") {
			continue;
		}
		let regExp = new RegExp(ignoreRegExp[i]);
		if (regExp.exec(uri)) {
			return true;
		}
	}
	return false;

}

export function getNSpace(n: number) {
	let str = "";
	for (let i = 0; i < n; i++) {
		str += " ";
	}
	return str;
}

export function showProgressMessage(progress: number, message: string) {
	connection.sendNotification("showProgress", progress + "% " + message);
	if (progress == 100) {
		connection.sendNotification("showProgress", "LuaPanda 👍");
	}
}

// 新加入的方法，把dic转换为array
export function  changeDicSymboltoArray(dic){
	let array  = new Array();
	for (const key in dic) {
			const element = dic[key];
			if(Array.isArray(element)){
				for (const k in element) {
					const ele = element[k];
					array.push(ele);
				}
			}else{
				array.push(element);
			}
	}
	return array;
}

// 将原有的containerList和searchName用点和冒号切割，拼成新的containerList，用来处理层级
function getVerboseSymbolContainer(verboseSymbolInfo: SymbolInformation): chunkClass[] {
	let searchName = verboseSymbolInfo.searchName;
	let searchNameArray = Array<string>();
	if (searchName != "...") {
		searchName = searchName.replace(/\[/g, '.');
		searchName = searchName.replace(/]/g, '');
		searchNameArray = splitToArrayByDot(searchName);
	}
	let searchNameContainer: chunkClass[] = Array<chunkClass>();
	for (let i = 0; i < searchNameArray.length - 1; i++) {
		searchNameContainer.push(new chunkClass(searchNameArray[i], undefined));
	}

	let containerList: chunkClass[] = Array<chunkClass>();
	containerList.push(verboseSymbolInfo.containerList[0]);
	for (let i = 1; i < verboseSymbolInfo.containerList.length; i++) {
		let chunkNameArray = splitToArrayByDot(verboseSymbolInfo.containerList[i].chunkName);
		if (chunkNameArray.length > 1) {
			for (let j = 0; j < chunkNameArray.length; j++) {
				containerList.push(new chunkClass(chunkNameArray[j], undefined));
			}
		} else {
			containerList.push(verboseSymbolInfo.containerList[i]);
		}
	}

	let verboseSymbolContainer = containerList.concat(searchNameContainer);
	return verboseSymbolContainer;
}

function handleDocumentSymbolChildren(symbolContainer: chunkClass[], documentSymbol: DocumentSymbol, outlineSymbolArray: DocumentSymbol[], chunkMap: Map<string, number>) {
	let index = chunkMap.get(symbolContainer[1].chunkName);
	let parent: DocumentSymbol = outlineSymbolArray[index];
	for (let i = 2; i < symbolContainer.length; i++) {
		for (let j = 0; j < parent.children.length; j++) {
			if (symbolContainer[i].chunkName == parent.children[j]["originalName"]) {
				parent = parent.children[j];
				break;
			}
		}
	}
	if(!parent.children){
		parent.children = new Array<DocumentSymbol>();
	}

	parent.children.push(documentSymbol);
}

/**
 * 列出本文件中的符号，用于在outline窗口中分层显示符号列表
 * @param symbolInfoArray CodeSymbol.getCertainDocSymbolsArray返回的符号信息数组
 * @return 本文件所有符号列表，DocumentSymbol数组，带有层次结构
 */
export function getOutlineSymbol(symbolInfoArray: SymbolInformation[]): DocumentSymbol[] {
	let outlineSymbolArray = Array<DocumentSymbol>();

	// 存储最外层SymbolInformation.name - outlineSymbolArray索引 的map
	let chunkMap = new Map();

	for (let i = 0; i < symbolInfoArray.length; i++) {
		let symbolInfo: SymbolInformation = symbolInfoArray[i];
		let documentSymbol: DocumentSymbol = {
			name: symbolInfo.originalName,
			kind: symbolInfo.kind,
			range: symbolInfo.location.range,
			selectionRange: symbolInfo.location.range,
			children: Array<DocumentSymbol>()
		};
		documentSymbol["originalName"] = symbolInfo.originalName;
		// 变量展示originalName，函数展示name
		if (symbolInfo.kind == SymbolKind.Function) {
			documentSymbol.name = symbolInfo.name;
		}

		let verboseSymbolContainer = getVerboseSymbolContainer(symbolInfoArray[i]);

		if (verboseSymbolContainer.length > 1) {
			handleDocumentSymbolChildren(verboseSymbolContainer, documentSymbol, outlineSymbolArray, chunkMap);
			continue;
		}

		outlineSymbolArray.push(documentSymbol);

		chunkMap.set(symbolInfo.searchName, outlineSymbolArray.length - 1);
	}

	return outlineSymbolArray;
}

// 使用: . 分割符号，并返回数组
export function splitToArrayByDot(input) {
	let userInputTxt_DotToBlank = input.replace(/[\.:]/g, ' ');		//把.和:转为空格
	let L = userInputTxt_DotToBlank.split(' ');
	return L;
}
