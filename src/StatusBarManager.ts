import * as vscode from 'vscode';

export class StatusBarManager {

    private static MemStateBar;
    public static init() {
        this.MemStateBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.0);
        this.MemStateBar.tooltip = "Click to collect garbage";
        this.MemStateBar.command = 'luapanda.LuaGarbageCollect';
    }

    //刷新内存数据显示区的值
    public static refreshLuaMemNum(num: Number) {
        this.MemStateBar.text = String(num) + "KB";
        this.MemStateBar.show();
    }

    //按钮恢复到初始状态
    public static reset() {

    }
}
