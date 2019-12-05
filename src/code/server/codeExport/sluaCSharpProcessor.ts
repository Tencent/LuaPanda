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
        CodeSymbol.refreshPreLoadSymbals(this.sluaCSharpInterfaceIntelliSenseResPath);
	}

    // sluaUE的分析路径
	public static get sluaCSharpInterfaceIntelliSenseResPath() {
		if(!this._sluaCSharpInterfaceIntelliSenseResPath){
            this._sluaCSharpInterfaceIntelliSenseResPath = Tools.getVSCodeOpenedFolder() + "/.vscode/LuaPanda/IntelliSenseRes/SluaCSharpInterface/";        
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

        // 移除已有文件夹
        // this.removeCppInterfaceIntelliSenseRes(path.join(this.cppInterfaceIntelliSenseResPath, subDir));
        // 读取用户路径下的文件列表
        // let cppHeaderFiles = this.getCppHeaderFiles(cppDir);
		// let cppSourceFiles = this.getCppSourceFiles(cppDir);

        // 从cppDir中读出files列表
        let files = this.getCSharpFiles(cppDir);

		this.readSluaCSSymbols(files, subDir);
        CodeSymbol.refreshPreLoadSymbals(intelLuaPath);
		Tools.showTips('处理完成！');
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
        let wtpath = this.sluaCSharpInterfaceIntelliSenseResPath + writepath;
        this.makeDirSync(wtpath);
        // 读取文件内容
        for (const file of filepath) {
            let codeTxt = Tools.getFileContent(file);
            if(codeTxt){
                let luaTxt = this.parseSluaCSSymbols(codeTxt);
                if(luaTxt && luaTxt != ""){
                    let aaac = wtpath + '/' + path.basename(file, "cs") + "lua";
                    fs.writeFileSync(aaac, luaTxt);
                }
            }
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
                    //函数         addMember(l,getItem);\n\
                    let functionObj = new Object();
                    functionObj['var'] = paras[2] ;
                    functionObj['type'] = "variable";
                    members.push(functionObj);
                }else if(paras[3]){
                    //成员         addMember(l,"name",get_name,set_name,true);\n\
                    let varObj = new Object();
                    varObj['var'] = paras[3] + '()';
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
        console.log(luaCode);
        return luaCode;
    }
}