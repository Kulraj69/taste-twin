export class InputError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "InputError";
  }
}

export class QlooError extends Error {
  constructor(public status = 502) {
    super("Qloo couldn’t finish this taste trip. Please try again in a moment.");
    this.name = "QlooError";
  }
}
