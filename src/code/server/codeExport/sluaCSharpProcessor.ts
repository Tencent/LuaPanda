import * as Tools from '../codeTools';
import { Logger } from '../codeLogManager';
import fs = require('fs');
import dir = require('path-reader');
import path = require('path');
import { CodeSymbol } from '../codeSymbol';

export class SluaCSharpProcessor {
    private static _sluaCSharpInterfaceIntelliSenseResPath;

    // 加载原生接口导出的分析结果
	public static loadIntelliSenseRes() {
        CodeSymbol.refreshUserPreloadSymbals(this.sluaCSharpInterfaceIntelliSenseResPath);
	}

    // sluaUE的分析路径
	public static get sluaCSharpInterfaceIntelliSenseResPath() {
		if(!this._sluaCSharpInterfaceIntelliSenseResPath){
            // TODO support multi folder
            if(Tools.getVSCodeOpenedFolders() && Tools.getVSCodeOpenedFolders().length > 0){
                this._sluaCSharpInterfaceIntelliSenseResPath = Tools.getVSCodeOpenedFolders()[0] + "/.vscode/LuaPanda/IntelliSenseRes/SluaCSharpInterface/";        
            }
        }
        return this._sluaCSharpInterfaceIntelliSenseResPath;
	}

    // 解析文件夹
	public static processluaCSDir(cppDir: string) {
        let intelLuaPath = this.sluaCSharpInterfaceIntelliSenseResPath;
        if(!intelLuaPath){
            Logger.ErrorLog('未打开文件夹，无法使用此功能！');
			Tools.showTips('未打开文件夹，无法使用此功能！');
        }

        // 生成一个子目录对应用户代码路径
		let subDir = cppDir;
		subDir = subDir.replace(/\//g, ' ');
		subDir = subDir.replace(/\\/g, ' ');
		subDir = subDir.replace(/:/g, '');
		subDir = subDir.trim();
		subDir = subDir.replace(/ /g, '-');

        // 从cppDir中读出files列表
        let files = this.getCSharpFiles(cppDir);
		let fileCount = this.readSluaCSSymbols(files, subDir);
        CodeSymbol.refreshUserPreloadSymbals(intelLuaPath);
        // Tools.showTips('CS导出符号处理完成！共解析 ' + fileCount + ' 个文件');
        return fileCount;
    }

    private static getCSharpFiles(dirPath: string) {
		let options = {
			sync: true,
			recursive: true,
			valuetizer:function(stat:fs.Stats, fileShortName: string, fileFullPath: string) {
				if (stat.isDirectory()) {
					return fileFullPath;
				}
				return fileShortName.match(/\.cs$/)? fileFullPath : null;
			}
		};

		return dir.files(dirPath, 'file', null, options);
	}

    public static readSluaCSSymbols(filepath, writepath){
        let sluaRootPath = this.sluaCSharpInterfaceIntelliSenseResPath + writepath;
        this.makeDirSync(sluaRootPath);
        let fileCount = 0;
        // 读取文件内容
        for (const file of filepath) {
            let codeTxt = Tools.getFileContent(file);
            if(codeTxt){
                let luaTxt = this.parseSluaCSSymbols(codeTxt);
                if(luaTxt && luaTxt != ""){
                    fileCount ++;
                    let csFilePath = sluaRootPath + '/' + path.basename(file, "cs") + "lua";
                    fs.writeFileSync(csFilePath, luaTxt);
                }
            }
        }

        if(fileCount > 0){
            // 建立一个UnityEngine符号
            let engineFileName = "Lua_UnityEngine.lua";
            let engineFileContent = "UnityEngine = {}";
            fs.writeFileSync(sluaRootPath + '/' + engineFileName, engineFileContent);
        }
        return fileCount;
    }

	private static makeDirSync(dirPath: string) {
		if (fs.existsSync(dirPath)) {
			return;
		}
		let baseDir = path.dirname(dirPath);
		this.makeDirSync(baseDir);
		fs.mkdirSync(dirPath);
	}

    public static parseSluaCSSymbols(codeTxt){
        let currentClass;   //当前文件中的类
        let parentClass;    //父类
        let members = [];   //类中的成员
        //用正则分析出主成员和继承关系
        let createTypeMetatableREG =  /createTypeMetatable\((.*)\)/;
        let dver = codeTxt.match(createTypeMetatableREG);
        if(!dver) return;

        if(dver && dver.length === 2){
            let paramsArray = dver[1].split(',');
            if(paramsArray.length === 4 && paramsArray[3].trim().search('typeof') != 0){
                // "typeof(System.Collections.Generic.Dictionary<System.StringSystem.String>)" 也被逗号打断了，拼合回去
                paramsArray[2] = paramsArray[2] + paramsArray.pop();
            }

            if(paramsArray.length === 3){
                // 无继承关系
                currentClass = paramsArray[2].trim().match(/typeof\((.*)\)/)[1];
            }else if(paramsArray.length === 4){
                // 有继承关系
                currentClass = paramsArray[2].trim().match(/typeof\((.*)\)/)[1];
                parentClass = paramsArray[3].trim().match(/typeof\((.*)\)/)[1].replace('_','.');
            }
        }

        //获取所有成员
        let memberREG =  /addMember\((.*?)\)/g;
        let dver2 = codeTxt.match(memberREG);
        if(dver2) {
            for (const mems of dver2) {
                let paras = mems.match(/addMember\(l,("(.*?)"|(.*?))(,|\))/);
                if(paras[2]){
                    //成员         addMember(l,"name",get_name,set_name,true);\n\
                    let functionObj = new Object();
                    functionObj['var'] = paras[2] ;
                    functionObj['type'] = "variable";
                    members.push(functionObj);
                }else if(paras[3]){
                    //函数         addMember(l,getItem);\n\
                    let varObj = new Object();
                    let functionNameStr = paras[3];
                    functionNameStr = functionNameStr.replace(/_s$/, '');
                    varObj['var'] = functionNameStr + '()';
                    varObj['type'] = "function";
                    members.push(varObj);
                }
            }
        }

        // 构建lua文本
        let luaCode = currentClass +  " = {}";
        if(parentClass){
            luaCode += " ---@type " + parentClass;
        }
        luaCode += '\n'
        for (const oneMember of members) {
            if (oneMember.type === "variable") {
                luaCode += currentClass + '.' + oneMember.var + ' = nil\n';
            }else if(oneMember.type === "function"){
                luaCode += "function " + currentClass + '.' + oneMember.var + ' end\n';
            }

        }
        // luaCode 写入文件
        return luaCode;
    }
}