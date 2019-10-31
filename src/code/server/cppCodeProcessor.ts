/*---------------------------------------------------------
	Created by stuartwang/wangqing 3030078087@qq.com
			   GrandZhuo           lizhuo93@foxmail.com
	Date: 2019-10-15
 *--------------------------------------------------------*/

import path = require('path');
import dir = require('path-reader');
import fs = require('fs');
import { parseAst, Language, Node } from 'univac';
import { Logger } from './LogManager';
import { CodeSymbol } from './codeSymbol';
import * as Tools from './tools';

export class CppCodeProcessor {
	// workspace 根目录，server初始化时设置。
	private static workspaceRootPath: string | null;
	private static cppInterfaceIntelliSenseResPath: string | null;

	/**
	 * 设置工作空间根目录
	 * @param workspaceRootPath 工作空间根目录。
	 */
	public static setWorkspaceRootPath(workspaceRootPath: string | null) {
		this.workspaceRootPath = workspaceRootPath;
		this.cppInterfaceIntelliSenseResPath = path.join(this.workspaceRootPath, '.vscode/LuaAnalyzer/IntelliSenseRes/UECppInterface');
	}
	/**
	 * 将静态导出的C++代码处理成Lua table用于代码提示。
	 * @param cppDir C++代码根目录。
	 */
	public static processCppDir(cppDir: string) {
		this.removeCppInterfaceIntelliSenseRes(this.cppInterfaceIntelliSenseResPath);
		let cppHeaderFiles = this.getCppHeaderFiles(cppDir);
		let cppSourceFiles = this.getCppSourceFiles(cppDir);

		this.parseCppFiles(cppHeaderFiles);
	}

	private static async parseCppFiles(filePaths: string[]) {
		for (let i = 0; i < filePaths.length; i++) {
			let cppText = this.getCppCode(filePaths[i]);

			let astNode: Node;
			try {
				astNode = await parseAst({
					input: cppText,
					language: Language.cpp,
					omitPosition: true,
					text: true,
					basePath: this.getWasmDir()
				});
				this.parseAST2LuaCode(astNode);
			} catch(e) {
				Logger.ErrorLog("Parse cpp file failed, filePath: " + filePaths[i] +" error: ");
				Logger.ErrorLog(e);
			}
		}
	}

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

	/**
	 * 获取文件内容，并对内容进行预处理。
	 * 将 class XXX ClassName 替换为 class className
	 * 去除宏 GENERATED_BODY
	 * 去除宏 GENERATED_UCLASS_BODY
	 * 去除宏 GENERATED_USTRUCT_BODY
	 * 去除宏 DEPRECATED
	 * @param filePath 文件路径。
	 */
	private static getCppCode(filePath): string {
		let content = Tools.getFileContent(filePath);
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

		// 去除宏 GENERATED_BODY
		regex = URegex.GENERATED_BODY;
		while ((result = regex.exec(content)) !== null) {
			content = content.replace(result[1], '//');
		}
		// 去除宏 GENERATED_UCLASS_BODY
		regex = URegex.GENERATED_UCLASS_BODY;
		while ((result = regex.exec(content)) !== null) {
			content = content.replace(result[1], '//');
		}
		// 去除宏 GENERATED_USTRUCT_BODY
		regex = URegex.GENERATED_USTRUCT_BODY;
		while ((result = regex.exec(content)) !== null) {
			content = content.replace(result[1], '//');
		}
		// 去除宏 DEPRECATED
		regex = URegex.DEPRECATED;
		while ((result = regex.exec(content)) !== null) {
			content = content.replace(result[1], '//');
		}
		// 去除UMETA(xxx）
		regex = URegex.UMETA;
		while ((result = regex.exec(content)) !== null) {
			content = content.replace(result[1], '');
		}

		return content;
	}

	private static parseAST2LuaCode(astNode: Node) {
		let foundUCLASS: boolean = false;
		let foundUSTRUCT: boolean = false;
		let foundUENUM: boolean = false;

		astNode.children.forEach((child: Node) => {
			if (child.type == 'comment') {
				return;
			}

			if (child.type == 'expression_statement' && child.text.match(URegex.UCLASS)) {
				// 标记找到UCLASS，即下一个Node。
				foundUCLASS = true;
			} else if (child.type == 'expression_statement' && child.text.match(URegex.USTRUCT)) {
				foundUSTRUCT = true;
			} else if (child.type == 'expression_statement' && child.text.match(URegex.UENUM)) {
				foundUENUM = true;
			} else if (foundUCLASS == true) {
				let result = this.handleUCLASS(child);
				foundUCLASS = false;
				let filePath = path.join(this.cppInterfaceIntelliSenseResPath, result.className + '.lua');
				this.appendText2File(result.luaText, filePath);
				CodeSymbol.refreshSinglePreLoadFile(filePath);
			} else if (foundUSTRUCT == true) {
				let result = this.handleUSTRUCT(child);
				foundUSTRUCT = false;
				let filePath = path.join(this.cppInterfaceIntelliSenseResPath, result.structName + '.lua');
				this.appendText2File(result.luaText, filePath);
				CodeSymbol.refreshSinglePreLoadFile(filePath);
			} else if (foundUENUM == true) {
				let result = this.handleUENUM(child);
				foundUENUM = false;
				let filePath = path.join(this.cppInterfaceIntelliSenseResPath, result.enumType + '.lua');
				this.appendText2File(result.luaText, filePath);
				CodeSymbol.refreshSinglePreLoadFile(filePath);
			} else if (child.type == 'namespace_definition') {
				// 外层有namespace的情况，要放到UENUM后面，UENUM后面的节点有可能是namespace
				child.children.forEach((child: Node) => {
					if (child.type == 'declaration_list') {
						this.parseAST2LuaCode(child);
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

		if (astNode.type == 'struct_specifier') {
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
		} else if (astNode.type == 'declaration') {
			astNode.children.forEach((child: Node) => {
				if (child.type == 'struct_specifier') {
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

		if (astNode.type == 'namespace_definition') {
			astNode.children.forEach((child: Node) => {
				switch (child.type) {
					case 'identifier':
						enumType = child.text;
						break;

					case 'declaration_list':
						child.children.forEach((child: Node) => {
							if (child.type == 'enum_specifier') {
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
		} else if (astNode.type == 'enum_specifier') {
			let result = this.handleEnumSpecifier(astNode);
			enumType = result.enumType;
			luaText += enumType + ' = {}\n';
			result.enumeratorList.forEach((enumerator) => {
				luaText += enumType + '.' + enumerator + ' = nil\n';
			});
		} else if (astNode.type == 'declaration') {
			// enum class
			astNode.children.forEach((child: Node) => {
				if (child.type == 'init_declarator') {
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
		let luaText = '';
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
		let luaText = '';
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
			if (child.type == 'enumerator' || child.type == 'identifier') {
				enumeratorList.push(child.text);
			}
		});

		return enumeratorList;
	}

	private static handleBaseClassClause(astNode: Node, className: string): string[] {
		let baseClass: string[] = [];
		astNode.children.forEach((child: Node) => {
			if (child.type == 'type_identifier') {
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
			if (child.type == 'comment') {
				return;
			}

			if (foundUFUNCTION == true) {
				uFunctions += this.handleUFUNCTION(child, className);
				foundUFUNCTION = false;
			} else if (foundUPROPERTY == true) {
				uPropertys += this.handleUPROPERTY(child, className);
				foundUPROPERTY = false;
			} else if ((child.type == 'field_declaration' || child.type == 'declaration') && child.text.match(URegex.UFUNCTION)) {
				foundUFUNCTION = true;
			} else if ((child.type == 'field_declaration' || child.type == 'declaration') && child.text.match(URegex.UPROPERTY)) {
				foundUPROPERTY = true;
			} else if (child.type == 'preproc_if' || child.type == 'preproc_ifdef') {
				let declarationList = this.handleDeclarationList(child, className);
				uPropertys += declarationList.uPropertys;
				uFunctions += declarationList.uFunctions;
			}
		});
		return {uPropertys: uPropertys, uFunctions: uFunctions};
	}

	private static handleUFUNCTION(astNode: Node, className: string): string {
		let luaText = 'function ';

		astNode.children.forEach((child: Node) => {
			switch (child.type) {
				case 'function_declarator':
					luaText += this.handleFunctionDeclarator(child, className);
					break;

				// 函数返回类型为指针或引用，需要向内解一层
				case 'pointer_declarator':
				case 'reference_declarator':
					child.children.forEach((child: Node) => {
						if (child.type == 'function_declarator') {
							luaText += this.handleFunctionDeclarator(child, className);
						}
					});
					break;
			}
		});
		luaText += ' end\n';
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
			if (child.type == 'parameter_declaration') {
				params = params.concat(this.handleParameterDeclaration(child));
			}
		});
		for (let i = 0; i < params.length; i++) {
			if (i == 0) {
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
			if (child.type == 'identifier') {
				param = child.text;
			}
		});
		return param;
	}

	private static handlePointerDeclarator(astNode: Node): string {
		let param = '';
		astNode.children.forEach((child: Node) => {
			if (child.type == 'identifier') {
				param = child.text;
			}
		});
		return param;
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
						if (child.type == 'identifier') {
							luaText += className + '.' + child.text + " = nil\n";
						}
					});
					break;

				case 'pointer_declarator':
				case 'reference_declarator':
					child.children.forEach((child: Node) => {
						if (child.type == 'field_identifier') {
							luaText += className + '.' + child.text + " = nil\n";
						}
					});
					break;
			}
		});
		return luaText;
	}

	/**
	 * 获取tree-sitter wasm文件目录
	 */
	private static getWasmDir(): string {
		return path.join(__dirname, "/../node_modules/univac/dist/static/");
	}

	private static getCppHeaderFiles(dirPath: string) {
		let options = {
			sync: true,
			recursive: true,
			valuetizer:function(stat:fs.Stats, fileShortName: string, fileFullPath: string) {
				if (stat.isDirectory()) {
					return fileFullPath;
				}
				return fileShortName.match(/\.h/)? fileFullPath : null;
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
				return fileShortName.match(/\.cpp/)? fileFullPath : null;
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
					CodeSymbol.refreshSinglePreLoadFile(currentPath);
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
	public static UMETA                  = new RegExp(/\s*(UMETA\s*\(.*\))/);
}