const countNewlines = (text: string) => text.split('\n').length - 1;

/**
 * Collects command output without keeping all of it: the start and the end are kept, the middle is dropped and
 * counted. Memory stays bounded however much a command prints.
 */
export class OutputCapture {
  private readonly half: number;
  private head = '';
  private tail = '';
  private omittedNewlines = 0;
  private omittedAny = false;

  constructor(maxChars: number) {
    this.half = Math.max(1, Math.floor(maxChars / 2));
  }

  push(chunk: string): void {
    const room = this.half - this.head.length;
    let rest = chunk;
    if (room > 0) {
      this.head += chunk.slice(0, room);
      rest = chunk.slice(room);
    }
    if (!rest) return;
    this.tail += rest;
    if (this.tail.length > this.half) {
      const dropped = this.tail.slice(0, this.tail.length - this.half);
      this.omittedNewlines += countNewlines(dropped);
      this.omittedAny = true;
      this.tail = this.tail.slice(-this.half);
    }
  }

  result(): string {
    if (!this.omittedAny) return this.head + this.tail;
    return `${this.head}\n[${Math.max(1, this.omittedNewlines)} lines omitted]\n${this.tail}`;
  }
}
