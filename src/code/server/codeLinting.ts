// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

// 语法检查
import {
	TextDocument,
	// Connection,
	DiagnosticSeverity,
	Diagnostic,
	Range
} from 'vscode-languageserver';
import  * as Tools  from "./codeTools";
import { LuaAnalyzerSettings } from "./server";
import { spawnSync } from 'child_process';

let os = require('os');

export class CodeLinting {
	static luacheckResultRegExp = /^(.+):(\d+):(\d+)-(\d+): \(([EW])(\d+)\) (.+)$/;
	public static processLinting(textDocument: TextDocument, settings: LuaAnalyzerSettings, globalVariables: string[]): Promise<{}> {
		let fileName = Tools.uriToPath(Tools.urlDecode(textDocument.uri));
		let luacheck: string = this.getLuacheck(settings);
		let luacheckArgs: string[] = this.getLuacheckArgs(settings, fileName, globalVariables);
		let fileContent = textDocument.getText();
		let luacheckProcess = new Promise((resolve, reject) => {
			let checkResult = spawnSync(luacheck, luacheckArgs, {input: fileContent});
			// luacheck 错误码1或2表示检查到error或warning
			if (checkResult.status == 1 || checkResult.status == 2) {
				reject(checkResult.output.join('\n'));
			}
			else if (checkResult.status == 0) {
				resolve();
			}
			else {
				// error log
				resolve();
			}
		});
		return luacheckProcess;
	}

	private static getLuacheck(settings: LuaAnalyzerSettings): string {
		let luacheck: string = settings.codeLinting.luacheckPath;
		if ( luacheck != "") {
			return luacheck;
		}

		// 如果用户未配置则使用默认配置
		if (os.type() == "Windows_NT") {
			luacheck = Tools.getVScodeExtensionPath() +  "/res/luacheck/luacheck.exe";
		}
		else {
			luacheck = '/usr/local/bin/luacheck';
		}
		return luacheck;
	}

	private static mergeIgnoreGlobals(globalsInSetting: string[], globalVariables: string[]): string[] {
		let globalsMap = new Map<string, boolean>();
		for (let g of globalsInSetting) {
			globalsMap[g] = true;
		}
		for (let g of globalVariables) {
			if (globalsMap[g]) continue;

			let arr:string[] = g.split('.');
			globalsMap[arr[0]] = true;
		}

		let ret: string[] = [];
		for (let key in globalsMap) {
			ret.push(key)
		}
		return ret;
	}

	private static getLuacheckArgs(settings: LuaAnalyzerSettings, fileName: string, globalVariables: string[]): string[] {
		let luacheckArgs: string[] = [];

		let luaVersion = settings.codeLinting.luaVersion;
		switch (luaVersion) {
			case "5.1":
				luacheckArgs.push("--std", "lua51");
				break;
			case "5.3":
				luacheckArgs.push("--std", "lua53");
				break;
			case "5.1+5.3":
				luacheckArgs.push("--std", "lua51+lua53");
				break;
			default:
		}
		let userIgnoreGlobals: string[] = settings.codeLinting.ignoreGlobal.split(";");
		let ignoreGlobals: string[] = this.mergeIgnoreGlobals(userIgnoreGlobals, globalVariables);
		if (ignoreGlobals.length > 0) {
			luacheckArgs.push("--globals", ...ignoreGlobals);
		}
		let maxLineLength = settings.codeLinting.maxLineLength;
		luacheckArgs.push("--max-line-length", maxLineLength.toString());
		luacheckArgs.push("--allow-defined");
		luacheckArgs.push("--ranges");
		luacheckArgs.push("--codes");
		luacheckArgs.push("--formatter", "plain");
		luacheckArgs.push("--filename", fileName);
		luacheckArgs.push("-");
		return luacheckArgs;
	}

	public static parseLuacheckResult(luaErrorOrWarning, settings: LuaAnalyzerSettings) {
		let diagnosticArray: Diagnostic[] = [];

		// if (luaErrorOrWarning.stdout === undefined) {
		// 	return diagnosticArray;
		// }

		let maxNumberOfProblems = settings.codeLinting.maxNumberOfProblems;
		let ignoreErrorCode: string[] = settings.codeLinting.ignoreErrorCode.split(";");
		const luaErrorOrWarningArray: string[] = luaErrorOrWarning.split(/\r\n|\r|\n/);
		for (let i = 0, problems = 0; i < luaErrorOrWarningArray.length && problems < maxNumberOfProblems; i++) {
			let regResult = this.luacheckResultRegExp.exec(luaErrorOrWarningArray[i]);
			if (!regResult) {
				continue;
			}

			let line           = parseInt(regResult[2]);
			let startCharacter = parseInt(regResult[3]);
			let endCharacter   = parseInt(regResult[4]);
			let errorType      = regResult[5];
			let severity       = errorType == "E"? DiagnosticSeverity.Error : DiagnosticSeverity.Warning;
			let errorCode      = parseInt(regResult[6]);
			let message        = regResult[7];
			let range          = Range.create(line - 1, startCharacter - 1, line - 1, endCharacter);

			// 根据错误码忽略错误提示。luacheck ignore参数不能忽略error
			if (ignoreErrorCode.includes(errorCode.toString())) {
				continue;
			}

			let diagnosic: Diagnostic = {
				range   : range,
				severity: severity,
				code    : errorCode,
				message : message,
				source  : "lua-analyzer"
			};

			problems++;
			diagnosticArray.push(diagnosic);
		}

		return diagnosticArray;
	}
}
