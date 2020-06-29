// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

import * as Tools from './codeTools';
import { Logger } from './codeLogManager';

// 保存Editor中的代码
export class CodeEditor {
	public static codeInEditor = new Map<string, string>();	

	public static saveCode( uri : string , text : string) {
		this.codeInEditor[uri] = text;
	}

	public static  getCode( uri : string ): string {
		if(this.codeInEditor[uri]){
			return this.codeInEditor[uri];
		}else{
			let luatxt =  Tools.getFileContent(Tools.uriToPath(uri));
			if(!luatxt){
				Logger.InfoLog("Can’t get file content. uri:" + uri);
				return;
			}
			return luatxt;
		}
	}
}