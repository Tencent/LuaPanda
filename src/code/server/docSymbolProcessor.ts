// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

/* 本文件的作用是遍历一个文件url对应的AST树，并在遍历过程中记录一些信息
	通常在三种情况下会遍历AST。
	1 由AST构建定义符号表 
	2 已经有一个符号位置，由AST中查找其对应的符号
	3 给定一个符号信息，由这个信息查询所有引用这个符号的位置

	本文件还提供在构建的定义表只能中搜索符号的能力searchMatchSymbal，支持各种搜索方式

	本文件的公有方法分为几部分：
	+ 静态创建方法
	+ 获取本url及对应AST信息
	+ 功能实现接口
	+ 符号查找（多种方式）

	私有方法
	+ 工具方法
	+ AST分析后的尾处理
	+ 遍历AST
	+ 时序处理：分析不完整的AST
*/

import * as luaparse from 'luaparse';
import * as Tools from './codeTools';
import { Logger } from './codeLogManager';
import { CodeSymbol } from './codeSymbol';
import { Location, Range, Position, SymbolKind } from 'vscode-languageserver';
import { trieTree } from './trieTree';
import { isArray } from 'util';
// import { isArray } from 'util';

// 遍历AST模式
enum travelMode {
	BUILD = 0, //构建定义符号
	GET_DEFINE = 1, //查找定义符号
	FIND_REFS = 2 //查找引用符号
}

export class DocSymbolProcessor {

	public docInfo: Tools.docInformation; // 记录.lua文本中的所有信息
	// 下面是临时记录信息的变量
	// refs 引用相关
	private searchInfo;	//记录被查找的符号信息
	private refsLink; //引用符号队列
	// 按位置查找符号
	private searchPosition: Position;						     // 记录搜索符号所在的Position
	private posSearchRet: Tools.searchRet;						 // 记录按配置查找的结果
	//解析相关
	private static tempSaveInstance; 								// 临时记录实例
	//build 相关
	private docCommentType;	//注释(等号)类型表 | 符号标记类型 记录标记的类型信息。标记来源于 1.用户注释 2.元表 3. 等号
	private funcReturnRecoder; // 用来记录每个函数符号的返回值，并放入符号列表的 chunk 结构中
	private callFunctionRecoder; //用来记录函数调用

	// 静态创建方法，创建文件的 定义符号列表（定义符号tools.docInformation 数组）
	public static create(luaText: string, uri: string) {
		let instance: DocSymbolProcessor = new DocSymbolProcessor();
		let path = Tools.uriToPath(uri);
		try {
			let AST = luaparse.parse(luaText, { locations: true, scope: true, comments: true});
			instance.docInfo = new  Tools.docInformation(AST, uri, path);
			instance.buildDocDefineSymbols();
			instance.docInfo.parseSucc = true;
			return instance;
		} catch (error) {
			// Logger.ErrorLog("[Error] 解析文件 " + uri + " AST的过程中出错:");
			// Logger.ErrorLog("[error stack]:" + error.stack );

			//建立空文件（没有AST）
			instance.docInfo = new  Tools.docInformation(new Object, uri, path);
			DocSymbolProcessor.tempSaveInstance = instance;
			//解析
			try {
				luaparse.parse(luaText, { locations: true, scope: true, onCreateNode: instance.onCreateNode});
			}catch{}
			instance.docInfo.parseSucc = false;
			return instance;
		}
	}

//-----------------------------------------------------------------------------
//-- get/set 获取本文件的基础信息
//-----------------------------------------------------------------------------

	// 获取本文件uri
	public getUri() {
		return this.docInfo.docUri;
	}

	// 获取本文件 [所有符号列表] (kv)
	public getAllSymbolsDic() {
		return this.docInfo.defineSymbols.allSymbols;
	}

	// 获取本文件 [所有符号列表] (Trie)
	public getAllSymbolsTrie() {
		return this.docInfo.defineSymbols.allSymbolsTrie;
	}

	// 获取本文件 [全局符号列表] (kv)
	public getGlobalSymbolsDic() {
		return this.docInfo.defineSymbols.globalSymbols;
	}

	// 获取本文件 [局部符号列表] (kv)
	public getLocalSymbolsDic() {
		return this.docInfo.defineSymbols.localSymbols;
	}

	// 获取本文件 [chunk信息列表] (kv)
	public getChunksDic(){
		return this.docInfo.defineSymbols.chunks;
	}
	
	// 因为符号kv dic中存在冲突，所以新增了返回array接口
	public getAllSymbolsArray() {
		return this.docInfo.defineSymbols.allSymbolsArray;
	}
	
	// 获取本文件 [全局符号列表] (array)
	public getGlobalSymbolsArray() {
		return this.docInfo.defineSymbols.globalSymbolsArray;
	}

	// 获取本文件 [Global符号列表] (Trie)
	public getGlobalSymbolsTrie() {
		return this.docInfo.defineSymbols.globalSymbolsTrie;
	}

	// 获取本文件 [局部符号列表] (array)
	public getLocalSymbolsArray() {
		return this.docInfo.defineSymbols.localSymbolsArray;
	}

	// 获取本文件 [局部符号列表] (Trie)
	public getLocalSymbolsTrie() {
		return this.docInfo.defineSymbols.localSymbolsTrie;
	}

	// 获取本文件 [chunk信息列表] (array)
	public getChunksArray(){
		return this.docInfo.defineSymbols.chunksArray;
	}

	// 获取本文件 [返回值列表] (array)
	public getFileReturnArray(){
		let chunks = this.docInfo.defineSymbols.chunks;
		return chunks[this.docInfo.docPath].returnSymbol;
	}

	// 获取本文件 [require列表] (array)
	public getRequiresArray(){
		return this.docInfo.requires;
	}

	// 获取本文件的[被引用信息] (array)
	public getReferencesArray() {
		return this.docInfo.references;
	}
	// 设置本文件的被引用信息
	public setReferences(references: string[]) {
		return this.docInfo.references = references;
	}

	//构建字典树(用于前缀搜索)
	private buildSymbolTrie(){
		let all = this.getAllSymbolsArray();
		this.docInfo.defineSymbols.allSymbolsTrie = trieTree.createSymbolTree(all);
		let global = this.getGlobalSymbolsArray();
		this.docInfo.defineSymbols.globalSymbolsTrie = trieTree.createSymbolTree(global);
		let local = this.getLocalSymbolsArray();
		this.docInfo.defineSymbols.localSymbolsTrie = trieTree.createSymbolTree(local);
	}


//-----------------------------------------------------------------------------
//-- 主要对外接口
//-----------------------------------------------------------------------------
	// 构建文件的 [定义符号表]
	public buildDocDefineSymbols() {
		let deepLayer: Array<Tools.chunkClass> = new Array<Tools.chunkClass>();
		this.docCommentType = new Array();
		this.callFunctionRecoder = new Array();
		// 由AST建立符号表
		this.traversalAST(this.docInfo["docAST"], travelMode.BUILD, deepLayer);
		// 符号表后处理，记录comment和文件/函数返回值
		this.buildSymbolTag();
		this.buildSymbolReturns(); // 构建 B = require("A") , 记录B的类型
		this.buildSymbolTrie();	//构建字典树
		// Debug info 查看序列化的AST
		// let tempStr = JSON.stringify(this.docInfo["docAST"]);
		// DebugInfo
		// console.log(tempStr)
	}

	// 根据 VSCode 传来的 Position 信息从文件 AST 中查找对应符号
	// 这里可以考虑从AST中或者从luaText中查找。使用AST的优点是可以查询到更多的信息，包括isLocal，container。使用 text查找比较快，但只有文本信息。
	// 使用luaText查找的好处是可以搜索未完成的代码
	// 目前 定义查找使用 AST， 代码补全使用 luaText
	public searchDocSymbolfromPosition(pos) {
		this.searchPosition = pos;
		let container =  new Array<Tools.chunkClass>();
		this.posSearchRet = new Tools.searchRet();
		this.traversalAST(this.docInfo["docAST"], travelMode.GET_DEFINE, container);
		return { sybinfo: this.posSearchRet.retSymbol, container: container };
	}

	// 查找一个符号的引用
	public searchDocSymbolReference(info) {
		//先清空数组
		this.searchInfo = info;
		this.refsLink = new Array();										// 引用符号队列
		this.traversalAST(this.docInfo["docAST"], travelMode.FIND_REFS, new Array());
		return this.refsLink;
	}

	// 按 position 搜索符号是否是文件名(用于点击require文件名跳转)
	public searchDocRequireFileNameFromPosition(pos):string  {
		let reqFiles = this.getRequiresArray();
		for (let index = 0; index < reqFiles.length; index++) {
			const element = reqFiles[index];
			let res = this.isInASTLoc(element.loc, pos);
			if(res){
				return  element.reqName;
			}
		}
	}

    // 在当前 文件的定义符号表中查找符号(提供多种查找方式，查找范围)
	// @symbalName 符号名
	// @matchMode 搜索方式
	// @searchRange    0:all 1 global 2 display
	public searchMatchSymbal(symbalName: string, matchMode: Tools.SearchMode, searchRange?: Tools.SearchRange ): Tools.SymbolInformation[] {
		searchRange = searchRange || Tools.SearchRange.AllSymbols ;
		let retSymbols = [];
		let SymbolArrayForSearch;
		// let reg = /[A-Z]/;
		//精确查找。直接使用字典匹配
		if (matchMode ===  Tools.SearchMode.ExactlyEqual) {
			if( searchRange == Tools.SearchRange.AllSymbols ){
				SymbolArrayForSearch = this.getAllSymbolsDic();
			}else if( searchRange == Tools.SearchRange.GlobalSymbols){
				SymbolArrayForSearch = this.getGlobalSymbolsDic() ;
			}else if( searchRange == Tools.SearchRange.LocalSymbols){
				SymbolArrayForSearch = this.getLocalSymbolsDic();
			}
			
			//精确匹配 searchName。保证SymbolArrayForSearch其中的key中只有.而没有:
			let tgtSymbol = SymbolArrayForSearch[symbalName];
			if(tgtSymbol){
				//搜索到了，根据值类型不同（字典中存在冲突，可能是符号或是数组），放入返回符号表
				if(Array.isArray(tgtSymbol)){
					retSymbols = tgtSymbol;
				}else{
					retSymbols.push(tgtSymbol);
				}
			}
		}else if(matchMode === Tools.SearchMode.PrefixMatch){
			// 前缀搜索
			let root;
			if( searchRange == Tools.SearchRange.AllSymbols ){
				root = this.getAllSymbolsTrie();
			}else if( searchRange == Tools.SearchRange.GlobalSymbols){
				root = this.getGlobalSymbolsTrie();
			}else if( searchRange == Tools.SearchRange.LocalSymbols){
				root = this.getLocalSymbolsTrie();
			}
			let trieRes =  trieTree.searchOnTrieTreeWithoutTableChildren(root, symbalName);
			if(isArray(trieRes)){
				retSymbols = trieRes;
			}
		}else if(matchMode === Tools.SearchMode.FuzzyMatching){
			// 模糊搜索，如果用户输入的字符串中有大写字母，则大小写敏感。否则大小写不敏感。目前模糊搜索使用的是便利的方式，效率较低
			if( searchRange == Tools.SearchRange.AllSymbols ){
				SymbolArrayForSearch = this.getAllSymbolsArray();
			}else if( searchRange == Tools.SearchRange.GlobalSymbols){
				SymbolArrayForSearch = this.getGlobalSymbolsArray();
			}else if( searchRange == Tools.SearchRange.LocalSymbols){
				SymbolArrayForSearch = this.getLocalSymbolsArray();
			}

			for (let idx in SymbolArrayForSearch){
				let sym = SymbolArrayForSearch[idx];
				let searchName = sym.name;
				if(searchName){
					let reg = new RegExp(symbalName ,'i');
					let hit = searchName.match(reg);
					if(hit){
						retSymbols.push(sym);
					}
				}
			}
		}
		return retSymbols;
	}

//-----------------------------------------------------------------------------
//-- 以下是遍历AST的私有方法
//-- 工具方法
//-----------------------------------------------------------------------------

	// loc2是否在loc1之中
	private isInLocation(loc1, loc2: Position): boolean {
		if (loc1.range.start.line <= loc2.line && loc1.range.end.line >= loc2.line) {
			if (loc1.range.start.line === loc2.line) {
				let character = loc1.range.start.character || loc1.range.start.column;
				//start > pos
				if (character > loc2.character) return false;
			}

			if (loc1.range.end.line === loc2.line) {
				let character = loc1.range.end.character || loc1.range.end.column;
				if (character < loc2.character) return false;
			}
			return true;
		}
		return false;
	}

	//list2是否是list1的子集
	// private listContainer(list1, list2): boolean {
	// 	if(list2.length > list1.length) return false;
	// 	for(let idx = 0, len = list2.length ; idx < len; idx++){
	// 		if(list1[idx] != list2[idx]){
	// 			return false;
	// 		}
	// 	}
	// 	return true;
	// }

	// 判断 loc2 是否被包含在 loc1 之中
	private isInASTLoc(loc1, loc2: Position): boolean {
		if (loc1["start"].line <= loc2.line && loc1["end"].line >= loc2.line) {
			if (loc1.start.line === loc2.line) {
				let character = loc1.start.character || loc1.start.column;
				//start > pos
				if (character > loc2.character) return false;
			}

			if (loc1.end.line === loc2.line) {
				let character = loc1.end.character || loc1.end.column;
				if (character < loc2.character) return false;
			}
			return true;
		}
		return false;
	}

	// 创建一个符号的信息
	private createSymbolInfo(name: string, searchName:string, originalName:string,
		kind:SymbolKind, location:Location, isLocal:boolean,
		containerName?:string, containerList?:Array<Tools.chunkClass>,  funcParamArray?:Array<string>, tagType? :string, reason?: Tools.TagReason): Tools.SymbolInformation{
			//searchName中的全部:被替换为 . , 目的是提高查找效率
			if(searchName.match(':')){
				searchName = searchName.replace(/:/g,".");
			}

		return{
			name: name,
			searchName: searchName,
			originalName: originalName,
			kind: kind,
			location: location,
			isLocal: isLocal,
			containerURI: this.docInfo["docUri"],
			containerPath: this.docInfo["docPath"],
			containerName: containerName,
			containerList: containerList,
			funcParamArray:funcParamArray,
			// alreadyAddDisplay: false,
			tagType:tagType,
			tagReason:reason
		};
	}
	
	// 检查符号是否已经在符号表中存在
	// @name 符号名
	private checkIsSymbolExist(name) {
		if (this.getAllSymbolsDic()[name] != undefined){
			return true;
		}
		return false;
	}

	//-------查到符号后的填充
	private pushToAllList(symbol:Tools.SymbolInformation){
		if(this.docInfo.defineSymbols.allSymbols[symbol.searchName]){
			let travlSymbol = this.docInfo.defineSymbols.allSymbols[symbol.searchName];
			//判断是否数组
			if ( Array.isArray(travlSymbol) ){
				travlSymbol.push(symbol);
			}else{
				//只有一个元素，还不是数组
				let newArray = new Array();
				newArray.push(travlSymbol);
				newArray.push(symbol);
				this.docInfo.defineSymbols.allSymbols[symbol.searchName] = newArray;
			}
		}else{
			this.docInfo.defineSymbols.allSymbols[symbol.searchName] = symbol;
		}
		//放入array队列
		this.docInfo.defineSymbols.allSymbolsArray.push(symbol);
	}

	private pushToLocalList(symbol:Tools.SymbolInformation){
		if(this.docInfo.defineSymbols.localSymbols[symbol.searchName]){
			let travlSymbol = this.docInfo.defineSymbols.localSymbols[symbol.searchName];
			if ( Array.isArray(travlSymbol) ){
				travlSymbol.push(symbol);
			}else{
				let newArray = new Array();
				newArray.push(travlSymbol);
				newArray.push(symbol);
				this.docInfo.defineSymbols.localSymbols[symbol.searchName] = newArray;
			}
		}else{
			this.docInfo.defineSymbols.localSymbols[symbol.searchName] = symbol;
		}
		//放入array队列
		this.docInfo.defineSymbols.localSymbolsArray.push(symbol);
	}
	
	// 把symbol信息放入 docGlobalSymbols | 注意这里是 kv 形式
	private pushToGlobalList(symbol:Tools.SymbolInformation){
		if(this.docInfo.defineSymbols.globalSymbols[symbol.searchName]){
			let travlSymbol = this.docInfo.defineSymbols.globalSymbols[symbol.searchName];
			if ( Array.isArray(travlSymbol) ){
				travlSymbol.push(symbol);
			}else{
				let newArray = new Array();
				newArray.push(travlSymbol);
				newArray.push(symbol);
				this.docInfo.defineSymbols.globalSymbols[symbol.searchName] = newArray;
			}
		}else{
			this.docInfo.defineSymbols.globalSymbols[symbol.searchName] = symbol;
		}
		//放入array队列
		this.docInfo.defineSymbols.globalSymbolsArray.push(symbol);
	}

	// 根据符号自动识别应该放入哪个列表
	private pushToAutoList(symbol:Tools.SymbolInformation){
		if(symbol.isLocal){
			this.pushToLocalList(symbol);
		}else{
			this.pushToGlobalList(symbol);
		}
		this.pushToAllList(symbol);
	}

	private pushToChunkList(name, chunk){

		if(name.match(':')){
			//chunkname 除了是函数名外，还有可能是一个文件的路径。当name是路径的时候。不要把：转换为 .
			if(!name.match(new RegExp(/^\w:[\\\/]/))){
				name = name.replace(/:/g,".");
			}
		}

		if(this.docInfo.defineSymbols["chunks"][name]){
			let travlSymbol = this.docInfo.defineSymbols["chunks"][name];
			if ( Array.isArray(travlSymbol) ){
				travlSymbol.push(chunk);
			}else{
				let newArray = new Array();
				newArray.push(travlSymbol);
				newArray.push(chunk);
				this.docInfo.defineSymbols["chunks"][name] = newArray;
			}
		}else{
			this.docInfo.defineSymbols["chunks"][name] = chunk;
		}
		//放入array队列
		this.docInfo.defineSymbols.chunksArray.push(chunk);
	}	

	private pushToCommentList(cmt:Tools.commentTypeInfo){
		this.docCommentType.push(cmt);
	}

	// 记录函数调用
	private recordFuncCall(cmt:Tools.functionRetInfo){
		this.callFunctionRecoder.push(cmt);
	}
	//------------

//-----------------------------------------------------------------------------
//-- 遍历AST
//-----------------------------------------------------------------------------	
	// 遍历AST
	// @node AST 当前节点
	// @type : travelMode.BUILD / travelMode.FIND_DEFINE / travel.FIND_REFS
	// @deepLayer 深度队列。用来指示当前symbol所在的chunk
	// @prefix 前缀。用来指示当前symbol所在chunk (此信息直接展示给用户)
	// @isBody ?
	private traversalAST(node, type : travelMode, deepLayer: Array <Tools.chunkClass>, prefix?: string, isBody?:boolean) {
		//传入的node是一个数组的时候，traversalAST递归其中每一个元素
		if (Array.isArray(node) === true) {
			let ASTArray = Array.prototype.slice.call(node);
			for (let idx = 0, len = ASTArray.length; idx < len; idx++) {
				this.traversalAST(ASTArray[idx], type, deepLayer, prefix, isBody);
				if (this.posSearchRet && this.posSearchRet.isFindout) return;
			}
		} else {
			let nodeType = node["type"];
			switch (nodeType) {
				//container
				case 'Chunk': this.processChunk(node, type, deepLayer, prefix); break;
				case 'LocalStatement':  this.LocalStatement(node, type, deepLayer, prefix); break;
				case 'FunctionDeclaration': this.processFunction(node, type, deepLayer, prefix); break;
				case 'AssignmentStatement':  this.processAssignment(node, type, deepLayer, prefix); break;
				case 'CallExpression':  this.processCallExpression(node, type, deepLayer, prefix); break;
				case 'StringCallExpression':  this.processStringCallExpression(node, type, deepLayer, prefix); break;
				case 'CallStatement':  this.processCallStatement(node, type, deepLayer, prefix); break;
				//循环结构，其中可能有定义，也可能有查找的符号
				case 'WhileStatement':  this.processWhileStatement(node, type, deepLayer, prefix); break;
				case 'RepeatStatement':   this.processRepeatStatement(node, type, deepLayer, prefix); break;
				case 'IfStatement':   this.processIfStatement(node, type, deepLayer, prefix); break;
				case 'ReturnStatement':   this.processReturnStatement(node, type, deepLayer, prefix, isBody); break;
				case 'ForNumericStatement':  this.processForNumericStatement(node, type, deepLayer, prefix); break;
				case 'ForGenericStatement':   this.processForGenericStatement(node, type, deepLayer, prefix); break;
				//二进制表达式 a == b
				case 'BinaryExpression': this.processBinaryExpression(node, type, deepLayer, prefix); break;
				case 'UnaryExpression':   this.processUnaryExpression(node, type, deepLayer, prefix); break;
				// case 'TableConstructorExpression': retsyb = this.processTableConstructorExpression(ASTNode, type, deepLayer, prefix); break;
				case 'MemberExpression':  this.processMemberExpression(node, type, deepLayer, prefix); break;
				case 'IndexExpression':  this.processIndexExpression(node, type, deepLayer, prefix); break;
				// Terminal
				case 'Identifier':  this.processIdentifier(node, type, deepLayer, prefix); break;
			}
		}
		if (this.posSearchRet && this.posSearchRet.isFindout) return;
	}

	// ------异常处理
	//分析不完全AST时的回调，这里只处理有限的情况
	// 把symbol信息放入docSymbols
	// luaparse.parse 方法创建AST Node时的回调。这里只处理有限的接口
	private onCreateNode(node){
		//require
		let deepLayer: Array<Tools.chunkClass> = new Array<Tools.chunkClass>();
		if(node['type'] == 'CallExpression' || node['type'] == 'StringCallExpression'){
			DocSymbolProcessor.tempSaveInstance.traversalAST(node, travelMode.BUILD, deepLayer);
		}
		//定义 |  可以处理，但是失去了深度信息
		if(node['type'] == "LocalStatement"){
			DocSymbolProcessor.tempSaveInstance.traversalAST(node, travelMode.BUILD, deepLayer);
		}
			//function 定义
		if(node['type'] == "FunctionDeclaration"){
			DocSymbolProcessor.tempSaveInstance.traversalAST(node, travelMode.BUILD, deepLayer);
		}
	}

	//---------前处理和后处理
	// 处理注释. 基本思路是在注释中查询 -@type
	// 用一个结构体记录位置和类型，并放入CommentList中
	private processComments(commentArray){
		for (let idx = 0, len = commentArray.length; idx < len; idx++) {
			let comValue = commentArray[idx].value;
			let strArr = comValue.split(' ')
			for (let j = 0; j < strArr.length; j++) {
				const element = strArr[j];
				if(element.match('-@type')){
					let commentTypeIdx = j+1;
					for (let k = j+1; k < strArr.length; k++) {
						if(strArr[k] != ''){
							commentTypeIdx = k;
							break;
						}
					}
					let info = {
						reason: Tools.TagReason.UserTag,
						newType: strArr[commentTypeIdx],
						location : commentArray[idx].loc
					}
					this.pushToCommentList(info);
					break;
				}
			}
		}
	}

	/**
	 * 记录反向引用关系
	 * @param requireName require语句中的文件名
	 * @param fileUri     调用require语句的文件的uri
	 */
	private recordReference(fileUri: string, requireName: string) {
		let requireFileUri = Tools.transFileNameToUri(requireName);
		if (requireFileUri == "") {
			// 未找到require的文件
			return;
		}

		// 被require的文件还没有处理，先创建符号
		if (CodeSymbol.docSymbolMap.has(requireFileUri) == false) {
			CodeSymbol.createOneDocSymbols(requireFileUri);
		}
		let references = CodeSymbol.docSymbolMap.get(requireFileUri).getReferencesArray();
		if (references.includes(fileUri)) {
			return;
		}
		references.push(fileUri);
	}


	private createRetBase(baseName, baseLocal, identifer?): Tools.searchRet {
		let retBase: Tools.baseInfo = {
			name: baseName,
			isLocal: baseLocal,
			identiferStr:identifer
		};
		let ret: Tools.searchRet = { isFindout: false, baseinfo: retBase };
		return ret;
	}
	
	private createRetSymbol(sybName, sybisLocal, sybLocation?, sybPath?){
		sybPath = sybPath || this.docInfo["docPath"];
		let retSymbol: Tools.searchSymbolRet = {
			name: sybName,
			isLocal: sybisLocal,
			location: sybLocation,
			containerURI: sybPath
		};
		let ret: Tools.searchRet = { isFindout: true, retSymbol: retSymbol };
		return ret;
	}	

	// 记录一个符号的标记和标记原因（准备删除）
	private setTagTypeToSymbolInfo(symbol: Tools.SymbolInformation, tagType, tagReason){
		if(symbol.tagReason != undefined && symbol.tagReason == Tools.TagReason.UserTag){
			// 用户标记的类型权重 > 赋值类型权重
			return;
		}

		symbol.tagType = tagType;
		symbol.tagReason = tagReason;
	}

	//---文件尾处理（生成符号表后，对一些有注释类型的符号，进行添加tag信息）
	// 根据docCommentType记录的信息，在符号中标记tag
	private buildSymbolTag(){
		let tagArray = this.docCommentType;
		for(var key in tagArray) {
			let tagInfo = tagArray[key];
			let loc = tagInfo.location;
			let reason = tagInfo.reason;
			//从allSymbols中遍历location和tag相符合的符号
			for (let index = 0; index < this.getAllSymbolsArray().length; index++) {
				const elm = this.getAllSymbolsArray()[index];
				//用户标记
				if(reason == Tools.TagReason.UserTag && elm.location.range.start.line + 1 === loc['end'].line)
				{
					this.setTagTypeToSymbolInfo(elm, tagInfo.newType, tagInfo.reason);
					break;
				}
				//相等符号
				if(reason == Tools.TagReason.Equal && elm.location.range.start.line + 1 === loc['end'].line)
				{
					// name : 被赋值符号名					
					if(tagInfo.name && tagInfo.name == elm.searchName){
						this.setTagTypeToSymbolInfo(elm, tagInfo.newType, tagInfo.reason);
						break;
					}
				}

				//元表标记
				if(reason == Tools.TagReason.MetaTable && elm.searchName == tagInfo.oldType){
					this.setTagTypeToSymbolInfo(elm, tagInfo.newType, tagInfo.reason);
					break;
				}
			}
		}
	}

	// 构建文件返回和函数返回
	private buildSymbolReturns(){
		//设置符号的 requireFile
		let reqArray = this.getRequiresArray();
		reqArray.forEach(element => {
			let loc = element.loc;
			let reqName = element.reqName;
			for (let index = 0; index < this.getAllSymbolsArray().length; index++) {
				const elm = this.getAllSymbolsArray()[index];	
				let aling = elm.location.range.start.line + 1;
				let bling = loc['start'].line;
				if(aling == bling )
				{
					elm.requireFile = reqName;
				}
			}
		});
		
		//设置符号的 function Return
		// let retArray = this.callFunctionRecoder;
		for (const key in this.callFunctionRecoder ) {
			const element = this.callFunctionRecoder[key];
			let loc = element.loc;
			let funcName = element.functionName;
			for (let index = 0; index < this.getAllSymbolsArray().length; index++) {
				const elm = this.getAllSymbolsArray()[index];
				//用户标记
				let aling = elm.location.range.start.line + 1;
				let bling = loc['start'].line;
				if(aling == bling )
				{
					elm.funcRets = funcName;
				}			
			}	
		}
	}
	//-------尾处理

//-----------------------------------------------------------------------------
//-- 遍历AST主方法
//-----------------------------------------------------------------------------	
	//base处理，主要工作是拼接变量名 a.b.c.d，并返回base的isLocal (子元素的isLocal跟随base)
	private baseProcess(baseNode) {
		if (baseNode['type'] == 'MemberExpression') {
			let ret = this.baseProcess(baseNode['base']);
			if(!ret){
				// let ret = this.baseProcess(baseNode['base']);
				return;
			}
			let str = ret.name;
			let isLocal = ret.isLocal;
			let retStr = str + baseNode['indexer'] + baseNode['identifier']['name'];
			let retObj = { name: retStr, isLocal: isLocal, origion: baseNode['identifier']['name'] };
			return retObj;
		}
		else if (baseNode['type'] == 'Identifier') {
			return { name: baseNode['name'], isLocal: baseNode['isLocal'] };
		}
		else if (baseNode['type'] == 'StringLiteral') {
			return { name: baseNode['value'], isLocal: false };
		}
		else if (baseNode['type'] == 'NumericLiteral') {
			return { name: baseNode['value'], isLocal: false };
		}

		else if (baseNode['type'] == 'IndexExpression') {
			let ret = this.baseProcess(baseNode['base']);
			let str = ret.name;
			let isLocal = ret.isLocal;
			let retObj;
			if(baseNode['index']['type'] == "NumericLiteral"){
				let retStr = str + '[' +  baseNode['index']['raw']  + ']';
				retObj = { name: retStr, isLocal: isLocal, origion: baseNode['index']['raw'] };
			}

			if(baseNode['index']['type'] == "Identifier"){
				let retStr = str + '[' +  baseNode['index']['name']  + ']';
				retObj = { name: retStr, isLocal: isLocal, origion: baseNode['index']['name'] };
			}

			if(baseNode['index']['type'] == "MemberExpression"){
				let ret = this.baseProcess(baseNode['index']);
				let retStr = str + '[' + ret.name + ']';
				retObj = { name: retStr, isLocal: isLocal, origion: ret.name };
			}

			if(baseNode['index']['type'] == "IndexExpression"){
				let ret = this.baseProcess(baseNode['index']);
				let retStr = str + '[' + ret.name + ']';
				retObj = { name: retStr, isLocal: isLocal, origion: ret.name };
			}

			if(baseNode['index']['type'] == "StringLiteral"){
				let ret = this.baseProcess(baseNode['index']);
				let retStr = str + '["' + ret.name + '"]';
				retObj = { name: retStr, isLocal: isLocal, origion: ret.name };
			}

			//index 中是一个表达式
			if(baseNode['index']['type'] == "BinaryExpression"){
				let retL = this.baseProcess(baseNode['index']['left']);
				let retR = this.baseProcess(baseNode['index']['right']);

				let retStr = str + '[' + retL.name + baseNode['index'].operator + retR.name + ']';
				retObj = { name: retStr, isLocal: isLocal, origion: ret.name };
			}

			return retObj;
		}
		return { name: '', isLocal: false };
	}

	//base处理，function a.b.c.d. 当用户点击b的时候返回a.b
	private MemberExpressionFind(baseNode) {
		if(baseNode == null){
			Logger.log("baseNode == null");
		}

		if (baseNode['type'] == 'MemberExpression') {
			//递归向内部取base
			let ret = this.MemberExpressionFind(baseNode['base']);
			// if(ret && ret.isFindout){
			// 	return ret;
			// }

			if(ret == null || ret.isInStat == undefined){
				ret.isInStat = 0;
			}
			//判断identifier是否符合？一旦符合，后面的基层及全部加上
			let nodeLoc = Location.create(this.docInfo["docUri"], baseNode['identifier']['loc']);
			let isIn = this.isInLocation(nodeLoc, this.searchPosition);

			if (isIn === true && ret.isInStat === 0) {
				ret.isInStat = 1;
			}
			if (isIn === false && ret.isInStat === 1) {
				//stop
				return ret;
			}

			let str = ret.name;
			let isLocal = ret.isLocal;
			let retStr = str + baseNode['indexer'] + baseNode['identifier']['name'];
			return { name: retStr, isLocal: isLocal, isInStat: ret.isInStat };
		}
		else if (baseNode['type'] == 'IndexExpression') {
			//getindex
			let ret = this.MemberExpressionFind(baseNode['base']);
			// if(ret && ret.isFindout){
			// 	return ret;
			// }

			if(ret == null || ret.isInStat == undefined){
				ret.isInStat = 0;
			}
			//判断identifier是否符合？一旦符合，后面的基层及全部加上
			let nodeLoc = Location.create(this.docInfo["docUri"], baseNode['index']['loc']);
			let isIn = this.isInLocation(nodeLoc, this.searchPosition);

			if (isIn === true && ret.isInStat === 0) {
				ret.isInStat = 1;
			}
			if (isIn === false && ret.isInStat === 1) {
				//stop
				return ret;
			}

			let str = ret.name;
			let isLocal = ret.isLocal;
			let retStr;

			if(baseNode['index']['value']){
				retStr = str + '.' + baseNode['index']['value'];
			}

			if(baseNode['index']['name']){
				retStr = this.MemberExpressionFind(baseNode['index']).name;
			}

			return { name: retStr, isLocal: isLocal, isInStat: ret.isInStat };
		}
		else if (baseNode['type'] == 'CallExpression') {
			 this.processCallExpression(baseNode, travelMode.GET_DEFINE , null, "call EXp");
			if (this.posSearchRet && this.posSearchRet.isFindout) {
				// return retSymbol;
				return {name: this.posSearchRet.retSymbol.name, isLocal:this.posSearchRet.retSymbol.isLocal, isInStat:1}
			}
			else{
				return { name: '', isLocal: true, isInStat: 0 };
			}
		}
		else if (baseNode['type'] == 'StringCallExpression') {
			this.processStringCallExpression(baseNode, travelMode.GET_DEFINE , null, "call EXp");
		   if (this.posSearchRet && this.posSearchRet.isFindout) {
			   // return retSymbol;
			   return {name: this.posSearchRet.retSymbol.name, isLocal:this.posSearchRet.retSymbol.isLocal, isInStat:1}
		   }
		   else{
			   return { name: '', isLocal: true, isInStat: 0 };
		   }
	   }
		else if (baseNode['type'] == 'Identifier') {
			//base的基层级
			let nodeLoc = Location.create(this.docInfo["docUri"], baseNode['loc']);

			let isIn = this.isInLocation(nodeLoc, this.searchPosition);
			if (isIn === true) {
				return { name: baseNode['name'], isLocal: baseNode['isLocal'], isInStat: 1 };
			}
			else {
				return { name: baseNode['name'], isLocal: baseNode['isLocal'], isInStat: 0 };
			}
		}
	}

	//处理chunk， 通常是遍历AST的第一步
	private processChunk(node, type, deepLayer, prefix){
		if (type === travelMode.BUILD) {
			this.processComments(node['comments']);	//整理记录comment(---@type)
			// 把当前文件压入chunk		
			let newChunk = new Tools.chunkClass(this.docInfo["docPath"] , this.docInfo.docAST.loc);	
			this.pushToChunkList(this.docInfo["docPath"], newChunk);
			// 压入deep layer
			deepLayer.push( newChunk );	//记录chunk名(文件名和起始结束行)
			this.traversalAST(node["body"], type, deepLayer, prefix, true);	// 遍历body
		}

		if (type === travelMode.GET_DEFINE){
			let newChunk = new Tools.chunkClass(this.docInfo["docPath"] , this.docInfo.docAST.loc);	
			deepLayer.push( newChunk );	//记录chunk名(文件名和起始结束行)
			this.traversalAST(node["body"], type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		if (type === travelMode.FIND_REFS){
			this.traversalAST(node["body"], type, deepLayer, prefix);
		}
	}

	// 处理function
	private processFunction(node, type, deepLayer: Array<Tools.chunkClass>, prefix?: string) {
		let searchRes = false;	//整体检查位置是否在 function 中
		let paraRecoder = new Array();
		// GET_DEFINE 先判断搜索位置是否在 函数location中
		if (type === travelMode.GET_DEFINE) {
			let nodeLoc = Location.create(this.docInfo["docUri"], node["loc"]);
			searchRes = this.isInLocation(nodeLoc, this.searchPosition);
			// 用户点搜索的位置不在本function范围内, 清空数据，返回
			if(searchRes == false) {
				this.posSearchRet = new Tools.searchRet();
			}
		}

		// 1. 记录函数参数
		let searchHitPara = false;
		let searchHitParaIdx = 0;
		let paramArray = new Array();
		for (let idx = 0; idx < node["parameters"].length; idx++) {
			let paraNode = node["parameters"][idx];
			if(paraNode.type == 'VarargLiteral'){
				//可变参数
				paramArray.push(paraNode['value']);
			}else{
				paramArray.push(paraNode['name']);
			}

			//搜索模式，且之前未命中
			if (type === travelMode.GET_DEFINE && searchRes === true && searchHitPara === false) {
				let nodeLoc1 = Location.create(this.docInfo["docUri"], node["parameters"][idx]["loc"]);
				searchHitPara = this.isInLocation(nodeLoc1, this.searchPosition);
				if(searchHitPara === true){
					searchHitParaIdx = idx;
					continue;
				}
			}

			if (type === travelMode.BUILD) {
				let loc = paraNode["loc"];
				let name;
				if(paraNode.type == 'VarargLiteral'){
					name = paraNode.value;
				}else{
					name = paraNode["name"];
				}
				let isLocal = true;  //参数全部是local
				let loct = Location.create(this.docInfo["docUri"], Range.create(Position.create(loc["start"]["line"] - 1, loc["start"]["column"]), Position.create(loc["end"]["line"] - 1, loc["end"]["column"])));
				let smbInfo = this.createSymbolInfo(name, name, name, SymbolKind.Variable, loct, isLocal, prefix, deepLayer.concat());
				paraRecoder.push(smbInfo);
			}
		}
		let paramString = "(" + paramArray.join(", ") + ")";

		// 2. 处理函数名，BUILD时记录 chunk 。 并把信息压入 deepLayer
		let newChunk; // 临时记录保存在数据结构中的chunk
		let functionName;	//函数名(name)
		let functionSearchName = "NONAME"; //函数searchName
		// 有名函数 普通函数的情况 function a() 
		if (node["identifier"] && node["identifier"]['type'] == 'Identifier') {
			let loc = node["identifier"]["loc"];
			functionSearchName = node["identifier"]["name"];
			functionName = "function " + functionSearchName + paramString;
			if (type === travelMode.GET_DEFINE && searchRes === true) {
				let nodeLoc1 = Location.create(this.docInfo["docUri"], loc);
				let res1 = this.isInLocation(nodeLoc1, this.searchPosition);
				if (res1 === true){
					this.posSearchRet =  this.createRetSymbol(node["identifier"].name, node["identifier"].isLocal);
					return;
				}
			}
			if (type === travelMode.FIND_REFS) {
				if (functionSearchName == this.searchInfo.originalName){
					let loc = node["identifier"]["loc"];
					let nodeLoc1 = Location.create(this.docInfo["docUri"], loc);
					this.refsLink.push(nodeLoc1);
				}
			}
			if (type === travelMode.BUILD) {
				let loct = Location.create(this.docInfo["docUri"], Range.create(Position.create(loc["start"]["line"] - 1, loc["start"]["column"]), Position.create(loc["end"]["line"] - 1, loc["end"]["column"])));
				let pushObj = this.createSymbolInfo(functionSearchName, functionSearchName, functionSearchName, SymbolKind.Function, loct, node["identifier"]["isLocal"], prefix, deepLayer.concat(), paramArray);
				newChunk = new Tools.chunkClass(functionSearchName, node.loc);
				this.pushToChunkList(newChunk.chunkName, newChunk);
				pushObj.chunk = newChunk;
				this.pushToAutoList(pushObj);

			}
		//有名函数 成员函数的情况 function a.b()
		} else if (node["identifier"] && node["identifier"]['type'] == 'MemberExpression') {
			let baseInfo =  this.baseProcess(node["identifier"]);
			functionSearchName = baseInfo.name;
			functionName = 'function ' + functionSearchName + paramString;
			if (type === travelMode.GET_DEFINE && searchRes === true) {
				let bname = this.MemberExpressionFind(node["identifier"]);
				if (bname.isInStat && bname.isInStat > 0) {
					this.posSearchRet = this.createRetSymbol(bname.name, bname.isLocal);
					return;
				}
			}

			if (type === travelMode.FIND_REFS) {
				if (functionSearchName == this.searchInfo.originalName){
					let loc = node["identifier"]["loc"];
					let nodeLoc1 = Location.create(this.docInfo["docUri"], loc);
					this.refsLink.push(nodeLoc1);
				}
			}

			if (type === travelMode.BUILD) {
				let bname = this.baseProcess(node["identifier"]);
				let originalName = bname.origion;
				let loc = node['identifier']['loc'];
				let rg = Location.create(this.docInfo["docUri"], Range.create(Position.create(loc["start"]["line"] - 1, loc["start"]["column"]), Position.create(loc["end"]["line"] - 1, loc["end"]["column"])));
				let symbInfo = this.createSymbolInfo(functionName, functionSearchName, originalName, SymbolKind.Function, rg , bname.isLocal, prefix, deepLayer.concat(), paramArray);
				newChunk = new Tools.chunkClass(functionSearchName, node.loc);
				this.pushToChunkList(newChunk.chunkName, newChunk);
				symbInfo.chunk = newChunk;
				this.pushToAutoList(symbInfo);

				//a:b , 隐式的self
				let sepArr = bname.name.split(':');
				if(sepArr.length > 1){
					let tagname = sepArr[0];
					let funcself = "self";
					let isLocal = true;  //参数全部是local
					// let rg = Location.create(this.docInfo["docUri"], Range.create(Position.create(-1, -1), Position.create(-1, -1)));
					let posChunk = new Tools.chunkClass(functionSearchName, node.loc);
					deepLayer.push(posChunk);	
					let selfInfo = this.createSymbolInfo(funcself, funcself, funcself, SymbolKind.Variable, rg, isLocal, prefix, deepLayer.concat(), null, tagname, Tools.TagReason.Equal);
					this.pushToAutoList(selfInfo);
					deepLayer.pop();	

				}
			}
		}

		// 生成chunk信息放入layer
		let posChunk = new Tools.chunkClass(functionSearchName, node.loc);
		deepLayer.push(posChunk);

		if (type === travelMode.BUILD ){
			//BUILD 向符号列表中写入para信息
			for(let idx = 0 , len = paraRecoder.length;idx < len ; idx++ ){
				let parainfo = paraRecoder.pop();
				parainfo.containerName = functionSearchName;
				parainfo.containerList = deepLayer.concat();
				this.pushToAllList(parainfo);
			}
		}

		// 3. 搜索命中para, 拼完路径后返回
		if (type === travelMode.GET_DEFINE ){
			if (searchHitPara === true) {
				this.posSearchRet =  this.createRetSymbol(node["parameters"][searchHitParaIdx].name, node["parameters"][searchHitParaIdx].isLocal);
				return;
			}
		}

		//TODO: 暂不支持函数嵌套声明, 可以改为array保存返回值
		this.funcReturnRecoder = null;	//准备记录函数返回
		//匿名函数不再加入符号，仅分析内部成员
		this.traversalAST(node["body"], type, deepLayer, functionName);

		// 4. 搜索命中para, 拼完路径后返回
		if (type === travelMode.GET_DEFINE ){
			if (this.posSearchRet && this.posSearchRet.isFindout) {
				return;
			}
		}

		if (type === travelMode.BUILD ){
			//把返回值放入function chunk
			if(this.funcReturnRecoder){
				if(newChunk){
					newChunk.returnSymbol = this.funcReturnRecoder;
				}else{
					// 无名函数，不会创建newChunk，则不记录返回值
				}
			}
		}
		deepLayer.pop();
	}

	//处理局部变量
	private LocalStatement(node, type, deepLayer, prefix?: string) {
		let searchRes = false;
		let baseInfo: Tools.baseInfo;
		if (type === travelMode.GET_DEFINE) {
			//检查变量是否在loc中
			searchRes = this.isInLocation(Location.create(this.docInfo["docUri"], node["loc"]), this.searchPosition);
		}

		for (let idx = 0, len = node["variables"].length; idx < len; idx++) {
			if (type === travelMode.BUILD) {
				baseInfo = this.buildLvalueSymbals(node["variables"][idx], type, deepLayer, prefix);
			}

			if (type === travelMode.GET_DEFINE) {
				this.searchLvalueSymbals(node["variables"][idx], type, deepLayer, prefix, searchRes);
				if (this.posSearchRet && this.posSearchRet.isFindout) return ;
				baseInfo = this.posSearchRet.baseinfo;
			}

			if (type === travelMode.FIND_REFS) {
				this.searchLvalueSymbals(node["variables"][idx], type, deepLayer, prefix, searchRes);
			}
		}

		//右值
		for (let idx = 0, len = node['init'].length; idx < len; idx++) {
			if (type === travelMode.BUILD) {
				this.buildRvalueSymbals(node['init'][idx], type, deepLayer, prefix, baseInfo);
			}

			if (type === travelMode.GET_DEFINE) {
				 this.searchRvalueSymbals(node['init'][idx], type, deepLayer, prefix, baseInfo, searchRes);
				if (this.posSearchRet && this.posSearchRet.isFindout) return;
			}

			if (type === travelMode.FIND_REFS) {
				this.searchRvalueSymbals(node['init'][idx], type, deepLayer, prefix, baseInfo, searchRes);
			}
		}
	}

	//检查是否metatable，如果是，记录tag & reason
	private processCallExpisSetMetatable(node, type, arg){
		if(type == travelMode.BUILD){
			let len = arg.length;
			if(node["base"].type == 'Identifier' && node["base"].name == 'setmetatable' && node["base"].isLocal === false && len == 2) {
					//base
					let oldName = this.baseProcess(arg[0]);
					let newName = this.baseProcess(arg[1]);

					let info = {
						reason: Tools.TagReason.MetaTable,
						newType: newName.name,
						oldType: oldName.name,
						location : null
					}
					this.pushToCommentList(info);
			}
		}
	}

	//检查是否是function call，如果是，记录 tag & reason
	private processCallExpisFunctionCall(node, type, arg){
		if(type == travelMode.BUILD){
			// let len = arg.length;
			//functionName
			let functionName = this.baseProcess(node['base']);
			let info = {
				functionName: functionName,
				loc : node['loc']
			}
			this.recordFuncCall(info);
		}
	}

	//检查是否require，如果是，记录require的文件名
	private processCallExpisRequire(node, type, arg){
		if(type == travelMode.BUILD){
			let len = arg.length;
			if(node["base"].type == 'Identifier' && node["base"].name == 'require' && node["base"].isLocal === false && len == 1) {
				//读取arg[0]
				if(arg[0].type == 'StringLiteral' && arg[0].value){
					//记录 arg[0].value
					let info: Tools.requireFileInfo = { reqName: arg[0].value, loc: arg[0].loc };
					// this.docInfo["requireFile"].push(info);
					this.docInfo.requires.push(info)
					// 记录引用关系
					this.recordReference(this.docInfo["docUri"], arg[0].value);
				}
			}
		}
	}

	//
	private processStringCallExpisRequire(node, type, arg){
		if(type == travelMode.BUILD){
			if(arg.type == 'StringLiteral' && arg.value){
				let info: Tools.requireFileInfo = { reqName: arg.value, loc: arg.loc };
				this.docInfo["requires"].push(info);
				// 记录引用关系
				this.recordReference(this.docInfo["docUri"], arg.value);
			}
		}
	}

	//调用表达式
	private processStringCallExpression(node, type, deepLayer, prefix?: string) {
		if(type == travelMode.BUILD){
			this.processStringCallExpisRequire(node, type, node['argument']);
		}

		if(type == travelMode.GET_DEFINE){
			let bname = this.MemberExpressionFind(node["base"]);
			if (bname.isInStat && bname.isInStat > 0) {
				this.posSearchRet =  this.createRetSymbol(bname.name, bname.isLocal);
				return;
			}
		}
		//base
		// if (type === travelMode.FIND_DEFINE) {
		// 	let bname = this.MemberExpressionFind(node["base"]);
		// 	if (bname.isInStat > 0) {
		// 		// let retSearch : Tools.searchSymbolRet = {
		// 		// 	name: bname.name,
		// 		// 	containerURI: this.docInfo["docUri"],
		// 		// 	isLocal:bname.isLocal
		// 		// }
		// 		this.posSearchRet =  this.createRetSymbol(bname.name, bname.isLocal);
		// 	}
		// }

	}

	//调用表达式
	private processCallExpression(node, type, deepLayer, prefix?: string) {
		let varArray = Array.prototype.slice.call(node['arguments']);
		let len = varArray.length;
		this.processCallExpisRequire(node, type, varArray);
		this.processCallExpisSetMetatable(node, type, varArray);
		this.processCallExpisFunctionCall(node, type, varArray);
		//argument
		for (let idx = 0; idx < len; idx++) {
			 this.traversalAST(node['arguments'][idx], type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		//base
		if (type === travelMode.GET_DEFINE) {
			let bname = this.MemberExpressionFind(node["base"]);
			if (bname.isInStat && bname.isInStat > 0) {
				this.posSearchRet =  this.createRetSymbol(bname.name, bname.isLocal);
				return;
			}
		}

		//base
		if (type === travelMode.FIND_REFS) {
			let bname = this.MemberExpressionFind(node["base"]);
			if (bname == this.searchInfo.name){
				let loc = node["identifier"]["loc"];
				let nodeLoc1 = Location.create(this.docInfo["docUri"], loc);
				this.refsLink.push(nodeLoc1);
			}
		}
	}

	//调用语句
	private processCallStatement(node, type, deepLayer, prefix?: string) {
		 this.traversalAST(node['expression'], type, deepLayer, prefix);
		if (this.posSearchRet && this.posSearchRet.isFindout) return;
	}

	//saved[value] 可以用作定义， 也可以读取值
	private processIndexExpression(node, type, deepLayer, prefix?: string){
		//search
		if (type === travelMode.GET_DEFINE) {
			let loc = node['index']['loc'];
			//先判断index是否命中。如果命中，也要search base. 另外搜索当前元素要把base带上
			let nodeLoc1 = Location.create(this.docInfo["docUri"], loc);
			let retBool = this.isInLocation(nodeLoc1, this.searchPosition);
			if (retBool === true) {
				//取得base
				if(node['base'].type == 'MemberExpression'){
					this.posSearchRet = this.processMemberExpression(node['base'], type, deepLayer, prefix);
					if (this.posSearchRet && this.posSearchRet.isFindout) return;

				}else if(node['base'].type == 'Identifier'){
					this.processIdentifier(node['base'], type, deepLayer, prefix);
					if (this.posSearchRet && this.posSearchRet.isFindout) return;
					this.processIdentifier(node['index'], type, deepLayer, prefix);
					if (this.posSearchRet && this.posSearchRet.isFindout == true) return;
				}else if(node['base'].type == 'IndexExpression'){
					// c[ a ][ b ] = 9 查找b的定义
					this.processIdentifier(node['index'], type, deepLayer, prefix);
					if (this.posSearchRet && this.posSearchRet.isFindout == true) return;
				}
			}
			//递归search base  index 不需要递归
			let bname = this.MemberExpressionFind(node['base']);
			if (bname.isInStat && bname.isInStat > 0) {
				this.posSearchRet = this.createRetSymbol(bname.name, bname.isLocal);
				return;
			}
			//没找到
			return this.createRetBase(bname.name, bname.isLocal, node['index']['value']);
		}
	}

	//变量赋值, 这里要区分全局变量的赋值和定义
	private processAssignment(node, type, deepLayer, prefix?: string) {
		let searchRes = false;
		let baseInfo: Tools.baseInfo;

		if (type === travelMode.GET_DEFINE) {
			//检查变量是否在loc中
			let nodeLoc = Location.create(this.docInfo["docUri"], node["loc"]);
			searchRes = this.isInLocation(nodeLoc, this.searchPosition);
		}

		//遍历variables
		if (Array.isArray(node['variables']) === true) {
			let varArray = Array.prototype.slice.call(node['variables']);
			let len = varArray.length;
			for (let idx = 0; idx < len; idx++) {
				if (type === travelMode.BUILD) {
					baseInfo = this.buildLvalueSymbals(node["variables"][idx], type, deepLayer, prefix, null, 1);
				}

				if (type === travelMode.GET_DEFINE) {
					this.searchLvalueSymbals(node["variables"][idx], type, deepLayer, prefix, searchRes);
					if (this.posSearchRet && this.posSearchRet.isFindout) return;
					if(this.posSearchRet.baseinfo)	baseInfo = this.posSearchRet.baseinfo;
				}

				if (type === travelMode.FIND_REFS) {
					this.searchLvalueSymbals(node["variables"][idx], type, deepLayer, prefix, searchRes);
				}
			}
		}

		//遍历init (右值)
		if (Array.isArray(node['init']) === true) {
			let varArray = Array.prototype.slice.call(node['init']);
			let len = varArray.length;
			for (let idx = 0; idx < len; idx++) {
				if (type === travelMode.BUILD) {
					//a.b.c = {x = 9}  base是 a.b.c
					this.buildRvalueSymbals(node['init'][idx], type, deepLayer, prefix, baseInfo);
				}

				if (type === travelMode.GET_DEFINE) {
					this.searchRvalueSymbals(node['init'][idx], type, deepLayer, prefix, baseInfo, searchRes);
					if (this.posSearchRet && this.posSearchRet.isFindout) return;
				}

				if (type === travelMode.FIND_REFS) {
					this.searchRvalueSymbals(node['init'][idx], type, deepLayer, prefix, baseInfo, searchRes);
				}
			}
		}
	}

	//遇到table构建表达式
	private processTableConstructorExpression(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string, baseInfo?) {
		//遍历fields
		for (let idx = 0, len = node['fields'].length; idx < len; idx++) {
			let idxNode = node['fields'][idx];
			if (type === travelMode.BUILD) {
				if (idxNode['type'] === 'TableKeyString') {
					//L
					let retInfo = this.buildLvalueSymbals(idxNode['key'], type, deepLayer, prefix, baseInfo);
					//R
					this.buildRvalueSymbals(idxNode["value"], type, deepLayer, prefix, retInfo);
				}
				if (idxNode['type'] === 'TableKey') {
					if(idxNode['key']['type'] === "StringLiteral"){
						// L
						let orgname = idxNode['key']['value'];
						let displayName = baseInfo.name + '.' + orgname;
						let rg = Location.create(this.docInfo["docUri"], Range.create(Position.create(idxNode['loc']["start"]["line"] - 1, idxNode['loc']["start"]["column"]), Position.create(idxNode['loc']["end"]["line"] - 1, idxNode['loc']["end"]["column"])));
						let symb = this.createSymbolInfo( displayName,  displayName, orgname, SymbolKind.Variable, rg, baseInfo.isLocal, prefix, deepLayer.concat());
						this.pushToAutoList(symb);
						let retInfo = {name: displayName, isLocal: baseInfo.isLocal};
						// R
						this.buildRvalueSymbals(idxNode["value"], type, deepLayer, prefix, retInfo);
					}

					if(idxNode['key']['type'] === "NumericLiteral"){
						// L
						let orgname = idxNode['key']['raw']; //TODO 【orgname】
						let displayName = baseInfo.name + '[' + orgname + ']';
						let rg = Location.create(this.docInfo["docUri"], Range.create(Position.create(idxNode['loc']["start"]["line"] - 1, idxNode['loc']["start"]["column"]), Position.create(idxNode['loc']["end"]["line"] - 1, idxNode['loc']["end"]["column"])));
						let symb = this.createSymbolInfo( displayName,  displayName, orgname, SymbolKind.Variable, rg, baseInfo.isLocal, prefix, deepLayer.concat());
						this.pushToAutoList(symb);
						let retInfo = {name: displayName, isLocal: baseInfo.isLocal};
						// R
						this.buildRvalueSymbals(idxNode["value"], type, deepLayer, prefix, retInfo);
					}
				}
			}
			if (type === travelMode.GET_DEFINE) {
				if (idxNode['type'] === 'TableKeyString') {
					// string key 的table构造式
					let recBaseName = baseInfo.name;
					//L
					this.searchLvalueSymbals(idxNode['key'], type, deepLayer, prefix, true, baseInfo);
					if (this.posSearchRet && this.posSearchRet.isFindout) return;
					//R
					this.searchRvalueSymbals(idxNode["value"], type, deepLayer, prefix, this.posSearchRet.baseinfo, true);
					if (this.posSearchRet && this.posSearchRet.isFindout) return;
					// 记录Base并还原，避免反复处理对Base造成干扰
					//用例 RadioErrorCode ={  Success = 0,  NotEnoughScore = 1000}
					baseInfo.name = recBaseName;
				}

				if (idxNode['type'] === 'TableKey') {
					// [] 形式key的table构造式
					if(idxNode['key']['type'] === "NumericLiteral"){								
						let recBaseName = baseInfo.name;
						baseInfo.name = baseInfo.name + '[' + idxNode['key']['value'] +  ']';
						this.searchRvalueSymbals(idxNode["value"], type, deepLayer, prefix, baseInfo, true);
						if (this.posSearchRet && this.posSearchRet.isFindout) return;

						baseInfo.name = recBaseName;
					}
					if(idxNode['key']['type'] === "StringLiteral"){
						let recBaseName = baseInfo.name;
						baseInfo.name = baseInfo.name + '.' + idxNode['key']['value'];
						this.searchRvalueSymbals(idxNode["value"], type, deepLayer, prefix, baseInfo, true);
						if (this.posSearchRet && this.posSearchRet.isFindout) return;
						baseInfo.name = recBaseName;
					}
				}

				if (idxNode['type'] === 'TableValue') {
					if (idxNode['value']['type'] === 'TableConstructorExpression') {
						let recBaseName = baseInfo.name;
						this.processTableConstructorExpression(idxNode['value'], type, deepLayer, prefix, baseInfo);
						if (this.posSearchRet && this.posSearchRet.isFindout) return;
						baseInfo.name = recBaseName;
				   }
				}

			}

			if (type === travelMode.FIND_REFS) {
				if (idxNode['type'] === 'TableKeyString') {
					//L
					this.searchLvalueSymbals(idxNode['key'], type, deepLayer, prefix, true, baseInfo);
					//R
					this.searchRvalueSymbals(idxNode["value"], type, deepLayer, prefix, this.posSearchRet.baseinfo, true);
				}
			}
		}
	}

	//while
	private processWhileStatement(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string) {
		this.traversalAST(node['body'], type, deepLayer, prefix);
		if (this.posSearchRet && this.posSearchRet.isFindout) return;
	}

	private processRepeatStatement(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string) {
		this.traversalAST(node['body'], type, deepLayer, prefix);
		if (this.posSearchRet && this.posSearchRet.isFindout) return;
	}

	private processMemberExpression(node, type, deepLayer, prefix: string, baseInfo?, searchRes?) {
		if (type === travelMode.GET_DEFINE) {
			if (node['type'] === 'MemberExpression') {
				let loc = node['identifier']['loc'];
				//search 不仅要search当前元素，还要单独search base. 另外搜多当前元素要把base带上
				let nodeLoc1 = Location.create(this.docInfo["docUri"], loc);
				let retBool = this.isInLocation(nodeLoc1, this.searchPosition);
				if (retBool === true) {
					//findout
					let bname = this.baseProcess(node);
					this.posSearchRet =  this.createRetSymbol(bname.name, bname.isLocal);
				}
				//递归search base
				let bname = this.MemberExpressionFind(node['base']);
				if (bname.isInStat && bname.isInStat > 0) {
					this.posSearchRet = this.createRetSymbol(bname.name, bname.isLocal);
				}
				//没找到
				return this.createRetBase(bname.name, bname.isLocal, node['identifier']['name']);
			}
		}
	}
	//
	private processIdentifier(node, type, deepLayer, prefix: string, baseInfo?, searchRes?) {
		if (type === travelMode.GET_DEFINE) {
			if (node['type'] === 'Identifier') {
				if (baseInfo == undefined || baseInfo.name == undefined || baseInfo.name === '') {
					baseInfo = { name: node["name"], isLocal: node['isLocal'] };
				} else {
					if(baseInfo.identiferStr){
						baseInfo.name = baseInfo.name + '.'  + baseInfo.identiferStr + '.' + node["name"];
					}else{
						baseInfo.name = baseInfo.name + '.' + node["name"];
					}
				}
				//搜索
				let nodeLoc1 = Location.create(this.docInfo["docUri"], node["loc"]);
				if ( this.isInLocation(nodeLoc1, this.searchPosition) ) {
					this.posSearchRet = this.createRetSymbol(baseInfo.name, baseInfo.isLocal);
				}else{
					this.posSearchRet = this.createRetBase(baseInfo.name, baseInfo.isLocal);
				}
			}

			if (node['type'] === 'BinaryExpression') {
				// c[ a + b ] = 9 , 搜索a或者b的定义
			}
		}

		if (type === travelMode.FIND_REFS) {
			if (node['type'] === 'Identifier') {
				if (baseInfo == undefined || baseInfo.name == undefined || baseInfo.name === '') {
					baseInfo = { name: node["name"], isLocal: node['isLocal'] };
				} else {
					if(baseInfo.identiferStr){
						baseInfo.name = baseInfo.name + '.'  + baseInfo.identiferStr + '.' + node["name"];
					}else{
						baseInfo.name = baseInfo.name + '.' + node["name"];
					}
				}

				if(baseInfo.name == this.searchInfo.searchName){
					let nodeLoc1 = Location.create(this.docInfo["docUri"], node["loc"]);
					this.refsLink.push(nodeLoc1);
				}
			}
		}
	}

	//二进制表达式，比如 i == 10000
	private processBinaryExpression(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string) {
		//search
		if (type === travelMode.GET_DEFINE) {
			this.traversalAST(node['left'], type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;

			this.traversalAST(node['right'], type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}
		//search
		if (type === travelMode.FIND_REFS) {
			this.traversalAST(node['left'], type, deepLayer, prefix);
			this.traversalAST(node['right'], type, deepLayer, prefix);
		}
	}

	private processUnaryExpression(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string) {
		if (type === travelMode.GET_DEFINE) {
			let argumentType = node['argument']['type'];
			switch (argumentType) {
				case 'Identifier':
					this.processIdentifier(node['argument'], type, deepLayer, prefix);
					break;
				case 'LogicalExpression':
					this.searchRvalueSymbals(node['argument']['left'], type, deepLayer, prefix);
					if (this.posSearchRet && this.posSearchRet.isFindout) break;
					this.searchRvalueSymbals(node['argument']['right'], type, deepLayer, prefix);
					break;
				case 'IndexExpression':
					this.processIndexExpression(node['argument'], type, deepLayer, prefix);
					break;
				case 'BinaryExpression':
					this.processBinaryExpression(node['argument'], type, deepLayer, prefix);
					break;
				case 'CallExpression':
					this.processCallExpression(node['argument'], type, deepLayer, prefix);
					break;
				case 'MemberExpression':
					this.processMemberExpression(node['argument'], type, deepLayer, prefix);
					break;
				case 'UnaryExpression':
					this.processUnaryExpression(node['argument'], type, deepLayer, prefix);
					break;
			}
			if (this.posSearchRet && this.posSearchRet.isFindout) {
				return;
			}
		}
	}

	// if中应该不会存在定义（除了body）
	private processIfStatement(ASTNode: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string) {
		let node = ASTNode['clauses'];
		if (Array.isArray(node) === true) {
			let ASTArray = Array.prototype.slice.call(node);
			for (let idx = 0, len = ASTArray.length; idx < len; idx++) {
				if (ASTArray[idx].type == 'IfClause' || ASTArray[idx].type == 'ElseifClause') {
					//if ty1 then
					if(ASTArray[idx]['condition']['type'] === 'Identifier'){
						this.processIdentifier(ASTArray[idx]['condition'], type, deepLayer, prefix);
						if (this.posSearchRet && this.posSearchRet.isFindout) {
							return;
						}
					}

					if(ASTArray[idx]['condition']['type'] === 'LogicalExpression'){
						let node = ASTArray[idx]['condition'];
						this.searchRvalueSymbals(node['left'], type, deepLayer, prefix);
						if (this.posSearchRet && this.posSearchRet.isFindout) return ;
						this.searchRvalueSymbals(node['right'], type, deepLayer, prefix);
						if (this.posSearchRet && this.posSearchRet.isFindout) return;
					}

					if(ASTArray[idx]['condition']['type'] === 'IndexExpression'){
						this.processIndexExpression(ASTArray[idx]['condition'], type, deepLayer, prefix);
						if (this.posSearchRet && this.posSearchRet.isFindout) return;
					}

					//判断二进制表达式有没有符号
					if (ASTArray[idx]['condition']['type'] === 'BinaryExpression') {
						this.processBinaryExpression(ASTArray[idx]['condition'], type, deepLayer, prefix);
						if (this.posSearchRet && this.posSearchRet.isFindout) {
							return;
						}
					}

					if(ASTArray[idx]['condition']['type'] === 'CallExpression'){
						this.processCallExpression(ASTArray[idx]['condition'], type, deepLayer, prefix);
						if (this.posSearchRet && this.posSearchRet.isFindout) {
							return;
						}
					}

					if(ASTArray[idx]['condition']['type'] === 'MemberExpression'){
						this.processMemberExpression(ASTArray[idx]['condition'], type, deepLayer, prefix);
						if (this.posSearchRet && this.posSearchRet.isFindout) {
							return;
						}
					}

					if(ASTArray[idx]['condition']['type'] === 'UnaryExpression'){
						this.processUnaryExpression(ASTArray[idx]['condition'], type, deepLayer, prefix);
						if (this.posSearchRet && this.posSearchRet.isFindout) {
							return;
						}
					}

					//if body
					this.traversalAST(ASTArray[idx].body, type, deepLayer, prefix);
					if (this.posSearchRet && this.posSearchRet.isFindout) {
						return;
					}
				}

				if (ASTArray[idx].type == 'ElseClause') {
					//if body
					this.traversalAST(ASTArray[idx].body, type, deepLayer, prefix);
					if (this.posSearchRet && this.posSearchRet.isFindout) {
						return;
					}
				}
			}
		}
	}

	// 处理return结构
	private processReturnStatement(ASTNode: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string, isBody?:boolean) {
		if (type === travelMode.GET_DEFINE) {
			let node = ASTNode;
			let varArray = Array.prototype.slice.call(node['arguments']);
			for (let idx = 0; idx < varArray.length; idx++) {
			    this.traversalAST(varArray[idx], type, deepLayer, prefix);
				if (this.posSearchRet && this.posSearchRet.isFindout) return;
			}
		}

		if(type === travelMode.BUILD){
			if(isBody == true){
				//file retSymbol
				if(ASTNode['arguments'].length == 1){
					if(ASTNode['arguments'][0]['type'] === 'Identifier' ){
						let name = ASTNode['arguments'][0]['name'];
						//记录文件的返回值，因为文件路径不可能重名，直接查找并放置
						this.docInfo.defineSymbols.chunks[this.docInfo.docPath].returnSymbol = name;
					}
				}
			}else{
				//function retSymbol
				if(ASTNode['arguments'].length == 1){
					if(ASTNode['arguments'][0]['type'] === 'Identifier' ){
						let name = ASTNode['arguments'][0]['name'];
						this.funcReturnRecoder = name;
					}
				}
			}
		}
	}

	//for k, v in pairs / ipairs
	private processForGenericStatement(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string) {
		// Logger.log('processForGenericStatement');
		//body
		this.traversalAST(node['body'], type, deepLayer, prefix);
		if (this.posSearchRet && this.posSearchRet.isFindout) return;
	}

	// for i = 9  ;  i + +
	private processForNumericStatement(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string) {
		// Logger.log('processForNumericStatement');
		//body
		this.traversalAST(node['body'], type, deepLayer, prefix);
		if (this.posSearchRet && this.posSearchRet.isFindout) return;
	}

	//构建左值. 主要是定义. 返回值是base信息
	//source 来源，填写1是来自于assign
	private buildLvalueSymbals(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string, baseInfo?, isAssign? : number) {
		let baseName = '';
		let baseLocal = true;
		let displayName = '';
		let searchName = '';
		if (node['type'] === 'Identifier') {
			if (baseInfo == undefined) {
				baseName = node["name"];
				baseLocal  = node["isLocal"];
				displayName = node["name"];
			} else {
				baseLocal = baseInfo.isLocal;	//设置花括号内的成员函数global / local 随base
				baseName = baseInfo.name + '.' + node["name"];
				displayName = baseName;
			}

			//区分 a = 9 情况下到底是赋值还是定义
			searchName = baseName;
			let isPush = true;	//判断是否压入符号列表，因为全局变量赋值也是定义，所以要在这里做一下判断
			if(isAssign == 1){
				//如果来源于赋值操作，而且baseLocal == true ， 那么一定是赋值 (local 的assign一定是赋值)
				if( baseLocal ){
					isPush = false;
				}else{
					// 全局表中是否存在
					if(this.getGlobalSymbolsDic()[searchName] != undefined){
						isPush = false;
					}
				}
			}

			if(isPush === true){
				let loct = Location.create(this.docInfo["docUri"], Range.create(Position.create(node['loc']["start"]["line"] - 1, node['loc']["start"]["column"]), Position.create(node['loc']["end"]["line"] - 1, node['loc']["end"]["column"])));
				let symb = this.createSymbolInfo(displayName, baseName, node["name"], SymbolKind.Variable, loct, baseLocal, prefix, deepLayer.concat());
				this.pushToAutoList(symb);
			}
			return { name: baseName, isLocal: baseLocal };
		}
		
		if ('MemberExpression' === node['type']) {
			let bname = this.baseProcess(node);
			let rg = Location.create(this.docInfo["docUri"], Range.create(Position.create(node['loc']["start"]["line"] - 1, node['loc']["start"]["column"]), Position.create(node['loc']["end"]["line"] - 1, node['loc']["end"]["column"])));
			baseName = bname.name;
			baseLocal = bname.isLocal;
			//检查符号是否已经存在，如果已存在就不是定义
			if (this.checkIsSymbolExist(bname.name) === false) {
				let symb = this.createSymbolInfo( bname.name,  bname.name, node['identifier']['name'], SymbolKind.Variable, rg, bname.isLocal, prefix, deepLayer.concat());
				this.pushToAutoList(symb);

			}
			return { name: baseName, isLocal: baseLocal };
		}
		else if('IndexExpression' === node['type']) {
			// saved[valu] = 9;   ==> saved.valu
			//valu是一个变量，目前并不知道其值，所以无法做build操作，只能查找。
			let baseInfo =  this.baseProcess( node['base'] );
			if( node['index'].type == 'StringLiteral' ){
				let rg = Location.create(this.docInfo["docUri"], Range.create(Position.create(node['loc']["start"]["line"] - 1, node['loc']["start"]["column"]), Position.create(node['loc']["end"]["line"] - 1, node['loc']["end"]["column"])));
				let displayName = baseInfo.name + '.' + node['index'].value ;
				if (this.checkIsSymbolExist(displayName) === false) {
					let symb = this.createSymbolInfo( displayName,  displayName, node['index'].value, SymbolKind.Variable, rg, baseInfo.isLocal, prefix, deepLayer.concat());
					this.pushToAutoList(symb);
				}
			}
			return { name: baseInfo.name, isLocal: baseInfo.isLocal };
		}
	}

	// 构建右值 | 处理 变量定义，赋值.
	// local a = function() end
	// a = { b = "c" }
	private buildRvalueSymbals(node: Object, type: number, deepLayer: Array<Tools.chunkClass>, prefix?: string, baseInfo?) {
		if (node == undefined) return;
		//构造table  a = { b = "c" }
		if (node['type'] === 'TableConstructorExpression') {
			this.processTableConstructorExpression(node, type, deepLayer, prefix, baseInfo);
		}

		// 在处理右值的时候，如果是Identifier或者MemberExpression. 标记tag
		if(node['type'] === 'Identifier'){
			let info =  {
				reason: Tools.TagReason.Equal,
				newType: node['name'],
				location : node['loc'],
				name : baseInfo.name
			}
			this.pushToCommentList(info);
		}

		if(node['type'] === 'MemberExpression'){
			let bname = this.baseProcess(node);
			let info =  {
				reason: Tools.TagReason.Equal,
				newType: bname.name,
				location : node['loc'],
				name:baseInfo.name
			}
			this.pushToCommentList(info);
		}

		this.traversalAST(node, type, deepLayer, prefix);
		// if (this.posSearchRet && this.posSearchRet.isFindout) {
		// 	return;
		// }
	}

	//搜索左值
	private searchLvalueSymbals(node: Object, type, deepLayer: Array<Tools.chunkClass>, prefix?: string, searchRes?, baseInfo?) {
		let localBaseInfo = baseInfo;
		if (node['type'] === 'Identifier') {
			this.processIdentifier(node, type, deepLayer, prefix, localBaseInfo, searchRes);
			//找到，返回
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
			//未找到，继承baseInfo
			if (this.posSearchRet && this.posSearchRet.isFindout === false) localBaseInfo = this.posSearchRet.baseinfo;
		}

		if (node['type'] === 'MemberExpression') {
			this.processMemberExpression(node, type, deepLayer, prefix, localBaseInfo, searchRes);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
			//未找到，继承baseInfo
			if (this.posSearchRet && this.posSearchRet.isFindout === false) localBaseInfo = this.posSearchRet.baseinfo;
		}

		if(node['type']  === 'CallExpression'){
			this.processCallExpression(node, type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
			//未找到，继承baseInfo
			if (this.posSearchRet && this.posSearchRet.isFindout === false) localBaseInfo = this.posSearchRet.baseinfo;

		}
		if(node['type']  === 'BinaryExpression'){
			this.processBinaryExpression(node, type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
			if (this.posSearchRet && this.posSearchRet.isFindout === false) localBaseInfo = this.posSearchRet.baseinfo;
		}

		if(node['type']  === 'IndexExpression'){
			this.processIndexExpression(node, type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
			if (this.posSearchRet && this.posSearchRet.isFindout === false) localBaseInfo = this.posSearchRet.baseinfo;
		}

	}

	//搜索右值
	private searchRvalueSymbals(node, type, deepLayer: Array<Tools.chunkClass>, prefix?: string, baseInfo?, searchRes?) {
		//右侧如果是Identifier, 不需要base
		if (node['type'] === 'Identifier') {
			this.processIdentifier(node, type, deepLayer, prefix, null, searchRes);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		if(node['type'] === 'MemberExpression'){
			this.processMemberExpression(node, type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) {
				return;
			}
		}

		//右侧如果是{ } , 构造table ,需要base
		if (node['type'] === 'TableConstructorExpression') {
			 this.processTableConstructorExpression(node, type, deepLayer, prefix, baseInfo);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		if (node.type === 'CallExpression') {
		this.traversalAST(node, type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		//traversalAST
		if (node.type === 'FunctionDeclaration') {
			this.traversalAST(node, type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		// indent = indent or ""
		if(node.type === 'LogicalExpression'){
			this.searchRvalueSymbals(node['left'], type, deepLayer, prefix, baseInfo, searchRes);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
			this.searchRvalueSymbals(node['right'], type, deepLayer, prefix, baseInfo, searchRes);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		// cart = cart .. indent .. field
		if(node.type === 'BinaryExpression'){
			this.searchRvalueSymbals(node['left'], type, deepLayer, prefix, baseInfo, searchRes);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
			this.searchRvalueSymbals(node['right'], type, deepLayer, prefix, baseInfo, searchRes);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		//a = b['index']
		if(node['type']  === 'IndexExpression'){
			this.processIndexExpression(node, type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) return;
		}

		// a = not b
		if(node['type'] === 'UnaryExpression'){
			this.processUnaryExpression(node, type, deepLayer, prefix);
			if (this.posSearchRet && this.posSearchRet.isFindout) {
				return;
			}
		}
	}

}


