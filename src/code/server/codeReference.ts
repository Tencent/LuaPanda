//查找引用
// import  * as Tools  from "./codeTools";
import { CodeSymbol } from "./codeSymbol";
// import { Logger } from './codeLogManager';
import { CodeDefinition } from './codeDefinition';
// import { 
// 	Location
// } from 'vscode-languageserver-protocol';

export class CodeReference {
	public static getSymbalReferences(info){	
		let refRet = new Array()
		// 此处getDefine应该直接搜索
		let def = CodeDefinition.getSymbalDefine(info, true);

		let findDocRes = CodeSymbol.searchSymbolReferenceinDoc(def);
		refRet.concat(findDocRes);
		//形式转换
		for (let index = 0; index < findDocRes.length; index++) {
			findDocRes[index].range.start.line = findDocRes[index].range.start.line  -1;
			findDocRes[index].range.start.character =  findDocRes[index].range.start.column;
			findDocRes[index].range.end.line = findDocRes[index].range.end.line  -1;
			findDocRes[index].range.end.character =  findDocRes[index].range.end.column;
		}
		return findDocRes;
	}
}