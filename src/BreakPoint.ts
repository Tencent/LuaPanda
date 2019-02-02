import { DebugProtocol } from 'vscode-debugprotocol';

export class LineBreakpoint implements DebugProtocol.Breakpoint {
    verified: boolean;
    line: number;
    constructor(verified: boolean, line: number, id: number, column?: number) {
        this.verified = verified;
        this.line = line;
    }
}

export class ConditionBreakpoint implements DebugProtocol.Breakpoint, DebugProtocol.SourceBreakpoint {
    verified: boolean;
    line: number;
    condition: string;
    constructor(verified: boolean, line: number, condition: string, id: number) {
        this.verified = verified;
        this.line = line;
        this.condition = condition;
    }
}

export class LogPoint implements DebugProtocol.Breakpoint, DebugProtocol.SourceBreakpoint {
    verified: boolean;
    line: number;
    logMessage: string;
    constructor(verified: boolean, line: number, logMessage: string, id: number) {
        this.verified = verified;
        this.line = line;
        this.logMessage = logMessage;
    }
}
