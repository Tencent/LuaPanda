import { DebugProtocol } from 'vscode-debugprotocol';

enum BreakpointType {
    conditionBreakpoint = 0,
    logPoint,
    lineBreakpoint
}

export class LineBreakpoint implements DebugProtocol.Breakpoint {
    verified: boolean;
    type: BreakpointType;
    line: number;
    constructor(verified: boolean, line: number, id: number, column?: number) {
        this.verified = verified;
        this.type = BreakpointType.lineBreakpoint;
        this.line = line;
    }
}

export class ConditionBreakpoint implements DebugProtocol.Breakpoint, DebugProtocol.SourceBreakpoint {
    verified: boolean;
    type: BreakpointType;
    line: number;
    condition: string;
    constructor(verified: boolean, line: number, condition: string, id: number) {
        this.verified = verified;
        this.type = BreakpointType.conditionBreakpoint;
        this.line = line;
        this.condition = condition;
    }
}

export class LogPoint implements DebugProtocol.Breakpoint, DebugProtocol.SourceBreakpoint {
    verified: boolean;
    type: BreakpointType;
    line: number;
    logMessage: string;
    constructor(verified: boolean, line: number, logMessage: string, id: number) {
        this.verified = verified;
        this.type = BreakpointType.logPoint;
        this.line = line;
        this.logMessage = logMessage;
    }
}
