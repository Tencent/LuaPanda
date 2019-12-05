import * as Tools from '../codeTools';
import { CodeSymbol } from '../codeSymbol';
import { CppCodeProcessor } from './cppCodeProcessor';
import { SluaCSharpProcessor } from './sluaCSharpProcessor';
import fs = require('fs');

//基类的作用是完成一些公共方法，对外暴露接口，屏蔽下层
export class NativeCodeExportBase {
    // 导出文件存放根路径
    private static _LuaPandaInterfaceIntelliSenseResPath;
	public static get LuaPandaInterfaceIntelliSenseResPath() {
		if(!this._LuaPandaInterfaceIntelliSenseResPath){
            this._LuaPandaInterfaceIntelliSenseResPath = Tools.getVSCodeOpenedFolder() + "/.vscode/LuaPanda/IntelliSenseRes/";
        }
        return this._LuaPandaInterfaceIntelliSenseResPath;
    }

    // 加载原生接口导出的分析结果
	public static loadIntelliSenseRes() {
        // 如果文件存在，刷新
        let dirPath = this.LuaPandaInterfaceIntelliSenseResPath;
        if (fs.existsSync(dirPath)) {
            CodeSymbol.refreshPreLoadSymbals(dirPath);
		}
	}
    
    // 收到需要预处理的文件
    public static processNativeCodeDir(anaPath){
        anaPath = anaPath.trim();
        CppCodeProcessor.processCppDir(anaPath);
        SluaCSharpProcessor.processluaCSDir(anaPath);    
    }
}