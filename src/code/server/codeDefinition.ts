// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

import {
	Location,
	TextDocumentPositionParams,
	SymbolKind
} from 'vscode-languageserver';
import { Logger } from './codeLogManager';
import { CodeSymbol } from "./codeSymbol";
import { TypeInfer } from "./typeInfer"
import  * as Tools  from "./codeTools";
import { isArray } from 'util';

//查找定义的主函数
export class CodeDefinition {
	public static getSymbalDefine(info: TextDocumentPositionParams, isRetSymbol?) {
		isRetSymbol = isRetSymbol || false;
		Tools.transPosStartLineTo1(info.position);
		//获取指定文件的doc信息容器
		let uri = info.textDocument.uri;
		let astContainer = CodeSymbol.docSymbolMap.get(uri);
		if(!astContainer){
			Logger.InfoLog("[Error] getSymbalDefine can’t find AST");
			return null;
		}
		// 根据VSCode提供的符号位置查询查号名
		let symbRet = astContainer.searchDocSymbolfromPosition(info.position);
		//全局查找定义
		if (symbRet != undefined && symbRet['sybinfo'] != undefined) {
			let symbolInfo = symbRet['sybinfo'];
			let containerList = symbRet['container'];
			//先做一次普通搜索，如果有结果，就以普通搜索结果优先
			let symbInstance = this.commonSearch(uri, symbolInfo.name, Tools.SearchMode.ExactlyEqual);
			if(isArray(symbInstance) && symbInstance.length > 0 ){
				// 已经搜到了结果
			}else{
				symbInstance = TypeInfer.SymbolTagForDefinitionEntry(symbolInfo, uri); // 查找定义
			}

			if(!symbInstance || symbInstance.length == 0) return;			// 未能查到定义			
			Tools.transPosStartLineTo0(info.position);
			let finalRetSymbols;
			if(symbolInfo.isLocal){
				// 同级优先，上方最近
				finalRetSymbols = this.judgeLocalDefinition(symbInstance, containerList, info);
			}else{
				// 最远原则
				finalRetSymbols = symbInstance[0];
			}
			
			// 此处应该保证 symbInstance是一个实例（不是数组）
			if( !finalRetSymbols )	return;   //没找到，或过滤后没有适合的符号
			if(isRetSymbol) return finalRetSymbols;	//回传符号，而不是位置信息
			let retLoc = Location.create(finalRetSymbols['containerURI'], finalRetSymbols['location'].range);
			return retLoc;
		} else {
			//没找到符号，判断require文件的情况
			let reqFileName  = astContainer.searchDocRequireFileNameFromPosition(info.position);
			let uri = Tools.transFileNameToUri(reqFileName);
			if(uri.length > 0){
				return Tools.createEmptyLocation(uri);
			}
			return;
		}
	}

	private static commonSearch(uri, symbolStr, method){
		//做一次普通搜索
		return CodeSymbol.searchSymbolforGlobalDefinition(uri, symbolStr, method);
	}

//-----------------------------------------------------------------------------
//-- 局部变量的处理
//-----------------------------------------------------------------------------	
	// 得到了多个 symbInstance，要判断那个是目标。 这个函数只处理局部变量，全局变量按照引用树只搜索出一个结果，无需判断
	// @symbArray 		match的symb数组 
	// @findoutSymbols    找到的定义信息
	// @containerList 		  被查找信息的深度
	// @docPosition      vscode获取的位置
	//函数要求，可能传入1到多个符号，返回最符合的1个符号. 先比较container , 查出所有本层/上层定义，之后找同层最近的，没有则向上
	private static judgeLocalDefinition(findoutSymbols, containerList, docPosition) {
		// let userClickLine = docPosition.position.line;
		if( !findoutSymbols ||  findoutSymbols.length <= 0 || !docPosition || !containerList || containerList.length <= 0)	return;
		

		if(findoutSymbols.length == 1) return findoutSymbols[0];
		//查出所有findoutSymbols的共同深度，数字越大共同深度越多，不在一个chunk中是-1
		let commonDepth  = this.findCommonDepth(containerList, findoutSymbols);
		//找出共同深度最大值
		let maxComDep = 0; //最大相同深度
		for (let index = 0; index < commonDepth.length; index++) {
			if (maxComDep < commonDepth[index]){
				maxComDep = commonDepth[index];
			}
		}

		let maxArray = new Array(); 
		for (let index = 0; index < commonDepth.length; index++) {
			if (maxComDep == commonDepth[index]){
				maxArray.push(findoutSymbols[index]);
			}
		}
		//此时maxArray中记录了共同深度最大的符号
		if(maxArray.length == 1){
			return maxArray[0];
		}
		//findUpNearestSymbol 的作用是寻找line在上方并最近的符号
		return this.findUpNearestSymbol(docPosition.position, maxArray);
	}

	//查找上方最近的符号
	public static findUpNearestSymbol(docPosition,  maxArray){
		let distanceLineNumber = new Array();
		let standardLine = docPosition.line;
		// 使用standardLine - upLine得到符号差值，这个值如果为负，忽略。
		// 差值越小离得越近
		for (const key in maxArray) {
				const element = maxArray[key];
				let upLine = element.location.range.start.line;
				distanceLineNumber[key]  =  standardLine - upLine; //数值越小越好
		}

		//寻找最小差值
		let minComDep = 99999;
		for (let index = 0; index < distanceLineNumber.length; index++) {
			if (distanceLineNumber[index] < minComDep && distanceLineNumber[index] >= 0){
				minComDep = distanceLineNumber[index];
			}
		}

		let minSymbolIdx;
		for (let index = 0; index < distanceLineNumber.length; index++) {
			if (minComDep == distanceLineNumber[index]){
				minSymbolIdx = index;
				break;
			}
		}

		return maxArray[minSymbolIdx];
	}

	//查找符号的共同深度 , 当不在同一个chunk时返回-1 ， 数字表示相同的chunk数
	//standradDepth被查找的符号深度
	//beFindSymbolList找到的定义深度
	public static findCommonDepth( standradDepth , beFindSymbolList){
		let retArray = new Array();

		//评估各个符号和标准深度的相同深度
		for (const key in beFindSymbolList) {
			const element = beFindSymbolList[key];

			//定义深度 > 被查找元素深度
			if (standradDepth.length < element.containerList.length) {
				retArray[key] = -1;
				continue;
			}		
			//遍历一个具体的待查找深度
			for (let index = 0; index < standradDepth.length; index++) {
				let standardChunk = standradDepth[index];
				let beAnalyzeDepth = element.containerList[index];
				if (standardChunk && beAnalyzeDepth &&standardChunk.chunkName == beAnalyzeDepth.chunkName && standardChunk.loc.start.line ==  beAnalyzeDepth.loc.start.line && standardChunk.loc.end.line ==  beAnalyzeDepth.loc.end.line){
					retArray[key] = index + 1;
				}else{
					if(standardChunk && !beAnalyzeDepth){

					}else{
						retArray[key] = -1;
					}
				}
			}
		}
		//如果有多个最大值，对比
		return retArray;
	}


	// 按行号查询function
	public static getFunctionInfoByLine(uri: string, line: number): { functionName: string, functionParam: string[] } {
		let displaySymbolArray = CodeSymbol.getOneDocSymbolsArray(uri, null, Tools.SearchRange.AllSymbols);
		let result = { functionName: "", functionParam: [] };
		for (const key in displaySymbolArray) {
			const docDisplaySymbol = displaySymbolArray[key];
			if (docDisplaySymbol.kind == SymbolKind.Function && docDisplaySymbol.location.range.start.line == line) {
				result.functionName = docDisplaySymbol.searchName;
				result.functionParam = docDisplaySymbol.funcParamArray;
				return result;
			}			
		}
		return result;
	}
}