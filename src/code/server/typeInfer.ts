// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

//这个文件中要处理的主要是tag类型查找
//包含 前缀的去除 ， 查找， 补回查找
import * as Tools from './codeTools';
import { CodeSymbol } from "./codeSymbol";
// import { Logger } from './codeLogManager';

//类型推断文件
export class TypeInfer {
//-----------------------------------------------------------------------------
//-- 对外接口
//-----------------------------------------------------------------------------			
	// 定义查找接口
	public static processDefineSymbolTag(symbolInfo, uri){
		return this.recursiveProcessSymbolTag(symbolInfo, uri, '', new Array<string>());
	}

	// 自动补全接口
	public static processCompleting(prefixStr, uri){
		let sy = {
			containerURI: uri,
			isLocal: false,
			location: null,
			name: prefixStr
		}
		return this.recursiveProcessSymbolTag(sy, uri, '', new Array<string>());
	}
	
//-----------------------------------------------------------------------------
//-- 私有方法
//-----------------------------------------------------------------------------		
	// 处理函数返回值  |  element是赋值的符号 , a = func()  element是a的符号
	private static processFunctionReturn(element, symbolInfo, uri, prefixStrList, alreadySearchNameList, SCHName){
		let returnFuncList = CodeSymbol.searchSymbolinDoc(uri , SCHName ,Tools.SearchMode.ExactlyEqual);
		if (returnFuncList == null || ( returnFuncList && returnFuncList.length <= 0) ){
			returnFuncList = CodeSymbol.searchAllSymbolinRequireTreeforCompleting(uri ,SCHName ,Tools.SearchMode.ExactlyEqual);
		}		

		let retrunSymbol = new Array();
		if(returnFuncList && returnFuncList.length > 0){
			for (let index = 0; index < returnFuncList.length; index++) {
				// 遍历所有的函数，并在函数中查找返回类型
				const retFuncSymbol = returnFuncList[index];
				if( retFuncSymbol['funcRets'] ){
					let tag_type = retFuncSymbol['funcRets'];
					//根据函数定义符号记录的返回类型，找到返回变量符号
					// let tmpSymbol = CodeSymbol.searchSymbolinWorkSpace(tag_type, Tools.SearchMode.ExactlyEqual);
					symbolInfo.name = tag_type.name + prefixStrList;
					let tmpSymbol = this.recursiveProcessSymbolTag( symbolInfo, uri, '', alreadySearchNameList);
					//找到了返回符号，但是要过滤深度（仅查找对应函数中的符号）
					// tmpSymbol = CodeSymbol.selectSymbolinCertainContainer(tmpSymbol, retFuncSymbol.containerList);
					if(tmpSymbol){
						retrunSymbol = retrunSymbol.concat(tmpSymbol);
					}
				}
			}
			return retrunSymbol;
		}else{
			//等式右边的符号无法被直接搜索到
			symbolInfo.name = element.funcRets['name'];
			retrunSymbol = this.recursiveProcessSymbolTag( symbolInfo, uri, '', alreadySearchNameList);
			if(prefixStrList){
				symbolInfo.name = symbolInfo.name  +  prefixStrList;
				retrunSymbol = this.recursiveProcessSymbolTag( symbolInfo, uri, '', alreadySearchNameList);
			}

			return retrunSymbol;
		}
	}

	// 处理用户标记
	private static processUserTag(element, symbolInfo, uri, prefixStrList, alreadySearchNameList, userInputTxt, SCHName){
		let tag_type = element.tagType;
		// let tag_reason = element.tagReason;
		// let reqFile = element.requireFile;
		let checkName = '';

		checkName = tag_type.replace(/\s/g, '.');
		symbolInfo.name = checkName;
		let tx = this.recursiveProcessSymbolTag( symbolInfo, uri, prefixStrList, alreadySearchNameList);
		return tx;
	}

	// 处理元表标记
	private static processMetaTable(element, symbolInfo, uri, prefixStrList, alreadySearchNameList, userInputTxt, SCHName){
		//含有tagType，在tagType中查
		// let tag_type = element.tagType;
		let tag_reason = element.tagReason;
		// let reqFile = element.requireFile;
		let checkName = '';

		if(tag_reason == Tools.TagReason.MetaTable){
			checkName = element.tagType + ".__index";
		}

		symbolInfo.name = checkName;
		let indexDefList = this.recursiveProcessSymbolTag( symbolInfo, uri, prefixStrList, alreadySearchNameList);
		if( indexDefList && indexDefList.length > 0 ){
			//过滤
			indexDefList = CodeSymbol.selectSymbolinCertainContainer(indexDefList, element.containerList);
			let retrunSymbol = new Array();
			for (let index = 0; index < indexDefList.length; index++) {
				const indexSymbol = indexDefList[index];
				if(indexSymbol.tagType){
					symbolInfo.name = indexSymbol.tagType;
					let tmpSymbol = this.recursiveProcessSymbolTag( symbolInfo, uri, prefixStrList, alreadySearchNameList);
					if(tmpSymbol){
						retrunSymbol = retrunSymbol.concat(tmpSymbol);
					}
				}
				else if(indexSymbol.searchName.match(/__index/)){
					//若查找的字符串中包含__index
					retrunSymbol = retrunSymbol.concat(indexSymbol);

				}
			}
			return retrunSymbol;
		}		
	}

	// 处理引用标记
	private static processRequire(element, symbolInfo, uri, prefixStrList, alreadySearchNameList, checkName, SCHName){
		//到对应的文件中查一下return，找到后当做 userTag处理
		uri = Tools.transFileNameToUri(element.requireFile);
		let retTag = CodeSymbol.getCertainDocReturnValue(uri);
		if(retTag && retTag.length > 0){
			let tag_type = retTag;
			// let tag_reason = Tools.TagReason.UserTag;
			let reqFile = element.requireFile;

			checkName = tag_type; // a.b => tag
			let uri = Tools.transFileNameToUri(reqFile);
			let finalSymbs = CodeSymbol.searchSymbolinDoc(uri, checkName, Tools.SearchMode.ExactlyEqual);
			return  finalSymbs;
		}
	}

	// 递归核心推导方法  |   处理符号的tag。要求：可以查找符号链。不要返回相同的符号
	// symbInstance 保存最终结果，并返回给用户的符号
	// symbolInfo 用户输入的(被查找的)符号信息
	// prefixStr 搜索的前缀信息List
	// alreadySearchNameList 以查找过的符号列表
	private static recursiveProcessSymbolTag(symbolInfo, uri, prefixStrList, alreadySearchNameList){
		// 防止循环遍历
		// let alreadySearchLen = alreadySearchNameList.length;
		// const element = alreadySearchNameList[alreadySearchLen - 1];
		// if(element == symbolInfo.name ){
		// 	return;
		// }
		// // Logger.ErrorLog("recursiveProcessSymbolTag : " +   symbolInfo.name);
		// alreadySearchNameList.push(symbolInfo.name);
		//防止循环遍历--

		let findTagRetSymbArray
		findTagRetSymbArray = CodeSymbol.searchSymbolinDoc(uri , symbolInfo.name ,Tools.SearchMode.ExactlyEqual);
		if (findTagRetSymbArray == null || (findTagRetSymbArray &&findTagRetSymbArray.length <= 0)){
			findTagRetSymbArray = CodeSymbol.searchAllSymbolinRequireTreeforCompleting(uri ,symbolInfo.name, Tools.SearchMode.ExactlyEqual);
		}
		if(findTagRetSymbArray && findTagRetSymbArray.length > 0) return findTagRetSymbArray;

		//切断用户输入
		let userInputTxt = symbolInfo.name;
		let DotToBlankArr = Tools.splitToArrayByDot(userInputTxt);
		let preStr = ''
		//a.b.c -> a.b -> a 查找tag  递减缩减查找tag
		for (let index = DotToBlankArr.length - 1; index >= 0; index--) {
			//先把第一个参数pop
			preStr = "." + DotToBlankArr.pop() + preStr ;
			//确定要查找的符号名
			let SCHName = DotToBlankArr.join('.');

			// 先搜索本文件，如果找不到再搜索调用树
			let findTagRetSymbArray
			findTagRetSymbArray = CodeSymbol.searchSymbolinDoc(uri , SCHName ,Tools.SearchMode.ExactlyEqual);
			if (findTagRetSymbArray == null || (findTagRetSymbArray &&findTagRetSymbArray.length <= 0)){
				findTagRetSymbArray = CodeSymbol.searchAllSymbolinRequireTreeforCompleting(uri ,SCHName, Tools.SearchMode.ExactlyEqual);
			}

			//没找到，继续pop
			if(!findTagRetSymbArray || findTagRetSymbArray.length == 0) continue;

			//找到了用户输入的符号
			//没有找到需要的符号，遍历判断符号是否有 require， function ret, tag 标记
			if(findTagRetSymbArray && findTagRetSymbArray.length > 0){
				let MaxFor = findTagRetSymbArray.length > 10 ? 1: findTagRetSymbArray.length; //对搜索结果过多的保护
				for (let ix = MaxFor - 1; ix >= 0 ; ix--) {
					const element = findTagRetSymbArray[ix];
					//搜索tag
					let findoutSymbs;
					if(element.tagType && (element.tagReason === Tools.TagReason.UserTag || element.tagReason === Tools.TagReason.Equal) ){																//USERTag
						findoutSymbs = this.processUserTag(element, symbolInfo, uri, prefixStrList, alreadySearchNameList, userInputTxt,  SCHName);
					}else if(element.tagType && element.tagReason == Tools.TagReason.MetaTable ){	
						findoutSymbs = this.processMetaTable(element, symbolInfo, uri, prefixStrList, alreadySearchNameList, userInputTxt,  SCHName);
					}else if(element.requireFile && element.requireFile.length > 0){		//Require
						let checkName = DotToBlankArr.join('.');
						findoutSymbs = this.processRequire(element, symbolInfo, uri, prefixStrList, alreadySearchNameList, checkName, SCHName);
					}else if(element.funcRets){	
						findoutSymbs = this.processFunctionReturn(element, symbolInfo, uri, preStr, alreadySearchNameList, SCHName)
						//funcReturnSymbol 如果有prefix ，拼起来再找，没有prefix就找到了
					}else if(element.chunk && element.chunk.returnSymbol){
						let chunkRet  = element.chunk.returnSymbol;
						findoutSymbs = CodeSymbol.searchAllSymbolinRequireTreeforCompleting(uri ,chunkRet, Tools.SearchMode.ExactlyEqual);
					}

					//已经拿到了符号, 有preStr
					if(findoutSymbs && findoutSymbs.length > 0 && preStr.length > 0){
						let MaxFor2 = findoutSymbs.length > 10 ? 1: findoutSymbs.length;
						for (let findoutSymIdx = 0; findoutSymIdx < MaxFor2; findoutSymIdx++) {
							if(!findoutSymbs[findoutSymIdx]) continue;
							let chkName = '';
							if( !element.funcRets ){
								chkName =  findoutSymbs[findoutSymIdx].searchName + preStr ; //拼出完整的符号
							}else{
								if( element.funcRets.name == "require"){
									chkName =  findoutSymbs[findoutSymIdx].searchName + preStr ; //拼出完整的符号
								}else{
									chkName =  findoutSymbs[findoutSymIdx].searchName;
								}
							}

							//防止死循环
							if(chkName == userInputTxt){
								continue;
							}

							let sy = {
								containerURI: findoutSymbs[findoutSymIdx].containerURI,
								isLocal: findoutSymbs[findoutSymIdx].isLocal,
								location: null,
								name: chkName
							}

							let ret = this.recursiveProcessSymbolTag(sy , uri, '', alreadySearchNameList);
							if(ret)	return ret;
						}
					}
				}
			}
		}
	}
}
