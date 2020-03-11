import * as Tools from '../codeTools';
import { CodeSymbol } from '../codeSymbol';
import { CppCodeProcessor } from './cppCodeProcessor';
import { SluaCSharpProcessor } from './sluaCSharpProcessor';
import { Logger } from '../codeLogManager';
import fs = require('fs');

//基类的作用是完成一些公共方法，对外暴露接口，屏蔽下层
export class NativeCodeExportBase {
    // 导出文件存放根路径
    private static _LuaPandaInterfaceIntelliSenseResPath;
	public static get LuaPandaInterfaceIntelliSenseResPath() {
		if(!this._LuaPandaInterfaceIntelliSenseResPath){
            // stuartwang TODO
            this._LuaPandaInterfaceIntelliSenseResPath = Tools.getVSCodeOpenedFolders() + "/.vscode/LuaPanda/IntelliSenseRes/";
        }
        return this._LuaPandaInterfaceIntelliSenseResPath;
    }

    // 加载原生接口导出的分析结果
	public static loadIntelliSenseRes() {
        // 如果文件存在，刷新
        let dirPath = this.LuaPandaInterfaceIntelliSenseResPath;
        if (fs.existsSync(dirPath)) {
            CodeSymbol.refreshUserPreloadSymbals(dirPath);
		}
	}
    
    // 收到需要预处理的文件
    public static processNativeCodeDir(anaPath){
        // 判断预处理的路径是否存在
        if (!fs.existsSync(anaPath)) {
            Logger.ErrorLog("输入了不存在的路径!");
			return;
		}

        anaPath = anaPath.trim();
        let cppfileCount = CppCodeProcessor.processCppDir(anaPath);
        let csfileCount = SluaCSharpProcessor.processluaCSDir(anaPath);
        let tipString = '处理完成，解析了 ';
        if(cppfileCount > 0){
            tipString += cppfileCount + ' 个cpp文件，';
        }
        if(csfileCount > 0){
            tipString += csfileCount + ' 个c#文件。';
        }

        tipString += '请重启 VSCode 以加载解析出的 lua 符号文件!'
        Tools.showTips(tipString);
    }
}