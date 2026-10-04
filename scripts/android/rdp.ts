import net from 'node:net';

/* A packet of the Firefox remote debugging protocol: JSON sent as "<byte length>:<JSON>" */
export type Packet = Record<string, unknown> & { from?: string; type?: string; error?: string; message?: string };

interface Waiter {
  match: (packet: Packet) => boolean;
  resolve: (packet: Packet) => void;
}

const DEFAULT_TIMEOUT_MS = 15000;
/* An await in an evaluation can take a while: a page load, a message round trip */
const EVALUATION_TIMEOUT_MS = 30000;

/**
 * A minimal client of the Firefox remote debugging protocol (RDP), enough to install an add-on and
 * evaluate code in its pages and in tabs. Each request waits for the next packet from its actor
 * that is a reply rather than an event (no type, or an error)
 */
export class RdpClient {
  readonly events: Packet[] = [];
  private buffer = Buffer.alloc(0);
  private readonly waiters: Waiter[] = [];

  private constructor(private readonly socket: net.Socket) {
    socket.on('data', chunk => this.receive(chunk));
  }

  /**
   * Connect and wait for the greeting of the root actor
   * @param port - The local port that adb forwards to Firefox's debugger socket
   * @returns The connected client
   */
  static async connect(port: number): Promise<RdpClient> {
    const socket = net.connect(port, '127.0.0.1');
    const client = new RdpClient(socket);
    const greeting = client.wait(packet => packet.from === 'root' && packet.applicationType !== undefined);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve);
      socket.once('error', reject);
    });
    await greeting;
    return client;
  }

  close(): void {
    this.socket.destroy();
  }

  /**
   * Wait for a packet
   * @param match - Whether a packet is the awaited one
   * @param timeoutMs - How long to wait
   * @returns The first matching packet
   */
  wait(match: (packet: Packet) => boolean, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Packet> {
    return new Promise((resolve, reject) => {
      const waiter: Waiter = {
        match,
        resolve: packet => {
          clearTimeout(timer);
          resolve(packet);
        },
      };
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1);
        reject(new Error(`No answer from Firefox within ${timeoutMs / 1000} s`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
  }

  /**
   * Send a request to an actor and wait for its reply
   * @param to - The actor
   * @param type - The request type
   * @param extra - The other fields of the request
   * @returns The reply; an error reply is thrown
   */
  async request(to: string, type: string, extra: Record<string, unknown> = {}): Promise<Packet> {
    const reply = this.wait(packet => packet.from === to && (packet.type === undefined || packet.error !== undefined));
    this.send({ to, type, ...extra });
    const packet = await reply;
    if (packet.error) throw new Error(`${type}: ${packet.error} ${packet.message ?? ''}`.trim());
    return packet;
  }

  /**
   * Evaluate an expression in a page; a promise it returns is awaited
   * @param consoleActor - The console actor of the page's target
   * @param text - The expression
   * @returns The value, which must be a string: return JSON.stringify(...) for anything else
   */
  async evaluate(consoleActor: string, text: string): Promise<string> {
    const { resultID } = await this.request(consoleActor, 'evaluateJSAsync', { text, mapped: { await: true } });
    const result = await this.wait(packet => packet.type === 'evaluationResult' && packet.resultID === resultID, EVALUATION_TIMEOUT_MS);
    if (result.exceptionMessage) throw new Error(`Evaluation failed: ${String(result.exceptionMessage)}`);
    /* A string is sent as is, or as a grip of type longString past a length */
    const value = result.result as string | { type: string; initial?: string };
    if (typeof value === 'string') return value;
    if (value.type === 'longString' && value.initial !== undefined) return value.initial;
    throw new Error(`Evaluation returned ${value.type}, not a string`);
  }

  private send(packet: Packet): void {
    const json = JSON.stringify(packet);
    this.socket.write(`${Buffer.byteLength(json)}:${json}`);
  }

  private receive(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const colon = this.buffer.indexOf(0x3a);
      if (colon < 0) return;
      const length = Number(this.buffer.subarray(0, colon).toString());
      if (this.buffer.length < colon + 1 + length) return;
      const packet = JSON.parse(this.buffer.subarray(colon + 1, colon + 1 + length).toString()) as Packet;
      this.buffer = this.buffer.subarray(colon + 1 + length);
      if (packet.type) this.events.push(packet);
      const index = this.waiters.findIndex(waiter => waiter.match(packet));
      if (index >= 0) this.waiters.splice(index, 1)[0].resolve(packet);
    }
  }
}
