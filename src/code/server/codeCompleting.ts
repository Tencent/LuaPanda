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

export class CodeCompleting {
	private static maxSearchLen = 100;	//类型搜索时处理的最大数量
	private static replaceDic;	//记录用作替换的searchName ,保证搜索的tag最后能转回用户输入
	private static alreadychkSymbol;	//记录搜索过的关键字，防止循环搜索

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

	//把字符串按. 或者 ： 分割成数组。若不含: . 则数组中只有一个元素
	private static splitStringwithTrigger(str){
		let userInputTxt_DotToBlank =  str.replace(/[\.:]/g, ' ');
		let userInputArr = userInputTxt_DotToBlank.split(' ');
		return userInputArr;
	}

	// 根据tag类型修改查找值
	private static searchTag( addElement, prefix, completingArray, uri) {
		// 防止循环搜索
		if(this.alreadychkSymbol[addElement.searchName]){
			return;
		}
		this.alreadychkSymbol[addElement.searchName] = true;

		//若 retSymb[idx] 有tag
		let searchName = addElement.searchName ;
		if(addElement.tagReason == Tools.TagReason.UserTag || addElement.tagReason == Tools.TagReason.Equal){
			// 用户标记 / 等号标记
			searchName = addElement.tagType;
			this.realSearchTag(addElement, prefix, completingArray, uri, searchName)
		}
		
		if(addElement.tagReason == Tools.TagReason.MetaTable){
			//元表标记
			searchName = addElement.tagType + ".__index";
			this.realSearchTag(addElement, prefix, completingArray, uri, searchName);
		}

		// 符号 = 文件返回值
		if(addElement.requireFile && addElement.requireFile.length > 0){
			let uri = Tools.transFileNameToUri(addElement.requireFile);
			let retTag = CodeSymbol.getCertainDocReturnValue(uri);//类似于使用@type得到的类型
			if(retTag && retTag.length > 0){
				searchName = retTag;
			}
			this.realSearchTag(addElement, prefix, completingArray, uri, searchName);
		}

		//函数返回值
		if(addElement.funcRets){
			searchName = addElement.funcRets.name;
			this.realSearchTag(addElement, prefix, completingArray, uri, searchName, true);
		}
	}

	// 真正做tag查找的位置
	private static realSearchTag(addElement, prefix, completingArray, uri, searchName, isAllowNoPrefixEQ?) {
		let finalInsertText;
		//如果有tagtype, 再去符号表中查找tagtype
		let tagSearchRetSymb;
		if(  addElement.requireFile ){
			//含有引用 tag，只搜索引用文件的符号
			let uri = Tools.transFileNameToUri( addElement.requireFile );
			tagSearchRetSymb = CodeSymbol.searchSymbolinDoc(uri, searchName, Tools.SearchMode.FirstLetterContinuousMatching);
		}else if(addElement.funcRets){
			//含有func 返回，搜索对应函数
			let funcSearchRet = CodeSymbol.searchAllSymbolinRequireTreeforCompleting( uri , searchName, Tools.SearchMode.ExactlyEqual);
			let retName = ''
			for (let index = 0; index < funcSearchRet.length; index++) {
				const element = funcSearchRet[index];
				if( element['chunk'] && element['chunk']['returnSymbol']){
					retName = element['chunk']['returnSymbol'];
					break;
				}
			}

			tagSearchRetSymb = CodeSymbol.searchSymbolinDoc(uri, retName, Tools.SearchMode.FirstLetterContinuousMatching);
			if(tagSearchRetSymb && tagSearchRetSymb.length > 0){
				searchName = retName;
			}

		}else{
			tagSearchRetSymb = CodeSymbol.searchGlobalInRequireTree(searchName, uri, Tools.SearchMode.FirstLetterContinuousMatching );
		}
		if( !tagSearchRetSymb || tagSearchRetSymb.length < 1 ){
			//当直接替换tag查不到的时候，用一次类型推导
			tagSearchRetSymb = TypeInfer.processCompleting(searchName, uri);
			if(tagSearchRetSymb && tagSearchRetSymb.length > 0){
				//记录做了哪些替换，以便补回来
				this.replaceDic[tagSearchRetSymb[0].searchName] = addElement.searchName;
				searchName = tagSearchRetSymb[0].searchName;
				//再做一次搜索
				tagSearchRetSymb = CodeSymbol.searchGlobalInRequireTree(tagSearchRetSymb[0].searchName , uri, Tools.SearchMode.FirstLetterContinuousMatching );
			}else{
				// tag 符号没有查到，类型推导也没有找到。
				return;
			}
		}

		let srarchLen = tagSearchRetSymb.length;
		if(tagSearchRetSymb.length > this.maxSearchLen){
			srarchLen = this.maxSearchLen;
		}

		//遍历tag的搜索结果。这里的结果通过FirstLetterContinuousMatching搜索出来的。
		//这里要做的工作就是。替换tag，替换用户prefix,  删除searchprefab
		for (let j = 0; j < srarchLen; j++) {
			//替换tag
			const element = tagSearchRetSymb[j];
			let SCHName = element.searchName;

			if(searchName !=  addElement.searchName){
				this.replaceDic[searchName] = addElement.searchName;
			}
			let ecee = addElement.searchName
			while(this.replaceDic[ecee]){
				if(this.replaceDic[ecee] == ecee) break;
				ecee = this.replaceDic[ecee];
			}
			SCHName = SCHName.replace(searchName, ecee);
			//替换用户prefix
			let reg = new RegExp( /[\.:]/, 'g')
			let prefix_dot = prefix.replace( reg , '[\.:]' );
			let prefix_dot_list = prefix_dot.split('[\.:]');
			prefix_dot_list.pop();
			prefix_dot_list.push('');
			prefix_dot = prefix_dot_list.join('[\.:]');
			// 如果搜索到的匹配项无法覆盖用户输入，去除
			let matRes = SCHName.match(RegExp( prefix_dot,  'i'));
			if(matRes){
				finalInsertText = SCHName.replace(RegExp( prefix_dot,  'i'), '');
			}else{
				// 未能匹配到用户输入. 性能消耗大，暂时去掉

				//此时不代表有错误，比如函数的返回值一类
				this.searchTag(element, prefix, completingArray, uri)

				if(isAllowNoPrefixEQ){
					finalInsertText = SCHName;
				}else{
					continue;
				}
			}

			let reasionString;
			if(addElement.tagReason == Tools.TagReason.UserTag){
				reasionString = "---@type " + addElement.searchName +  " = " + searchName;
			}
			if(addElement.tagReason == Tools.TagReason.MetaTable){
				reasionString = "setmetatable(" + addElement.searchName +  " , " + searchName + ")";
			}

			let completeKind : CompletionItemKind
		
			let InsText = finalInsertText;
			switch(element.kind){
				case 12:
					completeKind = CompletionItemKind.Function;
					InsText = finalInsertText + this.fmtParamToSnippet(element.funcParamArray);
					reasionString = element.name;
					break;
				default:
					completeKind = CompletionItemKind.Text;
			}

			let completeItem = {
				label: finalInsertText,
				kind: completeKind,
				insertText: InsText,
				detail : reasionString,  // 这里写明是元表还是标记
				insertTextFormat: InsertTextFormat.Snippet
			}
			if(completeItem.label == undefined){
				completeItem.label = "error undefined!";
			}else{
				completingArray.push(completeItem);
			}
		}
	}

	// 获取补全提示数组
	public static getCompletingArray(uri : string, pos: Position): CompletionItem[]{
		let completingArray  = new Array<CompletionItem>();
		let luaText = CodeEditor.getCode(uri);
		// 取出用户输入的字符串
		let prefix = Tools.getTextByPosition(luaText , pos);
		// 文档注释
		if (prefix == "---") {
			if (Tools.isNextLineHasFunction(luaText, pos) == false) {
				return completingArray;
			}
			completingArray.push(this.getDocCommentCompletingItem(uri, pos.line + 1));
			return completingArray;
		}

		//prefix是用户输入的信息。searchPrefix替换用户的输入，用于FirstLetterContinuousMatching搜索
		// 比如 local ff = aa, 用户输入ff.的时候，直接查是查不到的
		//
		let searchPrefix = prefix;	
		//判断用户输入是否含有分隔符
		let userInputArr = this.splitStringwithTrigger(prefix);
		let tagResSplitByBlank;
		//有分隔符时
		if (userInputArr && userInputArr.length > 1){
			//因为tag是精确搜索，所以要把最后一项未写完的部分去掉。比如 aa.bb.c(未写完)  => aa.bb
			userInputArr.pop();
			//进行tag搜索
			let offlastprefix = userInputArr.join('.');
			let tagResArr  =TypeInfer.processCompleting(offlastprefix ,uri);

			//搜到了tag
			if( tagResArr && tagResArr.length > 0 ){
				tagResSplitByBlank = tagResArr[0].searchName.replace(/[\.:]/g, ' ').split(' ');		//把. 和 ：转为空格
				let L1 = userInputArr.length -1 ;					//用户输入
				let L2 = tagResSplitByBlank.length - 1;		   //tag搜索
				while(L1 >=0 && L2>=0){
					if(userInputArr[L1] == tagResSplitByBlank[L2]){
						L1 --;
						L2 --;
						userInputArr.pop();
						tagResSplitByBlank.pop();
					}else{
						break;
					}
				}
				
				//替换掉后面用于FirstLetterContinuousMatching搜索的值。因为
				// aa = {bb = { cc = {dd = 9}}}
				// local ffffff = aa
				// ffffff.bb.cc  会搜出来  aa.bb
				searchPrefix = tagResArr[0].searchName;
			}
		}

		//无分隔符
		//在符号中搜索prefix开头的符号，组成提示内容。
		let retSymb = CodeSymbol.searchAllSymbolinRequireTreeforCompleting(uri, searchPrefix, Tools.SearchMode.FirstLetterContinuousMatching);
		if(!retSymb)  return;
		let srarchLen = retSymb.length;

		for(let idx = 0 ; idx < srarchLen; idx ++){
			if( !retSymb[idx] )	continue; //有错误
			let finalInsertText;			  //最终的提示字符串
			if(retSymb[idx].searchName != searchPrefix ){
				//用户输入信息 < 当前搜索到的Symbol，把当前符号也加入补全列表
				finalInsertText = retSymb[idx].searchName;	
			}
			//搜索结果10以内才使用 类型推导，否则会卡顿
			if( srarchLen < this.maxSearchLen && (retSymb[idx].tagType ||  retSymb[idx].requireFile || retSymb[idx].funcRets) ){
				//如果当前搜索结果有tag，搜索一次tag
				this.alreadychkSymbol = new Object();
				this.replaceDic = new Object();
				this.searchTag(retSymb[idx], prefix, completingArray, uri)
			}else{
				// retSymb[idx] 当前项目没有tag。
				// 判断用户输入的前缀有没有. 如果没有不需要做[前缀替换] 和 [tag替换]
				if(prefix.match(/[\.:]/)){
					try{
						//tag 替换
						let beReplaceStr = retSymb[idx].searchName;				
						let beReplStr = tagResSplitByBlank.join('.');
						let replStr = userInputArr.join('.');
						beReplaceStr = beReplaceStr.replace(beReplStr, replStr);
						//前缀替换
						let reg = new RegExp( /[\.:]/, 'g')
						let prefix_dot = prefix.replace( reg , '[\.:]' );
						let prefix_dot_list = prefix_dot.split('[\.:]');
						prefix_dot_list.pop(); //把最后一位去掉
						prefix_dot_list.push('');
						prefix_dot = prefix_dot_list.join('[\.:]');
						// 用户已输入的前缀剔除
						let matRes = beReplaceStr.match(RegExp( prefix_dot,  'i'));
						if(matRes){
							finalInsertText = beReplaceStr.replace(RegExp( prefix_dot,  'i'), '');
						}else{
							continue;
						}
					}catch{
						finalInsertText = retSymb[idx].originalName;
					}
				}else{
					//没有"."  不需要做[用户输入前缀替换]。使用搜索出来的searchName作为最终的结果
					finalInsertText = retSymb[idx].searchName;
				}
			}

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

		// 符号去重
		let retCompleteItem = this.completeItemDuplicateRemoval(completingArray);
		return retCompleteItem;
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
