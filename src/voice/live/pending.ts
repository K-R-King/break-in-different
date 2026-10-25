// The command being spoken: everything heard and not yet acted on. Cartesia ends a turn at
// every short pause, so a command spoken with pauses spans several turns; they are joined here.
// Turn updates are cumulative within a turn and never revised, so consuming mid-turn just
// remembers how much of the current turn was already used.

const join = (a: string, b: string) => (a && b ? `${a} ${b}` : a || b);

export class PendingText {
  private done = ""; // finished turns not acted on
  private turn = ""; // the turn in progress (cumulative)
  private used = 0; // characters of the current turn already acted on

  get text(): string {
    return join(this.done, this.turn.slice(this.used).trim());
  }

  update(turn: string): string {
    this.turn = turn;
    return this.text;
  }

  end(turn: string): string {
    this.done = join(this.done, turn.slice(this.used).trim());
    this.turn = "";
    this.used = 0;
    return this.text;
  }

  // The action recognizer acted on everything heard so far.
  consume(): string {
    this.done = "";
    this.used = this.turn.length;
    return this.text;
  }

  clear() {
    this.done = "";
    this.turn = "";
    this.used = 0;
  }
}
