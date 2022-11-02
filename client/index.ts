import {
    AssignHostMessage, GameMessage, JoinMessage, LeaveMessage, Message,
    MessageTarget,
    MessageType, StateRequestMessage, StateUpdateMessage
} from "./protocol";
import { toOpen } from "./websocket";

export * from "./protocol";


export class GameServerConnection {
    public id: string;
    protected state: {[key: string]: any} = {};
    protected peers: string[] = [];

    private ws: WebSocket;

    // handler hooks
    private messageHandlers: ((data: GameMessage) => void)[] = [];
    private joinHandlers: ((data: JoinMessage) => void)[] = [];
    private leaveHandlers: ((data: JoinMessage) => void)[] = [];
    private stateHandlers: { [key: string]: ((state: any, name: string) => void)[] } = {};
    private onHost?: (hconn: HostConnection) => void;

    constructor(ws: WebSocket, onHost?: (hconn: HostConnection) => void) {
        this.ws = ws;
        this.id = crypto.randomUUID();
        this.ws.addEventListener("message", (e) => this.handleMessage(e));
        this.onHost = onHost;
    }

    // websockets

    protected wsend<T extends Message>(m: T): void {
        this.ws.send(JSON.stringify(m));
    }

    private async handshake(): Promise<void> {
        await toOpen(this.ws);
        this.wsend({
            to: MessageTarget.Server,
            from: this.id,
            type: MessageType.Join
        });
    }

    // Message Handlers

    private handleMessage(e: MessageEvent<Message>): void {
        if (e.data.to != this.id || (e.data.to == MessageTarget.All && this.id != MessageTarget.Host)) {
            return;
        }

        if (e.data.type == MessageType.AssignHost) {
            this.handleAssignHost(e.data as AssignHostMessage);
        } else if (e.data.type == MessageType.Join) {
            this.handleJoin(e.data as JoinMessage);
        } else if (e.data.type == MessageType.Leave) {
            this.handleLeave(e.data as LeaveMessage);
        } else if (e.data.type == MessageType.StateUpdate) {
            this.handleStateUpdate(e.data as StateUpdateMessage);
        } else if (e.data.type == MessageType.StateRequest) {
            this.handleStateRequest(e.data as StateRequestMessage);
        } else if (e.data.type == MessageType.GameMessage) {
            this.handleGameMessage(e.data as GameMessage);
        }
    }

    protected handleAssignHost(m: AssignHostMessage): void {
        if (this.onHost) {
            this.onHost(new HostConnection(this.ws));
        }
    }

    protected handleJoin(m: JoinMessage): void {
        this.peers.push(m.from);
        for (const handler of this.joinHandlers) {
            handler(m);
        }
    }

    protected handleLeave(m: JoinMessage): void {
        this.peers = this.peers.filter((p) => p != m.from);
        for (const handler of this.leaveHandlers) {
            handler(m);
        }
    }

    protected handleStateUpdate(m: StateUpdateMessage): void {
        Object.assign(this.state, m.states);
        for (const key of m.states.keys()) {
            if (this.stateHandlers[key]) {
                for (const handler of this.stateHandlers[key]) {
                    handler(this.state[key], key);
                }
            }
        }
    }

    protected handleStateRequest(m: StateRequestMessage): void {
        this.pushStates(m.from, m.keys);
    }

    protected handleGameMessage(m: GameMessage): void {
        for (const handler of this.messageHandlers) {
            handler(m);
        }
    }

    // State

    private pushStates(client: string, states: string[]): void {
        this.wsend({
            from: this.id,
            to: client,
            type: MessageType.StateUpdate,
            states: Object.fromEntries(states.map((k) => [k, this.state[k]]))
        });
    }

    public setState(key: string, value: any): void {
        this.state[key] = value;
        this.pushStates(MessageTarget.All, [key]);
    }

    public requestState(...keys: string[]) {
        this.wsend({
            from: this.id,
            to: MessageTarget.Host,
            type: MessageType.StateRequest,
            keys: keys
        });
    }

    public async getState<T>(key: string): Promise<T> {
        if (!(key in this.state)) {
            this.requestState(key);
            await this.nextStateUpdate(key);
        }

        return this.state[key];
    }

    // Hooks

    public onStateUpdate(key: string, callback: (value: any) => void): void {
        if (!this.stateHandlers[key]) {
            this.stateHandlers[key] = [];
        }

        this.stateHandlers[key].push(callback);
    }

    public onStateUpdateOnce(key: string, callback: (value: any) => void): void {
        const cback = (value: any) => {
            callback(value);
            this.stateHandlers[key] = this.stateHandlers[key].filter((h) => h != cback);
        }
        this.onStateUpdate(key, cback);
    }

    public nextStateUpdate<T>(key: string): Promise<T> {
        return new Promise<T>((resolve) => {
            this.onStateUpdateOnce(key, resolve);
        });
    }

    public onJoin(callback: (m: JoinMessage) => void): void {
        this.joinHandlers.push(callback);
    }

    public onLeave(callback: (m: LeaveMessage) => void): void {
        this.leaveHandlers.push(callback);
    }

    public onMessage(callback: (m: GameMessage) => void): void {
        this.messageHandlers.push(callback);
    }

}

class HostConnection extends GameServerConnection {
    constructor(ws: WebSocket) {
        super(ws);
        this.id = MessageTarget.Host;
    }
}
