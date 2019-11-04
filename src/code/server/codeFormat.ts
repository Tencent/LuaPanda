/*---------------------------------------------------------
	author:trixnz
	https://github.com/trixnz/vscode-lua
 *--------------------------------------------------------*/

import { CodeEditor } from './codeEditor';
import { formatText } from 'lua-fmt';
import { TextEdit, Range, Position } from 'vscode-languageserver';
import { producePatch } from 'lua-fmt';
import { parsePatch } from 'diff';

enum EditAction {
	Replace,
	Insert,
	Delete
}

class Edit {
	public action: EditAction;
	public start: Position;
	public end: Position;
	public text: string = '';

	public constructor(action: EditAction, start: Position) {
		this.action = action;
		this.start = start;
		this.end = Position.create(0, 0);
	}
}

export class CodeFormat {
	public static format(uri: string) {
		let text = CodeEditor.getCode(uri);
		let formattedText = formatText(text);
		if (process.platform === 'win32') {
			text = text.split('\r\n').join('\n');
			formattedText = formattedText.split('\r\n').join('\n');
		}

		return this.getEditsFromFormattedText(uri, text, formattedText);
	}

	public static getEditsFromFormattedText(documentUri: string, originalText: string, formattedText: string,
		startOffset: number = 0): TextEdit[] {
		const diff = producePatch(documentUri, originalText, formattedText);
		const unifiedDiffs = parsePatch(diff);

		const edits: Edit[] = [];
		let currentEdit: Edit | null = null;

		for (const uniDiff of unifiedDiffs) {
			for (const hunk of uniDiff.hunks) {
				let startLine = hunk.oldStart + startOffset;

				for (const line of hunk.lines) {
					switch (line[0]) {
						case '-':
							if (currentEdit === null) {
								currentEdit = new Edit(EditAction.Delete, Position.create(startLine - 1, 0));
							}
							currentEdit.end = Position.create(startLine, 0);
							startLine++;
							break;

						case '+':
							if (currentEdit === null) {
								currentEdit = new Edit(EditAction.Insert, Position.create(startLine - 1, 0));
							} else if (currentEdit.action === EditAction.Delete) {
								currentEdit.action = EditAction.Replace;
							}

							currentEdit.text += line.substr(1) + '\n';

							break;

						case ' ':
							startLine++;
							if (currentEdit != null) {
								edits.push(currentEdit);
							}
							currentEdit = null;
							break;
					}
				}
			}

			if (currentEdit != null) {
				edits.push(currentEdit);
			}
		}

		return edits.map(edit => {
			switch (edit.action) {
				case EditAction.Replace:
					return TextEdit.replace(Range.create(edit.start, edit.end), edit.text);
				case EditAction.Insert:
					return TextEdit.insert(edit.start, edit.text);
				case EditAction.Delete:
					return TextEdit.del(Range.create(edit.start, edit.end));
			}
		});
	}

}