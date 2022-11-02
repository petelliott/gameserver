
export enum MessageTarget {
    Server = "server",
    Host = "host",
    All = "all"
}

export enum MessageType {
    AssignHost = 0,
    Join,
    Leave,
    StateUpdate,
    StateRequest,
    GameMessage
}

export interface Message {
    from: string;
    to: string;
    type: MessageType;
}

export interface AssignHostMessage extends Message {
}

export interface JoinMessage extends Message {
}

export interface LeaveMessage extends Message {
}

export interface StateUpdateMessage extends Message {
    states: {
        [key: string]: any;
    }
}

export interface StateRequestMessage extends Message {
    keys: string[];
}


export interface GameMessage extends Message {
    data: any;
}