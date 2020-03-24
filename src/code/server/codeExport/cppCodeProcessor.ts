// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

import path = require('path');
import dir = require('path-reader');
import fs = require('fs');
import { parseAst, Language, Node } from 'univac';
import { Logger } from '../codeLogManager';
import { CodeSymbol } from '../codeSymbol';
import * as Tools from '../codeTools';

export class CppCodeProcessor {
	// workspace 根目录，server初始化时设置。
	private static _cppInterfaceIntelliSenseResPath: string | null;
    // sluaUE的分析路径
	public static get cppInterfaceIntelliSenseResPath() {
		if(!this._cppInterfaceIntelliSenseResPath){
			// joezhuoli TODO
            this._cppInterfaceIntelliSenseResPath = Tools.getVSCodeOpenedFolders() + "/.vscode/LuaPanda/IntelliSenseRes/UECppInterface/";        
        }
        return this._cppInterfaceIntelliSenseResPath;
	}

	public static loadIntelliSenseRes() {
		if (fs.existsSync(this.cppInterfaceIntelliSenseResPath)) {
			CodeSymbol.refreshUserPreloadSymbals(this.cppInterfaceIntelliSenseResPath);
		}
	}

	/**
	 * 将静态导出的C++代码处理成Lua table用于代码提示。
	 * @param cppDir C++代码根目录。
	 */
	public static async processCppDir(cppDir: string): Promise<number> {
		if (this.cppInterfaceIntelliSenseResPath === null) {
			Logger.ErrorLog('未打开文件夹，无法使用此功能！');
			Tools.showTips('未打开文件夹，无法使用此功能！');
			return;
		}
		Tools.showTips('正在分析处理中，请稍后。分析完成后会有提示，请不要重复点击。');

		// 生成一个子目录对应用户代码路径
		let subDir = cppDir;
		subDir = subDir.replace(/\//g, ' ');
		subDir = subDir.replace(/\\/g, ' ');
		subDir = subDir.replace(/:/g, '');
		subDir = subDir.trim();
		subDir = subDir.replace(/ /g, '-');

		this.removeCppInterfaceIntelliSenseRes(path.join(this.cppInterfaceIntelliSenseResPath, subDir));
		let cppHeaderFiles = this.getCppHeaderFiles(cppDir);
		let cppSourceFiles = this.getCppSourceFiles(cppDir);

		let totalProcessNum = await this.processParse(cppHeaderFiles, cppSourceFiles, subDir);
		return totalProcessNum;
	}

	private static async processParse(cppHeaderFiles: string[], cppSourceFiles: string[], subDir: string): Promise<number> {
		await this.parseCppFiles(cppHeaderFiles, CppFileType.CppHeaderFile, subDir);
		await this.parseCppFiles(cppSourceFiles, CppFileType.CppSourceFile, subDir);

		let totalProcessNum = cppHeaderFiles.length + cppSourceFiles.length;
		return Promise.resolve(totalProcessNum);
		// Tools.showTips('CPP 导出文件处理完成！共解析 ' + totalProcessNum + ' 个文件。');
	}

	private static async parseCppFiles(filePaths: string[], cppFileType: CppFileType, subDir: string) {
		for (let i = 0; i < filePaths.length; i++) {
			let cppText = this.getCppCode(filePaths[i], cppFileType);
			if (cppText === '') {
				continue;
			}

			let astNode: Node;
			try {
				astNode = await parseAst({
					input: cppText,
					language: Language.cpp,
					omitPosition: true,
					text: true,
					basePath: this.getWasmDir()
				});
				if (cppFileType === CppFileType.CppHeaderFile) {
					this.parseCppHeaderAST2LuaCode(astNode, subDir);
				} else if (cppFileType === CppFileType.CppSourceFile) {
					let classFunctionInfo = this.getClassFunctionInfo(astNode);
					this.parseCppSourceAST2LuaCode(astNode, classFunctionInfo, subDir);
				}
			} catch(e) {
				Logger.ErrorLog("Parse cpp file failed, filePath: " + filePaths[i] +" error: ");
				Logger.ErrorLog(e);
			}
		}
	}

	/*
	private static parseCppFile(filePath: string) {
		let cppText = this.getCppCode(filePath);

		let parseProcess: Promise<Node | undefined> = parseAst({
			input: cppText,
			language: Language.cpp,
			omitPosition: true,
			text: true,
			basePath: this.getWasmDir()
		});

		parseProcess.then(
			(astNode) => {
				// let str = JSON.stringify(astNode, null, 2);
				// Logger.DebugLog(str);
				this.parseAST2LuaCode(astNode);
			}
		)
		.catch((e) => {
			Logger.ErrorLog("Parse cpp file failed, filePath: " + filePath +" error: ");
			Logger.ErrorLog(e);
		});
	}
	*/

	/**
	 * 获取文件内容，并对内容进行预处理。
	 * @param filePath 文件路径。
	 * @param cppFileType 文件类型
	 */
	private static getCppCode(filePath: string, cppFileType: CppFileType): string {
		let content = Tools.getFileContent(filePath);

		if (this.isFileNeedParse(cppFileType, content) === false) {
			return '';
		}

		content = this.pretreatCppCode(content);

		return content;
	}

	private static isFileNeedParse(cppFileType: CppFileType, content: string): boolean {
		let regex: RegExp;
		let result: RegExpExecArray | null;
		switch (cppFileType) {
			case CppFileType.CppHeaderFile:
				regex = URegex.UCLASS
				if ((result = regex.exec(content)) !== null) {
					return true;
				}
				regex = URegex.USTRUCT
				if ((result = regex.exec(content)) !== null) {
					return true;
				}
				regex = URegex.UENUM
				if ((result = regex.exec(content)) !== null) {
					return true;
				}
				break;

			case CppFileType.CppSourceFile:
				regex = URegex.DefLuaClass;
				if ((result = regex.exec(content)) !== null) {
					return true;
				}
				break;
		}
		return false;
	}

	/**
	 * 将 class XXX ClassName 替换为 class className
	 * 去除宏 GENERATED_BODY
	 * 去除宏 GENERATED_UCLASS_BODY
	 * 去除宏 GENERATED_USTRUCT_BODY
	 * 去除宏 DEPRECATED
	 * 去除宏 UE_DEPRECATED
	 * 去除宏 DECLARE_XXX
	 * 去除宏 PRAGMA_XXX
	 */
	private static pretreatCppCode(content: string): string {
		let regex: RegExp;
		let result: RegExpExecArray | null;

		// 将 class XXX ClassName 替换为 class className
		regex = /\s*(class\s+[A-Z0-9_]+)\s+\w+.+/;
		while ((result = regex.exec(content)) !== null) {
			content = content.replace(result[1], 'class');
		}

		// 将 struct XXX StructName 替换为 struct StructName
		regex = /\s*(struct\s+[A-Z0-9_]+)\s+\w+.+/;
		while ((result = regex.exec(content)) !== null) {
			content = content.replace(result[1], 'struct');
		}

		let regex2CommentArray: RegExp[] = new Array<RegExp>();
		// 去除宏 GENERATED_BODY
		regex2CommentArray.push(URegex.GENERATED_BODY);
		// 去除宏 GENERATED_UCLASS_BODY
		regex2CommentArray.push(URegex.GENERATED_UCLASS_BODY);
		// 去除宏 GENERATED_USTRUCT_BODY
		regex2CommentArray.push(URegex.GENERATED_USTRUCT_BODY);
		// 去除宏 UE_DEPRECATED
		regex2CommentArray.push(URegex.UE_DEPRECATED);
		// 去除宏 DEPRECATED
		regex2CommentArray.push(URegex.DEPRECATED);
		// 去除宏 DECLARE_XXX
		regex2CommentArray.push(URegex.DECLARE);
		// 去除宏 PRAGMA_XXX
		regex2CommentArray.push(URegex.PRAGMA);

		let regex2BlankArray: RegExp[] = new Array<RegExp>();
		// 去除 UMETA(xxx）
		regex2BlankArray.push(URegex.UMETA);
		// 去除 ENGINE_API
		regex2BlankArray.push(URegex.ENGINE_API);

		content = this.removeByRegex(content, regex2CommentArray, regex2BlankArray);

		return content;
	}

	private static removeByRegex(content: string, regex2CommentArray: RegExp[], regex2BlankArray: RegExp[]): string {
		let result: RegExpExecArray | null;

		regex2CommentArray.forEach((regex: RegExp) => {
			while ((result = regex.exec(content)) !== null) {
				content = content.replace(result[1], '//');
			}
		});

		regex2BlankArray.forEach((regex: RegExp) => {
			while ((result = regex.exec(content)) !== null) {
				content = content.replace(result[1], '');
			}
		});

		return content;
	}

	private static parseCppHeaderAST2LuaCode(astNode: Node, subDir: string) {
		let foundUCLASS: boolean = false;
		let foundUSTRUCT: boolean = false;
		let foundUENUM: boolean = false;

		astNode.children.forEach((child: Node) => {
			if (child.type === 'comment') {
				return;
			}

			if (child.type === 'expression_statement' && child.text.match(URegex.UCLASS)) {
				// 标记找到UCLASS，即下一个Node。
				foundUCLASS = true;
			} else if (child.type === 'expression_statement' && child.text.match(URegex.USTRUCT)) {
				foundUSTRUCT = true;
			} else if (child.type === 'expression_statement' && child.text.match(URegex.UENUM)) {
				foundUENUM = true;
			} else if (foundUCLASS === true) {
				let result = this.handleUCLASS(child);
				foundUCLASS = false;
				if (result.className !== '') {
					let filePath = path.join(this.cppInterfaceIntelliSenseResPath, subDir, result.className + '.lua');
					this.appendText2File(result.luaText, filePath);
					CodeSymbol.refreshOneUserPreloadDocSymbols(filePath);
				}
			} else if (foundUSTRUCT === true) {
				let result = this.handleUSTRUCT(child);
				foundUSTRUCT = false;
				if (result.structName !== '') {
					let filePath = path.join(this.cppInterfaceIntelliSenseResPath, subDir, result.structName + '.lua');
					this.appendText2File(result.luaText, filePath);
					CodeSymbol.refreshOneUserPreloadDocSymbols(filePath);
				}
			} else if (foundUENUM === true) {
				let result = this.handleUENUM(child);
				foundUENUM = false;
				if (result.enumType !== '') {
					let filePath = path.join(this.cppInterfaceIntelliSenseResPath, subDir, result.enumType + '.lua');
					this.appendText2File(result.luaText, filePath);
					CodeSymbol.refreshOneUserPreloadDocSymbols(filePath);
				}
				// 外层有namespace的情况，要放到UENUM后面，UENUM后面的节点有可能是namespace
				child.children.forEach((child: Node) => {
					if (child.type === 'declaration_list') {
						this.parseCppHeaderAST2LuaCode(child, subDir);
					}
				});
			}
		});
	}

	private static handleUCLASS(astNode: Node): {luaText: string, className: string} {
		let luaText = '';
		let className = '';
		let baseClass = [];
		let declarationList: {uPropertys: string, uFunctions: string} = {uPropertys: '', uFunctions: ''};

		// class ClassName: public BaseClass
		astNode.children.forEach((child: Node) => {
			switch (child.type) {
				case 'type_identifier':
					className = child.text;
					break;

				case 'base_class_clause':
					baseClass = baseClass.concat(this.handleBaseClassClause(child, className));
					break;

				case 'field_declaration_list':
					declarationList = this.handleDeclarationList(child, className);
					break;
			}
		});
		luaText = declarationList.uPropertys + declarationList.uFunctions;

		let classDeclaration: string;
		if (baseClass.length > 0) {
			// 默认选取继承类中的第一个
			classDeclaration = className + ' = {} ---@type ' + baseClass[0] + '\n';
		} else {
			classDeclaration = className + ' = {}\n';
		}
		return {luaText: classDeclaration + luaText, className: className};
	}

	private static handleUSTRUCT(astNode: Node): {luaText: string, structName: string} {
		let luaText = '';
		let structName = '';
		let declarationList: {uPropertys: string, uFunctions: string} = {uPropertys: '', uFunctions: ''};

		if (astNode.type === 'struct_specifier') {
			astNode.children.forEach((child: Node) => {
				switch (child.type) {
					case 'type_identifier':
						structName = child.text;
						break;

					case 'field_declaration_list':
						declarationList = this.handleDeclarationList(child, structName);
						break;
				}
			});
			luaText = declarationList.uPropertys + declarationList.uFunctions;

			let structDeclaration: string;
			structDeclaration = structName + ' = {}\n';
			luaText = structDeclaration + luaText;
		} else if (astNode.type === 'declaration') {
			astNode.children.forEach((child: Node) => {
				if (child.type === 'struct_specifier') {
					let result = this.handleUSTRUCT(child);
					luaText = result.luaText;
					structName = result.structName;
				}
			});
		}

		return {luaText: luaText, structName: structName};
	}

	private static handleUENUM(astNode: Node): {enumType: string, luaText: string} {
		let luaText = '';
		let enumType = '';

		if (astNode.type === 'namespace_definition') {
			astNode.children.forEach((child: Node) => {
				switch (child.type) {
					case 'identifier':
						enumType = child.text;
						break;

					case 'declaration_list':
						child.children.forEach((child: Node) => {
							if (child.type === 'enum_specifier') {
								let result = this.handleEnumSpecifier(child);
								luaText += enumType + ' = {}\n';
								result.enumeratorList.forEach((enumerator) => {
									luaText += enumType + '.' + enumerator + ' = nil\n';
								});
							}
						});
						break;
				}
			});
		} else if (astNode.type === 'enum_specifier') {
			let result = this.handleEnumSpecifier(astNode);
			enumType = result.enumType;
			luaText += enumType + ' = {}\n';
			result.enumeratorList.forEach((enumerator) => {
				luaText += enumType + '.' + enumerator + ' = nil\n';
			});
		} else if (astNode.type === 'declaration') {
			// enum class
			astNode.children.forEach((child: Node) => {
				if (child.type === 'init_declarator') {
					let result = this.handleInitDeclarator(child);
					enumType = result.enumType;
					luaText += enumType + ' = {}\n';
					result.enumeratorList.forEach((enumerator) => {
						luaText += enumType + '.' + enumerator + ' = nil\n';
					});
				}
			});
		}

		return {enumType: enumType, luaText: luaText};
	}

	private static handleInitDeclarator(astNode: Node): {enumType: string, enumeratorList: string[]} {
		let enumType = '';
		let enumeratorList: string[] = [];

		astNode.children.forEach((child: Node) => {
			switch (child.type) {
				case 'identifier':
					enumType = child.text;
					break;
				case 'initializer_list':
					enumeratorList = this.handleEnumeratorList(child);
					break;
			}
		});

		return {enumType: enumType, enumeratorList: enumeratorList};
	}
	private static handleEnumSpecifier(astNode: Node): {enumType: string, enumeratorList: string[]} {
		let enumType = '';
		let enumeratorList: string[] = [];

		astNode.children.forEach((child: Node) => {
			switch (child.type) {
				case 'type_identifier':
					enumType = child.text;
					break;

				case 'enumerator_list':
					enumeratorList = this.handleEnumeratorList(child);
					break;
			}
		});

		return {enumType: enumType, enumeratorList: enumeratorList};
	}

	private static handleEnumeratorList(astNode: Node): string[] {
		let enumeratorList: string[] = [];

		astNode.children.forEach((child: Node) => {
			if (child.type === 'identifier') {
				enumeratorList.push(child.text);
			} else if (child.type === 'enumerator') {
				child.children.forEach((child: Node) => {
					if (child.type === 'identifier') {
						enumeratorList.push(child.text);
					}
				});
			}
		});

		return enumeratorList;
	}

	private static handleBaseClassClause(astNode: Node, className: string): string[] {
		let baseClass: string[] = [];
		astNode.children.forEach((child: Node) => {
			if (child.type === 'type_identifier') {
				baseClass.push(child.text);
			}
		});
		return baseClass;
	}

	private static handleDeclarationList(astNode: Node, className: string): {uPropertys: string, uFunctions: string} {
		let uPropertys = '';
		let uFunctions = '';
		let foundUFUNCTION = false;
		let foundUPROPERTY = false;
		astNode.children.forEach((child: Node) => {
			if (child.type === 'comment') {
				return;
			}

			if (foundUFUNCTION === true) {
				uFunctions += this.handleUFUNCTION(child, className);
				foundUFUNCTION = false;
			} else if (foundUPROPERTY === true) {
				uPropertys += this.handleUPROPERTY(child, className);
				foundUPROPERTY = false;
			} else if ((child.type === 'field_declaration' || child.type === 'declaration') && child.text.match(URegex.UFUNCTION)) {
				foundUFUNCTION = true;
			} else if ((child.type === 'field_declaration' || child.type === 'declaration') && child.text.match(URegex.UPROPERTY)) {
				foundUPROPERTY = true;
			} else if (child.type === 'preproc_if' || child.type === 'preproc_ifdef') {
				let declarationList = this.handleDeclarationList(child, className);
				uPropertys += declarationList.uPropertys;
				uFunctions += declarationList.uFunctions;
			}
		});
		return {uPropertys: uPropertys, uFunctions: uFunctions};
	}

	private static handleUFUNCTION(astNode: Node, className: string): string {
		let luaText = 'function ';
		let returnType = '';

		astNode.children.forEach((child: Node) => {
			switch (child.type) {
				case 'type_identifier':
				case 'primitive_type':
					// 记录返回值类型（非引用和指针）
					returnType = child.text;
					break;

				// 模板类型 TArray<UActorComponent>
				case 'template_type':
					returnType = this.getTemplateType(child);
					break;

				// 类类型
				case 'class_specifier':
					returnType = this.getClassInfo(child).className;
					break;

				// 结构体类型
				case 'struct_specifier':
					returnType = this.getStructType(child);
					break;

				// 函数定义
				case 'function_declarator':
					luaText += this.handleFunctionDeclarator(child, className);
					break;

				// 函数返回类型为指针或引用，需要向内解一层
				case 'pointer_declarator':
				case 'reference_declarator':
					child.children.forEach((child: Node) => {
						if (child.type === 'function_declarator') {
							luaText += this.handleFunctionDeclarator(child, className);
						}
					});
					break;
			}
		});
		luaText += ' end\n';

		if (this.returnTypeMap.has(returnType)) {
			returnType = this.returnTypeMap.get(returnType);
		}
		if (returnType !== '') {
			luaText = '---@return ' + returnType + '\n' + luaText;
		}

		return luaText;
	}

	private static handleFunctionDeclarator(astNode: Node, className: string): string {
		let luaText = '';

		astNode.children.forEach((child: Node) => {
			switch (child.type) {
				case 'identifier':
				case 'field_identifier':
					luaText += className + '.' + child.text;
					break;

				case 'parameter_list':
					luaText += this.handleParameterList(child, className);
					break;
			}
		});
		luaText += ')';
		return luaText;
	}

	private static handleParameterList(astNode: Node, className: string): string {
		let luaText = '(';
		let params: string[] = [];

		astNode.children.forEach((child: Node) => {
			if (child.type === 'parameter_declaration') {
				params = params.concat(this.handleParameterDeclaration(child));
			}
		});
		for (let i = 0; i < params.length; i++) {
			if (i === 0) {
				luaText += params[i];
			} else {
				luaText += ", " + params[i];
			}
		}
		return luaText;
	}

	private static handleParameterDeclaration(astNode: Node): string[] {
		let params: string[] = [];
		astNode.children.forEach((child: Node) => {
			switch (child.type) {
				case 'reference_declarator':
					params.push(this.handleReferenceDeclarator(child));
					break;

				case 'pointer_declarator':
					params.push(this.handlePointerDeclarator(child));
					break;

				case 'identifier':
					params.push(child.text);
					break;
			}
		});

		return params;
	}

	private static handleReferenceDeclarator(astNode: Node): string {
		let param = '';
		astNode.children.forEach((child: Node) => {
			if (child.type === 'identifier') {
				param = child.text;
			}
		});
		return param;
	}

	private static handlePointerDeclarator(astNode: Node): string {
		let param = '';
		astNode.children.forEach((child: Node) => {
			if (child.type === 'identifier') {
				param = child.text;
			}
		});
		return param;
	}

	private static getTemplateType(astNode: Node): string {
		let templateType = '';
		astNode.children.forEach((child: Node) => {
			if (child.type === 'type_identifier') {
				templateType = child.text;
			}
		});

		return templateType;
	}

	private static getStructType(astNode: Node): string {
		let structType = '';
		astNode.children.forEach((child: Node) => {
			if (child.type === 'type_identifier') {
				structType = child.text;
			}
		});

		return structType;
	}


	private static handleUPROPERTY(astNode: Node, className: string): string {
		let luaText = '';

		astNode.children.forEach((child: Node) => {
			switch (child.type) {
				case 'identifier':
				case 'field_identifier':
					luaText += className + '.' + child.text + " = nil\n";
					break;

				case 'init_declarator':
					child.children.forEach((child: Node) => {
						if (child.type === 'identifier') {
							luaText += className + '.' + child.text + " = nil\n";
						}
					});
					break;

				case 'pointer_declarator':
				case 'reference_declarator':
					child.children.forEach((child: Node) => {
						if (child.type === 'field_identifier') {
							luaText += className + '.' + child.text + " = nil\n";
						}
					});
					break;
			}
		});
		return luaText;
	}

	/**
	 * 获取当前文件中定义的函数列表，用于填充LuaMethod的参数。
	 * @param astNode cpp源码解析后的语法树根节点。
	 * @return 存储函数列表信息的map，结构：<class, <function, paramList>>，暂时忽略namespace。
	 */
	private static getClassFunctionInfo(astNode: Node): Map<string, Map<string, string[]>> {
		let classFunctionInfo = new Map<string, Map<string, string[]>>();

		astNode.children.forEach((child: Node) => {
			if (child.type === 'namespace_definition') {
				child.children.forEach((child: Node) => {
					if (child.type === 'declaration_list') {
						child.children.forEach((child: Node) => {
							if (child.type === 'class_specifier') {
								let classInfo = this.getClassInfo(child);
								if (classInfo.className !== '' && classInfo.functionListMap !== undefined) {
									// functionMap[classInfo.className] = classInfo.functionListMap;
									classFunctionInfo.set(classInfo.className, classInfo.functionListMap);
								}
							}
						});
					}
				});
			} else if (child.type === 'class_specifier') {
				let classInfo = this.getClassInfo(child);
				classFunctionInfo.set(classInfo.className, classInfo.functionListMap);
			}
		});

		return classFunctionInfo;
	}

	private static getClassInfo(astNode: Node): {className: string, functionListMap: Map<string, string[]>} {
		let className = '';
		let functionListMap = new Map<string, string[]>();

		astNode.children.forEach((child: Node) => {
			if (child.type === 'type_identifier') {
				className = child.text;
			} else if (child.type === 'field_declaration_list') {
				child.children.forEach((child: Node) => {
					if (child.type === 'function_definition') {
						let functionInfo = this.getFunctionInfo(child);
						if (functionInfo.functionName !== '') {
							functionListMap.set(functionInfo.functionName, functionInfo.paramList);
						}
					}
				});
			}
		});
		return {className: className, functionListMap: functionListMap}
	}

	private static getFunctionInfo(astNode: Node): {functionName: string, paramList: string[]} {
		let functionName = '';
		let paramList = [];
		astNode.children.forEach((child: Node) => {
			if (child.type === 'function_declarator') {
				child.children.forEach((child: Node) => {
					if (child.type === 'identifier' || child.type === 'field_identifier') {
						functionName = child.text;
					} else if (child.type === 'parameter_list') {
						paramList = this.getParamList(child);
					}
				});
			}
		});

		return {functionName: functionName, paramList: paramList};
	}

	private static getParamList(astNode: Node): string[] {
		let paramList = [];
		astNode.children.forEach((child: Node) => {
			if (child.type === 'parameter_declaration') {
				paramList = paramList.concat(this.handleParameterDeclaration(child));
			}
		});

		return paramList;
	}

	private static parseCppSourceAST2LuaCode(astNode: Node, classFunctionInfo: Map<string, Map<string, string[]>>, subDir: string) {
		let className: string = "";
		let baseClass: string[] = [];
		let methodList: string[] = [];

		astNode.children.forEach((child: Node) => {
			if (child.type === 'comment') {
				return;
			}

			if (child.type === 'expression_statement' && child.text.match(URegex.DefLuaClass)) {
				let result = this.handleDefLuaClass(child);
				className = result.className;
				baseClass = result.baseClass;
			} else if (child.type === 'expression_statement' && child.text.match(URegex.DefLuaMethod)) {
				let functionInfo = classFunctionInfo.get(className);
				methodList.push(this.handleDefLuaMethod(child, className, functionInfo));
			} else if (child.type === 'expression_statement' && child.text.match(URegex.EndDef)) {
				if (className !== '') {
					let filePath = path.join(this.cppInterfaceIntelliSenseResPath, subDir, className + '.lua');
					let luaText = this.assembleLuaClassText(className, baseClass, methodList);
					this.appendText2File(luaText, filePath);
					CodeSymbol.refreshOneUserPreloadDocSymbols(filePath);
					className = '';
					baseClass.length = 0;
					methodList.length = 0;
				}
			}

			else if (child.type === 'namespace_definition') {
				child.children.forEach((child: Node) => {
					if (child.type === 'declaration_list') {
						this.parseCppSourceAST2LuaCode(child, classFunctionInfo, subDir);
					}
				});
			}
		});
	}

	private static handleDefLuaClass(astNode: Node): {className: string, baseClass: string[]} {
		let argumentList: string[] = [];

		let argumentListNode: Node;
		astNode.children.forEach((child: Node) => {
			if (child.type === 'call_expression') {
				child.children.forEach((child: Node) => {
					if (child.type === 'argument_list') {
						argumentListNode = child;
					}
				});
			}
		});

		argumentListNode.children.forEach((child: Node) => {
			if (child.type === 'identifier') {
				argumentList.push(child.text);
			}
		});

		return {className: argumentList[0], baseClass: argumentList.slice(1)};
	}

	private static handleDefLuaMethod(astNode: Node, className: string, functionInfo: Map<string, string[]>): string {
		let luaText: string = 'function ';

		astNode.children.forEach((child: Node) => {
			if (child.type === 'call_expression') {
				child.children.forEach((child: Node) => {
					if (child.type === 'argument_list') {
						child.children.forEach((child: Node) => {
							if (child.type === 'identifier') {
								luaText += className + '.' + child.text + '(';
								// 处理函数参数列表
								if (functionInfo.has(child.text)) {
									let paramList = functionInfo.get(child.text);
									for (let i = 0; i < paramList.length; i++) {
										if (i === 0) {
											luaText += paramList[i];
										} else {
											luaText += ", " + paramList[i];
										}
									}
								}
								luaText += ')';
							}
						});
					}
				});
			}

		});
		luaText += ' end\n'

		return luaText;
	}

	private static assembleLuaClassText(className: string, baseClass: string[], methodList: string[]): string {
		let luaText: string = className + ' = {}'

		if (baseClass.length > 0) {
			luaText += ' ---@type ' + baseClass[0] + '\n';
		} else {
			luaText += '\n';
		}
		methodList.forEach((method: string) => {
			luaText += method;
		});

		return luaText;
	}

	// UFUNCTION返回值类型映射
	private static _returnTypeMap: Map<string, string>;
	private static get returnTypeMap() {
		if (!this._returnTypeMap) {
			this._returnTypeMap = new Map<string, string>();
			this._returnTypeMap.set('void', '');
			this._returnTypeMap.set('int', 'number');
			this._returnTypeMap.set('int8', 'number');
			this._returnTypeMap.set('int16', 'number');
			this._returnTypeMap.set('int32', 'number');
			this._returnTypeMap.set('int64', 'number');
			this._returnTypeMap.set('uint8', 'number');
			this._returnTypeMap.set('uint16', 'number');
			this._returnTypeMap.set('uint32', 'number');
			this._returnTypeMap.set('uint64', 'number');
			this._returnTypeMap.set('float', 'number');
			this._returnTypeMap.set('double', 'number');
			this._returnTypeMap.set('bool', 'boolean');
			this._returnTypeMap.set('FName', 'string');
			this._returnTypeMap.set('FString', 'string');
			this._returnTypeMap.set('FText', 'string');
		}

		return this._returnTypeMap;
	}

	/**
	 * 获取tree-sitter wasm文件目录
	 */
	private static getWasmDir(): string {
		return path.join(Tools.getVScodeExtensionPath(), "node_modules/univac/dist/static/");
	}

	private static getCppHeaderFiles(dirPath: string) {
		let options = {
			sync: true,
			recursive: true,
			valuetizer:function(stat:fs.Stats, fileShortName: string, fileFullPath: string) {
				if (stat.isDirectory()) {
					return fileFullPath;
				}
				return fileShortName.match(/\.h$/)? fileFullPath : null;
			}
		};

		return dir.files(dirPath, 'file', null, options);
	}

	private static getCppSourceFiles(dirPath: string): string[] {
		let options = {
			sync: true,
			recursive: true,
			valuetizer:function(stat:fs.Stats, fileShortName: string, fileFullPath: string) {
				if (stat.isDirectory()) {
					return fileFullPath;
				}
				return fileShortName.match(/\.cpp$/)? fileFullPath : null;
			}
		};

		return dir.files(dirPath, 'file', null, options);
	}

	/**
	 * 将文本写入指定文件。
	 * @param text 要写入的文本。
	 * @param filePath 文件路径，若不存在则创建，已存在则追加到文件末尾。
	 */
	private static appendText2File(text: string, filePath: string) {
		let dirPath = path.dirname(filePath);
		this.makeDirSync(dirPath);
		let options = {
			flag: 'a'
		};
		try {
			fs.writeFileSync(filePath, text, options);
		} catch (e) {
			Logger.ErrorLog('写入文件出错，filePath: ' + filePath + 'error: ');
			Logger.ErrorLog(e);
		}
	}

	private static makeDirSync(dirPath: string) {
		if (fs.existsSync(dirPath)) {
			return;
		}
		let baseDir = path.dirname(dirPath);
		this.makeDirSync(baseDir);
		fs.mkdirSync(dirPath);
	}

	/**
	 * 删除目录，递归删除子目录。
	 * @param dirPath 要删除的目录。
	 */
	private static removeCppInterfaceIntelliSenseRes(dirPath: string) {
		if (fs.existsSync(dirPath)) {
			let files = fs.readdirSync(dirPath);
			files.forEach((file) => {
				let currentPath = path.join(dirPath, file);
				if (fs.statSync(currentPath).isDirectory()) {
					this.removeCppInterfaceIntelliSenseRes(currentPath);
				} else {
					// 删除preload symbol
					// 先清空文件内容，然后刷新symbol，再删除文件。
					fs.writeFileSync(currentPath, '');
					CodeSymbol.refreshOneUserPreloadDocSymbols(currentPath);
					fs.unlinkSync(currentPath);
				}
			});
			fs.rmdirSync(dirPath);
		}
	}
}

class URegex {
	public static UCLASS    = new RegExp(/\s*(UCLASS\s*\(.*\))/);
	public static USTRUCT   = new RegExp(/\s*(USTRUCT\s*\(.*\))/);
	public static UENUM     = new RegExp(/\s*(UENUM\s*\(.*\))/);
	public static UFUNCTION = new RegExp(/\s*(UFUNCTION\s*\(.*\))/);
	public static UPROPERTY = new RegExp(/\s*(UPROPERTY\s*\(.*\))/);

	public static GENERATED_BODY         = new RegExp(/\s*(GENERATED_BODY\s*\(.*\))/);
	public static GENERATED_UCLASS_BODY  = new RegExp(/\s*(GENERATED_UCLASS_BODY\s*\(.*\))/);
	public static GENERATED_USTRUCT_BODY = new RegExp(/\s*(GENERATED_USTRUCT_BODY\s*\(.*\))/);
	public static DEPRECATED             = new RegExp(/\s*(DEPRECATED\s*\(.*\))/);
	public static UE_DEPRECATED          = new RegExp(/\s*(UE_DEPRECATED\s*\(.*\))/);
	public static PRAGMA                 = new RegExp(/\s*(PRAGMA_\w+WARNINGS)/);
	public static DECLARE                = new RegExp(/\s*(DECLARE_\w+\s*\(.*\))/);
	public static UMETA                  = new RegExp(/\s*(UMETA\s*\(.*\))/);
	public static ENGINE_API             = new RegExp(/(ENGINE_API\s*)/);

	public static DefLuaClass  = new RegExp(/\s*(DefLuaClass\s*\(.*\))/);
	public static DefLuaMethod = new RegExp(/\s*(DefLuaMethod\s*\(.*\))/);
	public static EndDef       = new RegExp(/\s*(EndDef\s*\(.*\))/);
}

enum CppFileType {
	CppHeaderFile = 0,
	CppSourceFile = 1,
}
