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
	private static cppCodeGenResPath: string;

	/**
	 * 设置工作空间根目录
	 * @param workspaceRootPath 工作空间根目录。
	 */
	public static setWorkspaceRootPath(workspaceRootPath: string | null) {
		this.workspaceRootPath = workspaceRootPath;
		this.cppCodeGenResPath = path.join(this.workspaceRootPath, '.vscode/LuaAnalyzerRes/cpp');
	}
	/**
	 * 将静态导出的C++代码处理成Lua table用于代码提示。
	 * @param cppDir C++代码根目录。
	 */
	public static processCppDir(cppDir: string) {
		let cppHeaderFiles = this.getCppHeaderFiles(cppDir);
		let cppSourceFiles = this.getCppSourceFiles(cppDir);
		// cppSourceFiles.forEach((filePath: string) => {
		cppHeaderFiles.forEach((filePath: string) => {
			this.parseCppFile(filePath);
		});
	}

	private static parseCppFile(filePath: string) {
		let cppText = Tools.getFileContent(filePath);

		let parseProcess: Promise<Node | undefined> = parseAst({
			input: cppText,
			language: Language.cpp,
			omitPosition: true,
			text: true,
			basePath: this.getWasmDir()
		});

		parseProcess.then(
			(astNode) => {
				let str = JSON.stringify(astNode, null, 2);
				Logger.DebugLog(str);
				this.parseAST2LuaCode(astNode);
			}
		)
		.catch((e) => {
			Logger.ErrorLog("Parse cpp file failed, filePath: " + filePath +" error: ");
			Logger.ErrorLog(e.message);
		});
	}

	private static parseAST2LuaCode(astNode: Node) {
		let foundUCLASS: boolean = false;
		astNode.children.forEach((child: Node) => {
			if (child.type == 'comment') {
				return;
			}

			if (child.type == 'expression_statement' && child.text.match(URegex.UCLASS)) {
				// 标记找到UCLASS，即下一个Node。
				foundUCLASS = true;
				return;
			}
			if (foundUCLASS == true) {
				let result = this.handleUCLASS(child);
				foundUCLASS = false;
				let filePath = path.join(this.cppCodeGenResPath, result.className + '.lua');
				this.appendText2File(result.luaText, filePath);
				CodeSymbol.refreshSinglePreLoadFile(filePath);
			}
		});
	}

	private static handleUCLASS(astNode: Node): {luaText: string, className: string} {
		let luaText = '';
		let className = '';
		astNode.children.forEach((child: Node) => {
			if (child.type == 'identifier') {
				luaText += child.text + " = {}\n";
				className = child.text;
				return;
			}
			if (child.type == 'compound_statement') {
				luaText += this.handleCompoundStatement(child, className);
			}
		});
		return {luaText: luaText, className: className};
	}

	private static handleCompoundStatement(astNode: Node, className: string): string {
		let luaText = '';
		let foundUFUNCTION = false;
		let foundUPROPERTY = false;
		astNode.children.forEach((child: Node) => {
			if (child.type == 'comment') {
				return;
			}

			if (foundUFUNCTION == true) {
				luaText += this.handleUFUNCTION(child, className);
				foundUFUNCTION = false;
				return;
			}
			if (foundUPROPERTY == true) {
				luaText += this.handleUPROPERTY(child, className);
				foundUPROPERTY = false;
				return;
			}

			if (child.type == 'expression_statement' && child.text.match(URegex.UFUNCTION)) {
				foundUFUNCTION = true;
				return;
			}
			if (child.type == 'expression_statement' && child.text.match(URegex.UPROPERTY)) {
				foundUPROPERTY = true;
				return;
			}
		});
		return luaText;
	}
	private static handleUFUNCTION(astNode: Node, className: string): string {
		let luaText = 'function ';

		astNode.children.forEach((child: Node) => {
			if (child.type == 'function_declarator') {
				luaText += this.handleFunctionDeclarator(child, className);
				return;
			}
		});
		luaText += ' end\n';
		return luaText;
	}

	private static handleFunctionDeclarator(astNode: Node, className: string): string {
		let luaText = '';

		astNode.children.forEach((child: Node) => {
			if (child.type == 'identifier') {
				luaText += className + '.' + child.text;
				return;
			}
			if (child.type == 'parameter_list') {
				luaText += this.handleParameterList(child, className);
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
				child.children.forEach((child: Node) => {
					if (child.type == 'identifier') {
						params.push(child.text);
					}
				});
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

	private static handleUPROPERTY(astNode: Node, className: string): string {
		let luaText = '';

		astNode.children.forEach((child: Node) => {
			if (child.type == 'identifier') {
				luaText += className + '.' + child.text + " = nil\n";
				return;
			}
			if (child.type == 'init_declarator') {
				child.children.forEach((child: Node) => {
					if (child.type == 'identifier') {
						luaText += className + '.' + child.text + " = nil\n";
						return;
					}
				});
				return;
			}
		});
		return luaText;
	}
	private static parseNode(astNode: Node, luaObject: Object) {
		let str = JSON.stringify(astNode, null, 2);

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
	private static removeCppCodeGenRes(dirPath: string) {
		if (fs.existsSync(dirPath)) {
			let files = fs.readdirSync(dirPath);
			files.forEach((file) => {
				let currentPath = path.join(dirPath, file);
				if (fs.statSync(currentPath).isDirectory()) {
					this.removeCppCodeGenRes(currentPath);
				} else {
					fs.unlinkSync(currentPath);
					// 删除preload symbol
					CodeSymbol.refreshSinglePreLoadFile(currentPath);
				}
			});
			fs.rmdirSync(dirPath);
		}
	}
}

class URegex {
	public static UCLASS    = new RegExp(/\s*UCLASS\(.*\)/);
	public static UFUNCTION = new RegExp(/\s*UFUNCTION\(.*\)/);
	public static UPROPERTY = new RegExp(/\s*UPROPERTY\(.*\)/);
}