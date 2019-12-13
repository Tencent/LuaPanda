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

export class CodeSymbol {
	// 用 kv 结构保存所有用户文件以及对应符号结构（包含定义符号和AST，以及方法）
	public static docSymbolMap = new Map<string, DocSymbolProcessor>();
	public static luaPreloadSymbolMap = new Map<string, DocSymbolProcessor>();
	public static userPreloadSymbolMap = new Map<string, DocSymbolProcessor>();

	// 已处理文件列表，这里是防止循环引用
	private static alreadyProcessFile;


	public static getCretainDocChunkDic(uri){
		let processor = this.docSymbolMap.get(uri);
		if(processor){
			return processor.getChunksDic();
		}
	}
//-----------------------------------------------------------------------------
//-- 创建单文件、工作区、预加载区、特定文件符号
//-----------------------------------------------------------------------------	
	// 单文件内符号处理
	// 指定文件的符号 [单文件创建] | 无返回 . 如文档的符号已建立则直接返回
	public static createCertainDocSymbols(uri: string, luaText?: string) {
		if ( ! this.docSymbolMap.has(uri)) {
			this.refreshCertainDocSymbols(uri, luaText);
		}
	}

	// 指定文件的符号 [单文件刷新] | 无返回， 强制刷新
	public static refreshCertainDocSymbols(uri: string, luaText?: string) {
		if(luaText == undefined){
			luaText = CodeEditor.getCode(uri);
		}
		this.createDocSymbol(uri, luaText);
	}

	// 获取指定文件的所有符号 ,  并返回Array形式
	public static getCertainDocSymbolsReturnArray(uri: string, luaText?: string, range?:Tools.SearchRange): Tools.SymbolInformation[] {
		let docSymbals: Tools.SymbolInformation[] = [];
		this.createCertainDocSymbols(uri, luaText);
		switch(range){
			case Tools.SearchRange.GlobalSymbols:
				docSymbals = this.docSymbolMap.get(uri).getGlobalSymbolsArray(); break;
			case Tools.SearchRange.LocalSymbols:
				docSymbals = this.docSymbolMap.get(uri).getLocalSymbolsArray(); break;
			case Tools.SearchRange.AllSymbols:
				docSymbals = this.docSymbolMap.get(uri).getAllSymbolsArray(); break;
		}
		return docSymbals;
	}

	// 获取指定文件的所有符号 ,  并返回Dictionary形式
	public static getCertainDocSymbolsReturnDic(uri: string, luaText?: string, range?:Tools.SearchRange): Tools.SymbolInformation[] {
		let docSymbals: Tools.SymbolInformation[] = [];
		this.createCertainDocSymbols(uri, luaText);
		switch(range){
			case Tools.SearchRange.GlobalSymbols:
				docSymbals = this.docSymbolMap.get(uri).getGlobalSymbolsDic(); break;
			case Tools.SearchRange.LocalSymbols:
				docSymbals = this.docSymbolMap.get(uri).getLocalSymbolsDic(); break;
			case Tools.SearchRange.AllSymbols:
				docSymbals = this.docSymbolMap.get(uri).getAllSymbolsDic(); break;
		}
		return docSymbals;
	}	

	// 获取指定文件的返回值，如无返回null
	public static getCertainDocReturnValue(uri):string{
		this.createCertainDocSymbols(uri);
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
	public static createFolderDocSymbols(path: string){
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

	// 刷新指定文件夹中所有文件的符号 [批量刷新]
	public static refreshFolderDocSymbols(path: string){
		if(path === undefined || path === ''){
			return;
		}
		let filesArray = Tools.getDirFiles( path );
		filesArray.forEach(element => {
			this.createDocSymbol( element );
		});
	}

	// 刷新 PreLoad 所有文件的符号 [PreLoad批量刷新]
	// 0:lua  1:user
	public static refreshPreLoadSymbals(path: string, type: number = 1){
		if(path === undefined || path === ''){
			return;
		}
		let filesArray = Tools.getDirFiles( path );
		filesArray.forEach(pathElement => {
			this.createPreLoadSymbals( Tools.pathToUri(pathElement), type );
		});
	}

	// 刷新 PreLoad 单个文件的符号 [PreLoad刷新]
	// 0:lua  1:user
	public static refreshSinglePreLoadFile(filePath: string, type: number = 1){
		if(filePath === undefined || filePath === ''){
			return;
		}
		this.createPreLoadSymbals(Tools.pathToUri(filePath), type);
	}

	// 获取 workspace 中的全局符号, 以dictionary的形式返回
	public static getWorkspaceSymbols(range? : Tools.SearchRange){
		range = range || Tools.SearchRange.AllSymbols;
		let filesMap = Tools.get_FileName_Uri_Cache();
		let g_symb = {};

		for (const fileUri in filesMap) {
			let g_s = this.getCertainDocSymbolsReturnDic( filesMap[fileUri], null, range);
			for (const key in g_s) {
				const element = g_s[key];
				g_symb[key] = element;
			}
		}

		return g_symb;
	}

	// 获取Require文件中的全局符号（本文件引用的其他文件）, 以dictionary的形式返回 
	// public static getRequireTreeGlobalSymbols(uri: string){
	// 	if(uri === undefined || uri === ''){
	// 		return;
	// 	}

	// 	let fileList = this.getRequireTreeList(uri);
	// 	let g_symb = {};
	// 	for (let index = 0; index < fileList.length; index++) {
	// 		let g_s = this.getCertainDocSymbolsReturnDic( fileList[index], null, Tools.SearchRange.GlobalSymbols);
	// 		for (const key in g_s) {
	// 			const element = g_s[key];
	// 			g_symb[key] = element;
	// 		}
	// 	}
	// 	return g_symb;
	// }

	//reference处理
	public static searchSymbolReferenceinDoc(searchSymbol) {
		let uri = searchSymbol.containerURI;
		let docSymbals = this.docSymbolMap.get(uri);
		return docSymbals.searchDocSymbolReference(searchSymbol);
	}


//-----------------------------------------------------------------------------
//-- 搜索符号
//-----------------------------------------------------------------------------		
	// 在[工作空间]查找符号（模糊匹配，用作搜索符号）
	public static searchSymbolinWorkSpace(symbolStr: string, searchMethod: Tools.SearchMode, searchRange?: Tools.SearchRange): Tools.SymbolInformation[] {
		if (symbolStr === '') {
			return null;
		} else {
			let retSymbols: Tools.SymbolInformation[] = [];
			for (let [ , value] of this.docSymbolMap) {
				let docSymbals = value.searchMatchSymbal(symbolStr, searchMethod, searchRange);
				retSymbols = retSymbols.concat(docSymbals);
			}

			// 处理预制lua文件
			// let preS = this.searchPreLoadSymbols(symbolStr, searchMethod);
			// retSymbols = retSymbols.concat(preS);

			return retSymbols;
		}
	}

	//在[指定文件]查找符号（模糊匹配，用作搜索符号）
	// @return 返回值得到的排序:
	// 如果是Equal搜索，从dic中检索，按照AST深度遍历顺序返回
	public static searchSymbolinDoc(uri:string, symbolStr: string, searchMethod: Tools.SearchMode, range?:Tools.SearchRange): Tools.SymbolInformation[] {
		if (symbolStr === '' || uri === '' ) {
			return null;
		}
		let docSymbals = this.docSymbolMap.get(uri);
		let retSymbols = docSymbals.searchMatchSymbal(symbolStr, searchMethod, range);
		return retSymbols;
	}

	// 在[本文件引用的其他文件]上搜索所有符合的符号，用于 [代码提示 auto completion]
	public static searchAllSymbolinRequireTreeforCompleting (uri:string, symbolStr: string,  searchMethod: Tools.SearchMode): Tools.SymbolInformation[] {
		let retSymbols = [];
		if (symbolStr === '' || uri === '' ) {
			return null;
		}
		//搜索顺序 用户 > 系统
		CodeSymbol.alreadyProcessFile = new Object();
		let preS = this.recursiveSearchRequireTree(uri, symbolStr, searchMethod);
		if(preS){
			retSymbols = retSymbols.concat(preS);
		}

		let preS1 = this.searchUserPreLoadSymbols(symbolStr, searchMethod);
		if(preS1){
			retSymbols = retSymbols.concat(preS1);
		}

		let preS2 = this.searchLuaPreLoadSymbols(symbolStr, searchMethod);
		if(preS2){
			retSymbols = retSymbols.concat(preS2);
		}

		return retSymbols;
	}

	/**
	 * 向上遍历引用树，搜索全局变量定义（引用本文件的文件） |   这个方法主要适用于在引用树上查找全局变量
	 * 搜索的原则为在引用树上优先搜索最近的定义，即先搜本文件，然后逆序搜索require的文件，再逆序搜索reference
	 * @param symbolInfo    要搜索的符号名
	 * @param uri           查找的文件
	 * @param searchedFiles 标记已经搜索过的文件，上层调用该方法时可以不传
	 * @return              搜索结果，SymbolInformation数组
	 */
	public static searchGlobalInRequireTree(symbolName: string, uri: string ,  searchMethod: Tools.SearchMode , searchedFiles?: Map<string, boolean>, isFirstEntry?: boolean): Tools.SymbolInformation[] {
		if (searchedFiles == undefined) {
			searchedFiles = new Map<string, boolean>();
		}

		if(isFirstEntry == undefined){
			isFirstEntry = true;
		}

		let result: Tools.SymbolInformation[] = new Array<Tools.SymbolInformation>();

		// uri为空直接返回
		if (uri == "") {
			return result;
		}

		// 判断文件是否已搜索过
		if (searchedFiles.get(uri) == true) {
			return result;
		}
		// 在单个文件中搜索全局变量
		let docSymbol = this.docSymbolMap.get(uri);
		let searchResult;
		if(isFirstEntry){
			searchResult = docSymbol.searchMatchSymbal(symbolName, searchMethod, Tools.SearchRange.AllSymbols);
		}else{
			searchResult = docSymbol.searchMatchSymbal(symbolName, searchMethod, Tools.SearchRange.GlobalSymbols);
		}
		result = result.concat(searchResult);
		searchedFiles.set(uri, true);

		let requireFiles = this.docSymbolMap.get(uri).getRequiresArray();
		let references = this.docSymbolMap.get(uri).getReferencesArray();

		// 搜索的原则为在引用树上优先搜索最近的定义，即先搜本文件，然后逆序搜索require的文件，再逆序搜索reference
		// 搜索require的文件
		for (let i = requireFiles.length - 1; i >= 0; i--) {
			let searchResult = this.searchGlobalInRequireTree(symbolName, Tools.transFileNameToUri(requireFiles[i].reqName), searchMethod, searchedFiles, false);
			result = result.concat(searchResult);
		}
		// 搜索require本文件的文件(references)
		for (let i  = references.length - 1; i >= 0; i--) {
			let searchResult = this.searchGlobalInRequireTree(symbolName, references[i], searchMethod, searchedFiles, false);
			result = result.concat(searchResult);
		}

		return result;
	}

	//在预制文档中搜索
	public static searchLuaPreLoadSymbols(symbolStr, searchMethod){
		let retSymbols = new Array<Tools.SymbolInformation>();
		this.luaPreloadSymbolMap.forEach(element => {
			let res = element.searchMatchSymbal(symbolStr, searchMethod, Tools.SearchRange.AllSymbols);
			if(res.length > 0){
				retSymbols = retSymbols.concat(res);
			}
		});
		return retSymbols;
	}

	public static searchUserPreLoadSymbols(symbolStr, searchMethod){
		let retSymbols = new Array<Tools.SymbolInformation>();
		this.userPreloadSymbolMap.forEach(element => {
			let res = element.searchMatchSymbal(symbolStr, searchMethod, Tools.SearchRange.AllSymbols);
			if(res.length > 0){
				retSymbols = retSymbols.concat(res);
			}
		});
		return retSymbols;
	}

	//查找符合某一深度的符号
	public static selectSymbolinCertainContainer(symbolList, containerList){
		if(!symbolList) return;
		let retSymoblList = new Array();
		for (let index = 0; index < symbolList.length; index++) {
			const symbol = symbolList[index];
			if(symbol.containerList.length == containerList.length){
				for (let containerIdx = 0; containerIdx < containerList.length; containerIdx++) {
					if(containerList[containerIdx] != symbol.containerList[containerIdx]){
						//出现层级不相等
						break;
					}
					if(containerIdx == containerList.length - 1){
						//深度相等
						retSymoblList.push(symbol);
					}
				}
			}
		}
		return retSymoblList;
	}
//-----------------------------------------------------------------------------
//-- 私有方法
//-----------------------------------------------------------------------------		

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
	private static createDocSymbol(uri: string, luaText?: string): Tools.SymbolInformation[] {
		if(uri == null) return null;
		if (luaText == undefined) {
			luaText = Tools.getFileContent(Tools.uriToPath(uri));
		}

		let oldDocSymbol = this.docSymbolMap.get(uri);
		let newDocSymbol: DocSymbolProcessor = DocSymbolProcessor.create(luaText, uri);
		if(newDocSymbol){
			Tools.AddTo_FileName_Uri_Cache(Tools.getPathNameAndExt(uri)['name'] , uri)
			if( newDocSymbol.docInfo.parseSucc ){
				//解析无误，覆盖旧的
				this.docSymbolMap.set(uri, newDocSymbol);
				this.updateReference(oldDocSymbol, newDocSymbol);
			}else{
				//解析过程有误
				if ( !this.docSymbolMap.get(uri) ){
					//map中还未解析过这个table，放入本次解析结果
					this.docSymbolMap.set(uri, newDocSymbol);
				}else{
					//map中已有, 且之前保存的同样是解析失败，覆盖
					if (!this.docSymbolMap.get(uri).docInfo.parseSucc){
						this.docSymbolMap.set(uri, newDocSymbol);
						this.updateReference(oldDocSymbol, newDocSymbol);
					}
				}
			}
		}else{
			return null;
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

	// 获取某个文件的引用树列表
	// private static getRequireTreeList(uri: string){
	// 	if(uri === undefined || uri === ''){
	// 		return;
	// 	}

	// 	function recursiveGetRequireTreeList(uri: string, fileList: string[]){
	// 		if(uri === undefined || uri === ''){
	// 			return;
	// 		}
	// 		// 如果 uri 的符号列表不存在，创建
	// 		if (!CodeSymbol.docSymbolMap.has(uri)) {
	// 			Logger.log("createDocSymbals : "+ uri);
	// 			let luaText = CodeEditor.getCode(uri);
	// 			CodeSymbol.createDocSymbol(uri, luaText);
	// 		}

	// 		//如果uri所在文件存在错误，则无法创建成功。这里docProcesser == null
	// 		let docProcesser = CodeSymbol.docSymbolMap.get(uri);
	// 		if(docProcesser == null || docProcesser.getRequiresArray == null){
	// 			Logger.log("get docProcesser or getRequireFiles error!");
	// 			return;
	// 		}

	// 		//当前文件已经在递归处理过了
	// 		if(alreadyProcessFile[uri] == 1){
	// 			return;
	// 		}else{
	// 			alreadyProcessFile[uri] = 1;
	// 		}

	// 		let reqFiles =  docProcesser.getRequiresArray();
	// 		for(let idx = 0, len = reqFiles.length ; idx < len ; idx++ ){
	// 			let newuri =  Tools.transFileNameToUri(reqFiles[idx]['reqName'])
	// 			recursiveGetRequireTreeList(newuri, fileList);
	// 		}
	// 		fileList.push(uri);
	// 		return fileList;
	// 	}

	// 	let fileList = new Array<string>();
	// 	let alreadyProcessFile = new Object(); //防止循环引用
	// 	recursiveGetRequireTreeList(uri, fileList);
	// 	return fileList;
	// }


	private static deepCounter = 0;
	// 递归搜索 引用树，查找符号
	// @fileName 文件名
	// @symbolStr 符号名
	// @uri
	private static recursiveSearchRequireTree(uri: string, symbolStr, searchMethod :Tools.SearchMode, isFirstEntry?:boolean){
		if(uri === undefined || uri === ''){
			return;
		}

		let retSymbArray = new Array<Tools.SymbolInformation>();

		if(isFirstEntry == undefined){
			// 首次进入
			isFirstEntry = true;
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
			return;
		}

		//当前文件已经在递归处理中了
		if(this.alreadyProcessFile[uri] == 1){
			return;
		}else{
			this.alreadyProcessFile[uri] = 1;
		}

		// Logger.log("recursiveSearchRequireTree process :" + uri);
		// 在引用树上搜索符号，搜索的原则为优先搜索最近的定义，即先搜本文件，然后逆序搜索require的文件，再逆序搜索reference
		// 分析自身文件的符号.  本文件，要查找所有符号，引用文件，仅查找global符号。这里要求符号分析分清楚局部和全局符号
		let docS = this.docSymbolMap.get(uri);
		let retSymbols = docS.searchMatchSymbal(symbolStr, searchMethod, Tools.SearchRange.AllSymbols);
		if(retSymbols.length > 0){
			//找到了，查找全部符号，压入数组
			retSymbArray = retSymbArray.concat(retSymbols);
		}
		// 逆序搜索require
		let reqFiles = docProcessor.getRequiresArray();
		for(let idx = reqFiles.length -1; idx >= 0; idx--){
			let newuri = Tools.transFileNameToUri(reqFiles[idx]['reqName']);
			let retSymbols = this.recursiveSearchRequireTree(newuri, symbolStr, searchMethod, false);
			if(retSymbols != null && retSymbols.length > 0){
				retSymbArray = retSymbArray.concat(retSymbols);
			}
		}
		// 逆序搜索reference
		let refFiles = docProcessor.getReferencesArray();
		for(let idx = refFiles.length -1; idx >= 0; idx--){
			let newuri = refFiles[idx];
			let retSymbols = this.recursiveSearchRequireTree(newuri, symbolStr, searchMethod, false);
			if (retSymbols != null && retSymbols.length > 0) {
				retSymbArray = retSymbArray.concat(retSymbols);
			}
		}
		return retSymbArray;
	}
}
