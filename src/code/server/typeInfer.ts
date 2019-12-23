// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

//这个文件中要处理的主要是tag类型查找
//包含 前缀的去除 ， 查找， 补回查找
import * as Tools from './codeTools';
import { CodeSymbol } from "./codeSymbol";

//类型推断文件
export class TypeInfer {
//-----------------------------------------------------------------------------
//-- 对外接口
//-----------------------------------------------------------------------------			
	private static retArray = []; //用来记录 Completion 和 Definition 返回数组
	private static startMS;

	private static maxSymbolCount = 20;
	// 定义查找接口
	// @symbolInfo 是符号名
	public static SymbolTagForDefinitionEntry(symbolInfo, uri){
		let symbolName = symbolInfo.name;
		this.retArray = [];
		this.startMS = Date.now();
		this.recursiveProcessSymbolTagForDefinition(uri, symbolName, [], true)
		return this.retArray;
	}

	// 代码补全接口
	// @searchPrefix 是一个字符串，标记要查找的用户输入，可以是不完全的比如 aactor.el...
	// 返回值是symbol数组
	public static SymbolTagForCompletionEntry(uri, searchPrefix){
		this.retArray = [];
		this.startMS = Date.now();
		this.recursiveProcessSymbolTagForCompletion(uri, searchPrefix, [], true)
		return this.retArray;
	}
	
	// 循环查tag for definition
	private static recursiveSearchTagForDefinition(element, uri, searchPrefix, tailListCache,  isStripping = true){
		// 找到tag对应的符号。 searchTag函数的本意是找到 findTagRetSymbArray[key] 这个符号的所有对应tag符号，以便继续的合并搜索
		let findoutArr = this.searchTag( element, uri, 0 ) || [];
		for (const value of findoutArr) {
			let uri = value.containerURI;
			//[尝试]向上补全, 所以补全这边的 tailListCache 要拷贝
			this.recursiveProcessSymbolTagForDefinition(uri, value.searchName, tailListCache, false);
			if(this.retArray.length === 0){
				this.recursiveSearchTagForDefinition(value, uri, searchPrefix, tailListCache, isStripping);
			}
		}
	}


	// 循环查tag for conpletion
	private static recursiveSearchTagForCompletion(element, uri, searchPrefix, tailListCache,  isStripping = true){
		// 找到tag对应的符号。 searchTag函数的本意是找到 findTagRetSymbArray[key] 这个符号的所有对应tag符号，以便继续的合并搜索
		let findoutArr = this.searchTag( element, uri, 1 ) || [];
		if (findoutArr.length > this.maxSymbolCount) findoutArr.length = this.maxSymbolCount;
		for (const value of findoutArr) {
			let uri = value.containerURI;
			//[尝试]向上补全, 所以补全这边的 tailListCache 要拷贝
			this.recursiveProcessSymbolTagForCompletion(uri, value.searchName, tailListCache, false);
			if(this.retArray.length === 0){
				this.recursiveSearchTagForCompletion(value, uri, searchPrefix, tailListCache, isStripping);
			}
		}
	}

//-----------------------------------------------------------------------------
//-- 私有方法
//-----------------------------------------------------------------------------		
// 定义查找的递归接口
	// @uri
	// @searchPrefix 搜索前缀，首次进入时传递用户输入的字符串
	// @tailListCache 用来在剥离时，记录被剥离后缀的数组
	// @isStripping 剥离模式/合并模式
	public static recursiveProcessSymbolTagForDefinition(uri, searchPrefix, tailListCache, isStripping = true){
		if(isStripping){
			if(this.startMS + 2000 < Date.now()) return;	//超时返回
			let searchPrefixArray = Tools.splitToArrayByDot(searchPrefix);
			for (let index = searchPrefixArray.length - 1; index >= 0; index--) {
				// 切断用户输入 a.b.c => [a,b,c], 拼接, 开始循环(每次pop一个成员){
				tailListCache.push(searchPrefixArray.pop());
				let SCHName = searchPrefixArray.join('.');
				// 先搜索本文件，如果找不到再搜索调用树
				let findTagRetSymbArray = this.searchMethodforDef(uri, SCHName); // 这里的搜索范围？
				// 没找到，继续pop循环
				if(!findTagRetSymbArray || findTagRetSymbArray.length == 0) continue;
				// 找到了。遍历查tag（循环）
				if(findTagRetSymbArray.length > this.maxSymbolCount) findTagRetSymbArray.length = this.maxSymbolCount; // 同一个符号，处理太多结果会很慢，这里限制数量20
				for (const key in findTagRetSymbArray) {
					let uri = findTagRetSymbArray[key].containerURI;
					this.recursiveSearchTagForDefinition(findTagRetSymbArray[key] , uri, searchPrefix, tailListCache, isStripping);
				}
			}
		}else{	
			// up
			// 从 tailListCache 取出变量忘 searchPrefix上拼接，并查找结果有没有符号，符号有没有tag
			let temptailCache = tailListCache.concat();
			let newName = searchPrefix + '.' + temptailCache.pop();
			let addPrefixSearchArray = this.searchMethodforComp(uri, newName, Tools.SearchMode.ExactlyEqual);// prefix search with no children
			if(addPrefixSearchArray.length > this.maxSymbolCount) addPrefixSearchArray.length = this.maxSymbolCount;
			for (const element of addPrefixSearchArray) {
				if(element.tagType){
					// TODO 如果有符号，有tag，切换成符号，递归
				}else{
					// 如果有符号，不论有无tag，继续合并
					if(temptailCache.length > 0){
						this.recursiveProcessSymbolTagForDefinition(uri, newName, temptailCache, false);
					}else{
						this.retArray.push(element);
					}
				}
			}
		}	
	}

	// 自动补全的递归接口
	// @uri
	// @searchPrefix 搜索前缀，首次进入时传递用户输入的字符串
	// @tailListCache 用来在剥离时，记录被剥离后缀的数组
	// @isStripping 剥离模式/合并模式
	public static recursiveProcessSymbolTagForCompletion(uri, searchPrefix, tailListCache, isStripping = true){
		// 防止循环遍历，记录[文件名] -- [符号名]
		if(isStripping){	
			if(this.startMS + 2000 < Date.now()) return;	//超时返回	
			let searchPrefixArray = Tools.splitToArrayByDot(searchPrefix);
			for (let index = searchPrefixArray.length - 1; index > 0; index--) {
				// 切断用户输入 a.b.c => [a,b,c], 拼接, 开始循环(每次pop一个成员){
				tailListCache.push(searchPrefixArray.pop());
				let SCHName = searchPrefixArray.join('.');
				// 先搜索本文件，如果找不到再搜索调用树
				let findTagRetSymbArray = this.searchMethodforComp(uri, SCHName); // 这里的搜索范围？
				// 没找到，继续pop循环
				if(!findTagRetSymbArray || findTagRetSymbArray.length == 0) continue;
				// 找到了。遍历查tag（循环）
				if(findTagRetSymbArray.length > this.maxSymbolCount) findTagRetSymbArray.length = this.maxSymbolCount; // 同一个符号，处理太多结果会很慢，这里限制数量20
				for (const key in findTagRetSymbArray) {
					let uri = findTagRetSymbArray[key].containerURI;
					this.recursiveSearchTagForCompletion(findTagRetSymbArray[key] , uri, searchPrefix, tailListCache, isStripping);
				}
			}
		}else{	
			// up
			// 从 tailListCache 取出变量忘 searchPrefix上拼接，并查找结果有没有符号，符号有没有tag
			let temptailCache = tailListCache.concat();
			let newName = searchPrefix + '.' + temptailCache.pop();
			let addPrefixSearchArray = this.searchMethodforComp(uri, newName, Tools.SearchMode.PrefixMatch);// prefix search with no children
			if(addPrefixSearchArray.length > this.maxSymbolCount) addPrefixSearchArray.length = this.maxSymbolCount;
			for (const element of addPrefixSearchArray) {
				if(element.tagType){
					// TODO 如果有符号，有tag，切换成符号，递归
				}else{
					// 如果有符号，不论有无tag，继续合并
					if(temptailCache.length > 0){
						this.recursiveProcessSymbolTagForCompletion(uri, newName, temptailCache, false);
					}else{
						this.retArray.push(element);
					}
				}
			}
			// 如果没有符号，结束
		}
	}

	private static searchMethodCommon(uri, SCHName , method = Tools.SearchMode.ExactlyEqual,operation) {
		if(operation === 0){
			return this.searchMethodforDef(uri, SCHName, method) || [];
		}else if(operation === 1){
			return this.searchMethodforComp(uri, SCHName, method)|| [];
		}
	}

	// 普通搜索, local => global, 用什么样的搜索方式ExactlyEqual ，在哪个范围（含预制）
	private static searchMethodforComp(uri, SCHName , method = Tools.SearchMode.ExactlyEqual){
		let findTagRetSymbArray = CodeSymbol.searchSymbolinDoc(uri , SCHName ,method);
		if (findTagRetSymbArray == null || (findTagRetSymbArray &&findTagRetSymbArray.length <= 0)){
			findTagRetSymbArray = CodeSymbol.searchSymbolforCompletion(uri ,SCHName, method, Tools.SearchRange.GlobalSymbols) || [];
		}
		return findTagRetSymbArray;
	}

	// 普通搜索, local => global, 用什么样的搜索方式ExactlyEqual ，在哪个范围（含预制）
	private static searchMethodforDef(uri, SCHName , method = Tools.SearchMode.ExactlyEqual){
		let findTagRetSymbArray = CodeSymbol.searchSymbolinDoc(uri , SCHName ,method);
		if (findTagRetSymbArray == null || (findTagRetSymbArray &&findTagRetSymbArray.length <= 0)){
			findTagRetSymbArray = CodeSymbol.searchSymbolforGlobalDefinition(uri ,SCHName, method, Tools.SearchRange.GlobalSymbols) || [];
		}
		return findTagRetSymbArray;
	}

	// 搜索tag
	// DEF = 0 comp = 1
	private static searchTag(element, uri, operation){
		let findoutSymbs;
		if(element.tagType && (element.tagReason === Tools.TagReason.UserTag || element.tagReason === Tools.TagReason.Equal) ){																//USERTag
			findoutSymbs = this.searchUserTag(uri, element, operation);
		}else if(element.tagType && element.tagReason == Tools.TagReason.MetaTable ){	
			findoutSymbs = this.searchMetaTable(uri, element, operation);
		}else if(element.requireFile && element.requireFile.length > 0){		// 符号源于文件返回值
			findoutSymbs = this.searchRequire(element);
		}else if(element.funcRets){		 // 符号源于函数返回值
			findoutSymbs = this.searchFunctionReturn(element);
		}else if(element.chunk && element.chunk.returnSymbol){
			let chunkRet  = element.chunk.returnSymbol;
			findoutSymbs = this.searchMethodCommon(uri ,chunkRet, Tools.SearchMode.ExactlyEqual, operation);
		}

		// 为了避免 local common = common 导致搜索到自己的定义，最终无限循环。
		for (const iterator in findoutSymbs) {
			if(findoutSymbs[iterator] === element){
				delete findoutSymbs[iterator];
				break;
			}
		}

		return findoutSymbs;
	}

	// 处理引用标记
	private static searchRequire(element){
		let beRequiredUri = Tools.transFileNameToUri(element.requireFile);
		if(beRequiredUri.length === 0) return;
		let beRequiredFilesRet = CodeSymbol.getOneDocReturnSymbol(beRequiredUri);
		if(beRequiredFilesRet && beRequiredFilesRet.length > 0){
			let searchReturnSymbolInBeReqFile = CodeSymbol.searchSymbolinDoc(beRequiredUri, beRequiredFilesRet, Tools.SearchMode.ExactlyEqual);
			return  searchReturnSymbolInBeReqFile;
		}
		return [];
	}

	private static searchFunctionReturn(element){
		let uri = element.containerURI;
		let searchName = element.funcRets.name;
		//优先本文件，之后调用树，在之后全工程。 应该封装对应的搜索接口
		let returnFuncList = CodeSymbol.searchSymbolinDoc(uri , searchName , Tools.SearchMode.ExactlyEqual);
		if (returnFuncList == null || ( returnFuncList && returnFuncList.length <= 0) ){
			returnFuncList = CodeSymbol.searchSymbolforCompletion(uri ,searchName ,Tools.SearchMode.ExactlyEqual);
		}		
		//
		let retrunSymbol = new Array();
		if(returnFuncList && returnFuncList.length > 0){
			// for (let index = 0; index < returnFuncList.length; index++) {
				// 遍历所有的函数，并在函数中查找返回类型
				const retFuncSymbol = returnFuncList[0];
				let chunks =CodeSymbol.getCretainDocChunkDic(retFuncSymbol.containerURI);
				if( chunks[retFuncSymbol.searchName] ){
					// 找到函数符号的
					let chunkRetSymbolName = chunks[retFuncSymbol.searchName].returnSymbol;
					//然后再chunk 所在文件，查找chunkRetSymbolName
					retrunSymbol = CodeSymbol.searchSymbolinDoc(uri , chunkRetSymbolName , Tools.SearchMode.ExactlyEqual);
					if (retrunSymbol == null || ( retrunSymbol && retrunSymbol.length <= 0) ){
						retrunSymbol = CodeSymbol.searchSymbolforCompletion(uri ,chunkRetSymbolName ,Tools.SearchMode.ExactlyEqual);
					}
					return retrunSymbol;
				}
			// }
		}else{
			//等式右边的符号无法被直接搜索到
		}

	}

	private static searchUserTag(uri, element, operation){
		let tag_type = element.tagType;
		if(tag_type){
			return this.searchMethodCommon(uri, tag_type, Tools.SearchMode.ExactlyEqual, operation);
		}else{
			return [];
		}
	}

	private static searchMetaTable(uri, element , operation){
		let tag_type = element.tagType + ".__index";
		if(tag_type){
			// 得到 a.__index 的符号
			let index_symbol = this.searchMethodCommon(uri, tag_type, Tools.SearchMode.ExactlyEqual, operation);
			for (const element of index_symbol) {
				if(!element.tagType){
					continue;
				}
				let searchName = element.tagType; // a.__index 对应的tag
				let tagRes = this.searchMethodCommon(element.containerURI, searchName, Tools.SearchMode.ExactlyEqual, operation);
				if(tagRes){
					return tagRes;
				}
			}
		}
		return [];
	}
}
