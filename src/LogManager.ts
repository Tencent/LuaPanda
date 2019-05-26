import * as vscode from 'vscode';

export class DebugLogger {
    private static Ainfo;
    private static Dinfo;

    public static init() {
        DebugLogger.Ainfo = vscode.window.createOutputChannel("Adapter/log");
        DebugLogger.Ainfo.show();
        DebugLogger.Ainfo.appendLine("hello Adapter info!");

        DebugLogger.Dinfo = vscode.window.createOutputChannel("Debugger/log");
        DebugLogger.Dinfo.show();
        DebugLogger.Dinfo.appendLine("hello Debugger info!");
    }

    public static DebuggerInfo(str: string) {
        if (str != "" && str != null) {
            DebugLogger.Dinfo.appendLine(str);
        }
    }
    public static AdapterInfo(str: string) {
        if (str != "" && str != null) {
            DebugLogger.Ainfo.appendLine(str);
        }
    }
}
