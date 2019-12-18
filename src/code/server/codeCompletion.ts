// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

import { CodeEditor } from './codeEditor';
import  * as Tools  from "./codeTools";
import {
	CompletionItem,
	CompletionItemKind,
	InsertTextFormat,
	Position
} from 'vscode-languageserver';
// import { Logger } from './codeLogManager';
import { CodeSymbol } from "./codeSymbol";
import { CodeDefinition } from './codeDefinition';
import { TypeInfer } from './typeInfer';
import { isArray } from 'util';

export class CodeCompletion {
	//代码补全入口文件
	public static completionEntry(uri : string, pos: Position): CompletionItem[]{
		// 获取用户输入的前缀
		let luaText = CodeEditor.getCode(uri);
		let userInputString = Tools.getTextByPosition(luaText , pos);
		// 处理注释
		if (userInputString == "---") {
			let completingArray = this.completionComment(uri, pos, luaText);
			return completingArray;
		}
		
		// 后面的查找分为几方面
		// 1. 用户输入a.Com时，去除全面的a. 对Com进行一次补全 适用于：self.transform:Find("showloading"):GetComponent("Button");  是否应该当用户输入中有:时才做？
		// 2. 用户输入a.Com时，分析a的tag，得到可能的Com值（推导）
		// 3. 用户输入的代码没有.:时，不用进行tag搜过

		// 如果用输入的代码不含.:  那么不用进行tag搜索，只需要进行一次普通遍历（包含用户代码，用户导出代码，lua代码）
		// 如果用输入的代码含有.:  那么先对用户输入信息做一次普通搜索 | 对于分隔符之前的，做tag搜索 | 取得最后一个分隔符之后的数据，进行一次普通遍历
		
		let userInputSplitArr = this.splitStringwithTrigger(userInputString); //userInputSplitArr 用户输入的字符串
		// 先对用户的全输入做一次普通检索
		let commonSearchRes = [];
		commonSearchRes = commonSearchRes.concat(this.commonCompletionSearch(uri, userInputString) || []) ; // TODO 这里搜索的范围应该是用户代码， 预制文件， lua预制文件
		// 之后准备分段处理，检索tag
		if(userInputSplitArr && userInputSplitArr.length === 1){
			//用户只输入了一段，上面已经检索过了
		}else if(userInputSplitArr && userInputSplitArr.length > 1){
			// let lastprefix = userInputSplitArr.pop();	//最后一位
			// tagprefix = userInputSplitArr.join('.');  //出去最后一位之前的部分	
			// 对tagprefix使用tag搜索
			// this.searchTagEntry(tagprefixArray[0], userInputString, uri, 99);
			// let indexarr = TypeInfer.processCompleting(tagprefix ,uri);

			// 如有结果，返回结果，如无结果，使用预制（lua预制和用户预制）
			// let lastPrefixSearchRet = this.commonCompletionSearch(uri, lastprefix) || [];	//用户输入了多段，这里是否用该只进入用户预制搜索？
			// commonSearchRes = commonSearchRes.concat(lastPrefixSearchRet);

			if(commonSearchRes.length === 0){
				let lastPrefixSearchRet = TypeInfer.SymbolTagForCompletionEntry(uri, userInputString) || [];
				lastPrefixSearchRet = this.keepSuffix(lastPrefixSearchRet);
				commonSearchRes = commonSearchRes.concat(lastPrefixSearchRet);
			}else{
				//common 去除前缀
				commonSearchRes = commonSearchRes.concat(this.keepSuffix(commonSearchRes));
			}
		}

		// 处理搜索到的符号
		let retCompletionArray = this.symbolToCompletionArray(commonSearchRes);
		let retCompleteItem = this.completeItemDuplicateRemoval(retCompletionArray);
		return retCompleteItem;
	}

	// 仅保留后缀
	private static keepSuffix(symbolsArray) {
		for (const key in symbolsArray) {
			const element = symbolsArray[key];
			let userInputSplitArr = this.splitStringwithTrigger(element.searchName);
			element.searchName = userInputSplitArr.pop();	
		}
		return symbolsArray;
	}	


	private static fmtParamToSnippet(paramArray: string[]): string {
		let snippet = '(' + paramArray.map((param, i) => `\${${i + 1}:${param}}`).join(', ') + ')';
		return snippet;
	}

	private static getDocCommentInsertText(functionName: string, paramArray: string[]): string {
		let docCommentSnippet = " " + functionName + " ${1:Description of the function}";

		let maxParamLength = 0;
		paramArray.forEach((param) => {
			maxParamLength = Math.max(maxParamLength, param.length);
		});

		let i = 2;
		paramArray.forEach((param) => {
			param += Tools.getNSpace(maxParamLength - param.length);
			docCommentSnippet += `\n-- @param ${param} \${${i++}:Describe the parameter}`;
		});

		return docCommentSnippet;
	}

	private static getDocCommentCompletingItem(uri: string, line: number): CompletionItem {
		let functionInfo = CodeDefinition.getFunctionInfoByLine(uri, line);
		if (functionInfo.functionName == "") {
			return null;
		}

		let completeItem = {
			label: functionInfo.functionName + " doc comment",
			kind: CompletionItemKind.Snippet,
			insertText: this.getDocCommentInsertText(functionInfo.functionName, functionInfo.functionParam),
			detail: "Write some document comments for the function.",
			insertTextFormat: InsertTextFormat.Snippet
		};
		return completeItem;
	}

	private static commentVarTypeTips(uri: string, line: number): CompletionItem {
		//TODO 这里要加入判断一下本行有没有数据
		let completeItem = {
			label: "@type",
			kind: CompletionItemKind.Snippet,
			insertText: "@type ",
			detail: "comment var type",
			insertTextFormat: InsertTextFormat.Snippet
		};
		return completeItem;
	}

	//把字符串按. 或者 ： 分割成数组。若不含: . 则数组中只有一个元素
	private static splitStringwithTrigger(str){
		let userInputTxt_DotToBlank =  str.replace(/[\.:]/g, ' ');
		let userInputArr = userInputTxt_DotToBlank.split(' ');
		return userInputArr;
	}

	private static symbolToCompletionArray(retSymb){
		if (!isArray(retSymb)) {
			return [];
		}

		let completingArray = [];
		for (let idx = 0; idx < retSymb.length; idx++) {
		
			let finalInsertText = retSymb[idx].searchName;
			let completeKind : CompletionItemKind
			let labelTxt = finalInsertText;
			switch(retSymb[idx].kind){
				case 12:
					completeKind = CompletionItemKind.Function;
					finalInsertText = finalInsertText + this.fmtParamToSnippet(retSymb[idx].funcParamArray);
					break;
				default:
					completeKind = CompletionItemKind.Text;
			}
	
			let completeItem = {
				label: labelTxt,
				kind: completeKind,
				insertText: finalInsertText,
				detail : retSymb[idx].name,
				insertTextFormat: InsertTextFormat.Snippet
			}
			if(completeItem.label == undefined){
				completeItem.label = "error undefined!";
			}else{
				completingArray.push(completeItem);
			}	
		}
		return completingArray;
	}
	

	// 普通搜索。这里返回的必须是一个数组，哪怕是一个空数组
	private static commonCompletionSearch(uri, searchPrefix){
		//searchAllSymbolinRequireTreeforCompleting这个实际搜索函数中，应该包含数量控制逻辑
		let retSymb = CodeSymbol.searchSymbolforCompletion(uri, searchPrefix, Tools.SearchMode.PrefixMatch);
		if(!isArray(retSymb)){
			return [];
		}
		return retSymb;
	}

	// 用户输入了--- , 生成注释
	private static completionComment(uri, pos, luaText){
		let completingArray  = new Array<CompletionItem>();
		if (Tools.isNextLineHasFunction(luaText, pos) == true) {
			completingArray.push(this.getDocCommentCompletingItem(uri, pos.line + 1));
		}
		completingArray.push(this.commentVarTypeTips(uri, pos.line));
		return completingArray;
	}

	//消除重复的符号
	private static completeItemDuplicateRemoval(completingArray){
		let retCompItemList = new Array();
		for (let index = 0; index < completingArray.length; index++) {
			let DuplicateFlag = false;
			const completeItem = completingArray[index];
			for (let retIdx = 0, len = retCompItemList.length; retIdx < len; retIdx++) {
				if( this.ItemIsEq( completeItem, retCompItemList[retIdx] ) ){
					DuplicateFlag = true;
					break;
				}
			}
			if(! DuplicateFlag ){
				retCompItemList.push(completeItem);	
			}
		}
		return retCompItemList;
	}

	//判断CompleteItem是否相等
	private static ItemIsEq(item1, item2):boolean{
		if(item1.label === item2.label &&
			item1.kind ===  item2.kind &&
			item1.insertText ===  item2.insertText &&
			item1.insertTextFormat ===  item2.insertTextFormat ){
				return true;
			}
			return false;
	}

}
