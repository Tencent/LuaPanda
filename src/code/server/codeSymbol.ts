// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

// CodeSymbol 管理AST中的符号, 对上提供各种接口。
// 获取/刷新文件符号 
// 

import * as Tools from './codeTools';
import { CodeEditor } from './codeEditor';
import { DocSymbolProcessor } from './docSymbolProcessor';
import { Logger } from './codeLogManager';
let dir = require('path-reader');

export class CodeSymbol {
	// 用 kv 结构保存所有用户文件以及对应符号结构（包含定义符号和AST，以及方法）
	public static docSymbolMap = new Map<string, DocSymbolProcessor>();		// 用户代码中的lua文件
	public static luaPreloadSymbolMap = new Map<string, DocSymbolProcessor>();	// lua预制文件（LuaPanda集成）
	public static userPreloadSymbolMap = new Map<string, DocSymbolProcessor>();	// 用户的lua导出接口

	// 已处理文件列表，这里是防止循环引用
	private static alreadySearchList; //TODO 要标记一下这个变量被哪些函数使用了

	// 获取指定文件中的chunk列表
	public static getCretainDocChunkDic(uri){
		let processor = this.getFileSymbolsFromCache(uri);
		if(processor){
			return processor.getChunksDic();
		}
	}
//-----------------------------------------------------------------------------
//-- 创建单文件、工作区、预加载区、特定文件符号
//-----------------------------------------------------------------------------	
	// 单文件内符号处理
	// 指定文件的符号 [单文件创建] | 无返回 . 如文档的符号已建立则直接返回
	public static createOneDocSymbols(uri: string, luaText?: string) {
		if ( ! this.docSymbolMap.has(uri)) {
			this.refreshOneDocSymbols(uri, luaText);
		}
	}

	// 指定文件的符号 [单文件刷新] | 无返回， 强制刷新
	public static refreshOneDocSymbols(uri: string, luaText?: string) {
		if(luaText == undefined){
			luaText = CodeEditor.getCode(uri);
		}
		this.createDocSymbol(uri, luaText);
	}

		//创建指定后缀的lua文件的符号
	public static createSymbolswithExt(luaExtname: string, rootpath: string) {
		//记录此后缀代表lua
		Tools.setLoadedExt(luaExtname);
		//解析workSpace中同后缀文件
		let exp = new RegExp(luaExtname + '$', "i");
		dir.readFiles(rootpath, { match: exp }, function (err, content, filePath, next) {
			if (!err) {
				let uri = Tools.pathToUri(filePath);
				if(!Tools.isinPreloadFolder(uri)){
					CodeSymbol.createOneDocSymbols(uri, content);
				}else{
					CodeSymbol.refreshOneUserPreloadDocSymbols( Tools.uriToPath(uri));
				}
			}
			next();
		}, (err) => {
			if (err) {
				return;
			}
		});
	}

	// 获取指定文件的所有符号 ,  返回Array形式
	public static getOneDocSymbolsArray(uri: string, luaText?: string, range?:Tools.SearchRange): Tools.SymbolInformation[] {
		let docSymbals: Tools.SymbolInformation[] = [];
		this.createOneDocSymbols(uri, luaText);
		switch(range){
			case Tools.SearchRange.GlobalSymbols:
				docSymbals = this.getFileSymbolsFromCache(uri).getGlobalSymbolsArray(); break;
			case Tools.SearchRange.LocalSymbols:
				docSymbals = this.getFileSymbolsFromCache(uri).getLocalSymbolsArray(); break;
			case Tools.SearchRange.AllSymbols:
				docSymbals = this.getFileSymbolsFromCache(uri).getAllSymbolsArray(); break;
		}
		return docSymbals;
	}

	// 获取指定文件的所有符号 ,  返回Dictionary形式
	public static getOneDocSymbolsDic(uri: string, luaText?: string, range?:Tools.SearchRange): Tools.SymbolInformation[] {
		let docSymbals: Tools.SymbolInformation[] = [];
		this.createOneDocSymbols(uri, luaText);
		switch(range){
			case Tools.SearchRange.GlobalSymbols:
				docSymbals = this.getFileSymbolsFromCache(uri).getGlobalSymbolsDic(); break;
			case Tools.SearchRange.LocalSymbols:
				docSymbals = this.getFileSymbolsFromCache(uri).getLocalSymbolsDic(); break;
			case Tools.SearchRange.AllSymbols:
				docSymbals = this.getFileSymbolsFromCache(uri).getAllSymbolsDic(); break;
		}
		return docSymbals;
	}	

	// 获取指定文件的返回值，如无返回null
	public static getOneDocReturnSymbol(uri):string{
		this.createOneDocSymbols(uri);
		let docSymbals = this.docSymbolMap.get(uri);
		if(docSymbals){
			return docSymbals.getFileReturnArray();
		}
		else{
			return null;
		}
	}

	// 指定文件夹中的符号处理
	// 创建指定文件夹中所有文件的符号 [批量创建]
	public static createFolderSymbols(path: string){
		if(path === undefined || path === ''){
			return;
		}
		let filesArray = Tools.getDirFiles( path );
		filesArray.forEach(pathArray => {
			let uri  = Tools.pathToUri(pathArray);
			if(!this.docSymbolMap.has(uri)){
				this.createDocSymbol( uri , pathArray );
			}
		});
	}

	// 刷新 指定文件夹中所有文件的符号 [批量刷新]
	public static refreshFolderSymbols(path: string){
		if(path === undefined || path === ''){
			return;
		}
		let filesArray = Tools.getDirFiles( path );
		filesArray.forEach(element => {
			this.createDocSymbol( element );
		});
	}

	// 创建 lua预制的符号表 参数是文件夹路径
	public static createLuaPreloadSymbols(path: string){
		if(path === undefined || path === ''){
			return;
		}
		let filesArray = Tools.getDirFiles( path );
		filesArray.forEach(pathElement => {
			this.createPreLoadSymbals( Tools.pathToUri(pathElement), 0 );
		});
	}

	// 刷新 用户PreLoad 所有文件的符号 [PreLoad批量刷新] 参数是文件夹路径
	public static refreshUserPreloadSymbals(path: string){
		if(path === undefined || path === ''){
			return;
		}
		let filesArray = Tools.getDirFiles( path );
		filesArray.forEach(pathElement => {
			this.createPreLoadSymbals( Tools.pathToUri(pathElement), 1 );
		});
	}

	// 刷新 PreLoad 单个文件的符号 [PreLoad刷新] 通常lua预制符号只需要创建，无需刷新。 
	public static refreshOneUserPreloadDocSymbols(filePath: string){
		if(filePath === undefined || filePath === ''){
			return;
		}
		this.createPreLoadSymbals(Tools.pathToUri(filePath), 1);
	}

	// 获取 workspace 中的全局符号, 以dictionary的形式返回
	public static getWorkspaceSymbols(range? : Tools.SearchRange){
		range = range || Tools.SearchRange.AllSymbols;
		let filesMap = Tools.get_FileName_Uri_Cache();
		let g_symb = {};

		for (const fileUri in filesMap) {
			let g_s = this.getOneDocSymbolsDic( filesMap[fileUri], null, range);
			for (const key in g_s) {
				const element = g_s[key];
				g_symb[key] = element;
			}
		}

		return g_symb;
	}

	//reference处理
	public static searchSymbolReferenceinDoc(searchSymbol) {
		let uri = searchSymbol.containerURI;
		let docSymbals = this.getFileSymbolsFromCache(uri);
		return docSymbals.searchDocSymbolReference(searchSymbol);
	}

//-----------------------------------------------------------------------------
//-- 搜索符号
//-----------------------------------------------------------------------------	
	// 在[指定文件]查找符号（模糊匹配，用作搜索符号）
	// @return 返回值得到的排序:
	// 如果是Equal搜索，从dic中检索，按照AST深度遍历顺序返回
	public static searchSymbolinDoc(uri:string, symbolStr: string, searchMethod: Tools.SearchMode, range:Tools.SearchRange = Tools.SearchRange.AllSymbols): Tools.SymbolInformation[] {
		if (symbolStr === '' || uri === '' ) {
			return null;
		}
		let docSymbals = this.getFileSymbolsFromCache(uri);;
		let retSymbols = docSymbals.searchMatchSymbal(symbolStr, searchMethod, range);
		return retSymbols;
	}

	public static getFileSymbolsFromCache(uri){
		let docSymbals = this.docSymbolMap.get(uri);
		if(!docSymbals){
			docSymbals = this.userPreloadSymbolMap.get(uri);
		}
		if(!docSymbals){
			docSymbals = this.luaPreloadSymbolMap.get(uri);
		}
		return docSymbals;
	}

	// 在[工作空间]查找符号, 主要用于模糊搜索。搜索文件顺序完全随机( isSearchPreload = false 全局符号模糊查找默认不展示预制变量)
	// useAlreadySearchList 是否使用已经搜索列表。需要使用一搜索列表的场景是 先进行了引用树搜素，之后进行全局搜索，为了避免重读降低效率，此项设置为true
	public static searchSymbolinWorkSpace(symbolStr: string, searchMethod: Tools.SearchMode = Tools.SearchMode.FuzzyMatching, searchRange: Tools.SearchRange = Tools.SearchRange.AllSymbols, isSearchPreload = false , useAlreadySearchList = false): Tools.SymbolInformation[] {
		if (symbolStr === '') {
			return [];
		}

		let retSymbols: Tools.SymbolInformation[] = [];
		for (let [ key , value] of this.docSymbolMap) {
			if(useAlreadySearchList){
				if(this.alreadySearchList[key]){
					continue;
				}
			}

			let docSymbals = value.searchMatchSymbal(symbolStr, searchMethod, searchRange);
			retSymbols = retSymbols.concat(docSymbals);
		}

		if(isSearchPreload){
			let preS = this.searchUserPreLoadSymbols(symbolStr, searchMethod);
			retSymbols = retSymbols.concat(preS);
			preS = this.searchLuaPreLoadSymbols(symbolStr, searchMethod);
			retSymbols = retSymbols.concat(preS);	
		}

		return retSymbols;
	}

	// 搜索全局变量的定义，查找顺序是本文件，引用树，全局
	// 不优先搜全局，不搜预制
	public static searchSymbolforGlobalDefinition (uri:string, symbolStr: string,  searchMethod: Tools.SearchMode = Tools.SearchMode.ExactlyEqual, searchRange: Tools.SearchRange = Tools.SearchRange.GlobalSymbols): Tools.SymbolInformation[] {
		if (symbolStr === '' || uri === '' ) {
			return [];
		}

		let retSymbols: Tools.SymbolInformation[] = [];
		//搜索顺序 用户 > 系统
		CodeSymbol.alreadySearchList = new Object(); // 记录已经搜索过的文件。避免重复搜索耗时
		let preS = this.recursiveSearchRequireTree(uri, symbolStr, searchMethod, searchRange);
		if(preS){
			retSymbols = retSymbols.concat(preS);
		}

		// 这里建议搜到了，就不查全局文件了，因为全局查找是无序的。 这里最好有一个记录措施，避免同一个文件被多次查找，降低效率。
		if(retSymbols.length === 0){
			// 全局查找, 不含预制文件
			let preS0 = this.searchSymbolinWorkSpace(symbolStr, searchMethod, Tools.SearchRange.GlobalSymbols, false, true);
			if(preS0){
				retSymbols = retSymbols.concat(preS0);
			}
		}
		return retSymbols;
	}

	// 在[本文件引用的其他文件]上搜索所有符合的符号，用于 [代码提示 auto completion]
	// 一定会搜全局，搜预制. 比较通用的一种方式，但是比较慢。（因为加入了预制搜索）
	public static searchSymbolforCompletion (uri:string, symbolStr: string,  searchMethod: Tools.SearchMode = Tools.SearchMode.PrefixMatch, searchRange: Tools.SearchRange = Tools.SearchRange.AllSymbols): Tools.SymbolInformation[] {
		if (symbolStr === '' || uri === '' ) {
			return [];
		}

		let retSymbols: Tools.SymbolInformation[] = [];
		//搜索顺序 用户 > 系统
		CodeSymbol.alreadySearchList = new Object();
		let preS = this.recursiveSearchRequireTree(uri, symbolStr, searchMethod, searchRange);
		if(preS){
			retSymbols = retSymbols.concat(preS);
		}

		// 全局, 含有预制文件
		let preS0 = this.searchSymbolinWorkSpace(symbolStr, searchMethod, Tools.SearchRange.AllSymbols, true, true);
		if(preS0){
			retSymbols = retSymbols.concat(preS0);
		}

		return retSymbols;
	}

//-----------------------------------------------------------------------------
//-- 私有方法
//-----------------------------------------------------------------------------		

	// 搜索预制lua符号
	private static searchLuaPreLoadSymbols(symbolStr, searchMethod){
		if(!symbolStr || symbolStr === ''){
			return [];
		}
		let retSymbols = new Array<Tools.SymbolInformation>();
		this.luaPreloadSymbolMap.forEach(element => {
			let res = element.searchMatchSymbal(symbolStr, searchMethod, Tools.SearchRange.GlobalSymbols);
			if(res.length > 0){
				retSymbols = retSymbols.concat(res);
			}
		});
		return retSymbols;
	}

	// 搜索用户预制符号
	private static searchUserPreLoadSymbols(symbolStr, searchMethod){
		if(!symbolStr || symbolStr === ''){
			return [];
		}
		let retSymbols = new Array<Tools.SymbolInformation>();
		this.userPreloadSymbolMap.forEach(element => {
			let res = element.searchMatchSymbal(symbolStr, searchMethod, Tools.SearchRange.GlobalSymbols);
			if(res.length > 0){
				retSymbols = retSymbols.concat(res);
			}
		});
		return retSymbols;
	}

	/**
	 * 重新分析文件后，根据require的文件的变动，更新本文件require的文件的reference，保留本文件的reference
	 * @param oldDocSymbol 上一次的docSymbol
	 * @param newDocSymbol 本次更新之后的docSymbol
	 */
	private static updateReference(oldDocSymbol: DocSymbolProcessor, newDocSymbol: DocSymbolProcessor) {
		if (!oldDocSymbol) {
			// 初次处理无需更新
			return;
		}
		// 保留本文件的reference（create的时候会被清空）
		newDocSymbol.setReferences(oldDocSymbol.getReferencesArray());

		let lastRequireFileArray = oldDocSymbol.getRequiresArray();
		let currentRequireFiles = newDocSymbol.getRequiresArray();

		// 以下requireFile的含义均为本文件require的其他文件
		lastRequireFileArray.forEach((lastRequireFile) => {
			// 本次代码改动删除之前的require语句，需要删除对应的reference关系
			let needDeleteReference = true;
			currentRequireFiles.forEach((currentRequireFile) => {
				if (currentRequireFile.reqName == lastRequireFile.reqName) {
					needDeleteReference = false;
					return;
				}
			});
			if (needDeleteReference) {
				let lastRequireFileUri = Tools.transFileNameToUri(lastRequireFile.reqName);
				if(lastRequireFileUri.length === 0) return;
				let lastRequireFileDocSymbol = this.docSymbolMap.get(lastRequireFileUri);
				let lastRequireFileReference = lastRequireFileDocSymbol.getReferencesArray();
				let index = lastRequireFileReference.indexOf(newDocSymbol.getUri());
				// 删除本文件require的文件对本文件的reference
				lastRequireFileReference.splice(index, 1);
			}
		});
	}

	// 创建某个lua文件的符号
	// @uri	 文件uri
	// @text  文件内容
	private static createDocSymbol(uri: string, luaText?: string){
		if(uri == null) return;
		if (luaText == undefined) {
			luaText = Tools.getFileContent(Tools.uriToPath(uri));
		}

		let oldDocSymbol = this.getFileSymbolsFromCache(uri);
		let newDocSymbol: DocSymbolProcessor = DocSymbolProcessor.create(luaText, uri);
		if(newDocSymbol){
			Tools.AddTo_FileName_Uri_Cache(Tools.getPathNameAndExt(uri)['name'] , uri)
			if( newDocSymbol.docInfo.parseSucc ){
				//解析无误，覆盖旧的
				this.docSymbolMap.set(uri, newDocSymbol);
				this.updateReference(oldDocSymbol, newDocSymbol);
			}else{
				//解析过程有误
				if ( !this.getFileSymbolsFromCache(uri) ){
					//map中还未解析过这个table，放入本次解析结果
					this.docSymbolMap.set(uri, newDocSymbol);
				}else{
					//map中已有, 且之前保存的同样是解析失败，覆盖
					if (!this.getFileSymbolsFromCache(uri).docInfo.parseSucc){
						this.docSymbolMap.set(uri, newDocSymbol);
						this.updateReference(oldDocSymbol, newDocSymbol);
					}
				}
			}
		}else{
			return;
		}
	}

	// 创建前置搜索文件的所有符号
	// @uri	 文件uri
	// @type  0lua预制 1用户导出
	private static createPreLoadSymbals(uri: string, type:number){
		let path = Tools.uriToPath(uri);
		let luaText = Tools.getFileContent(path);
		let docSymbol: DocSymbolProcessor = DocSymbolProcessor.create(luaText, uri);
		if(type === 0){
			this.luaPreloadSymbolMap.set(uri, docSymbol);
		}else{
			this.userPreloadSymbolMap.set(uri, docSymbol);
		}
	}

	private static deepCounter = 0;
	// 递归搜索 引用树，查找符号
	// @fileName 文件名
	// @symbolStr 符号名
	// @uri
	private static recursiveSearchRequireTree(uri: string, symbolStr, searchMethod :Tools.SearchMode, searchRange:Tools.SearchRange = Tools.SearchRange.AllSymbols, isFirstEntry:boolean = true){
		if(!uri || uri === ''){
			return [];
		}

		if(!symbolStr || symbolStr === ''){
			return [];
		}

		let retSymbArray = new Array<Tools.SymbolInformation>();

		if(isFirstEntry){
			// 首次进入
			this.deepCounter = 0;
		}else{
			//递归中
			this.deepCounter++;
			if(this.deepCounter >= 50){
				return retSymbArray;
			}
		}

		//如果 uri 的符号列表不存在，创建
		if (!this.docSymbolMap.has(uri)) {
			Logger.log("createDocSymbals : "+ uri);
			let luaText = CodeEditor.getCode(uri);
			this.createDocSymbol(uri, luaText);
		}
		//开始递归
		//如果uri所在文件存在错误，则无法创建成功。这里docProcesser == null
		let docProcessor = this.docSymbolMap.get(uri);
		if(docProcessor == null || docProcessor.getRequiresArray == null){
			Logger.log("get docProcessor or getRequireFiles error!");
			return [];
		}

		//当前文件已经在递归处理中了
		if(this.alreadySearchList[uri] == 1){
			return [];
		}else{
			this.alreadySearchList[uri] = 1;
		}

		// Logger.log("recursiveSearchRequireTree process :" + uri);
		// 在引用树上搜索符号，搜索的原则为优先搜索最近的定义，即先搜本文件，然后逆序搜索require的文件，再逆序搜索reference
		// 分析自身文件的符号.  本文件，要查找所有符号，引用文件，仅查找global符号。这里要求符号分析分清楚局部和全局符号
		let docS = this.docSymbolMap.get(uri);
		let retSymbols = docS.searchMatchSymbal(symbolStr, searchMethod, searchRange);
		if(retSymbols.length > 0){
			//找到了，查找全部符号，压入数组
			retSymbArray = retSymbArray.concat(retSymbols);
		}
		// 逆序搜索require
		let reqFiles = docProcessor.getRequiresArray();
		for(let idx = reqFiles.length -1; idx >= 0; idx--){
			let newuri = Tools.transFileNameToUri(reqFiles[idx]['reqName']);
			if(newuri.length === 0) return retSymbArray;
			let retSymbols = this.recursiveSearchRequireTree(newuri, symbolStr, searchMethod,  searchRange, false);
			if(retSymbols != null && retSymbols.length > 0){
				retSymbArray = retSymbArray.concat(retSymbols);
			}
		}
		// 逆序搜索reference
		let refFiles = docProcessor.getReferencesArray();
		for(let idx = refFiles.length -1; idx >= 0; idx--){
			let newuri = refFiles[idx];
			let retSymbols = this.recursiveSearchRequireTree(newuri, symbolStr, searchMethod,  searchRange, false);
			if (retSymbols != null && retSymbols.length > 0) {
				retSymbArray = retSymbArray.concat(retSymbols);
			}
		}
		return retSymbArray;
	}
}
