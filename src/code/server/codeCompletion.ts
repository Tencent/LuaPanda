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
	// 代码补全入口函数
	public static completionEntry(uri : string, pos: Position): CompletionItem[]{
		// 获取用户输入的前缀
		let luaText = CodeEditor.getCode(uri);
		let userInputString = Tools.getTextByPosition(luaText , pos);
		// 处理注释
		if (userInputString == "---") {
			let completingArray = this.completionComment(uri, pos, luaText);
			return completingArray;
		}

		userInputString = userInputString.replace(/:/g,"."); //因为chunk，符号列表中的: 都被转换为 . 这里也要转换，否则查不到
		// 先对[用户的完整输入]做一次[直接搜索]
		let searchResArray = this.commonCompletionSearch(uri, userInputString) || [];  // 这里搜索的范围应该是用户代码， 所有预制文件
		// 如果用户输入字段中含有分隔符[.:], 准备分段处理,检索tag
		let userInputSplitArr = this.splitStringwithTrigger(userInputString); //userInputSplitArr 用户输入的字符串
		if(userInputSplitArr && userInputSplitArr.length > 1){
			if(searchResArray.length === 0){
				// 使用类型推导
				let lastPrefixSearchRet = TypeInfer.SymbolTagForCompletionEntry(uri, userInputString) || [];
				if(lastPrefixSearchRet.length > 0){
					lastPrefixSearchRet = this.keepSuffix(lastPrefixSearchRet);
				}else{
					// 类型推导也没有搜索到的处理方式  -STUART TODO-  使用最后一个字符直接搜索是否有必要？
					// let lastPrefix = Tools.splitToArrayByDot(userInputString).pop();
					// if(lastPrefix != ''){
					// 	lastPrefixSearchRet = this.commonCompletionSearch(uri, lastPrefix) || [];
					// }
				}
				searchResArray = searchResArray.concat(lastPrefixSearchRet);
			}else{
				// 把带有分隔符，的直搜结果去除前缀，仅保留要补全的后缀
				searchResArray = searchResArray.concat(this.keepSuffix(searchResArray));
			}
		}

		// 处理搜索到的符号
		let retCompletionArray = this.symbolToCompletionArray(searchResArray);
		let retCompleteItem = this.completeItemDuplicateRemoval(retCompletionArray);
		return retCompleteItem;
	}

	// 把用户输入的前缀去除，仅保留要补全的后缀
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

	// 把符号数组转换为VSCode能够识别的补全数组
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

	// 删除重复的符号
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
