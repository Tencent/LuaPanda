import * as vscode from 'vscode';

export class StatusBarManager{

	private static MemStateBar;
	public static init(){
		StatusBarManager.MemStateBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.0);
		StatusBarManager.MemStateBar.tooltip = "Click to collect garbage";
	}

	//刷新内存数据显示区的值
	public static refreshLuaMemNum(num: Number){
		StatusBarManager.MemStateBar.text = String(num) + "KB";
		StatusBarManager.MemStateBar.show();
	}

	//按钮恢复到初始状态
	public static reset(){

	}
}