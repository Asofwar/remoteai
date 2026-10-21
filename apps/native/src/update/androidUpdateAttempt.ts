export class AndroidUpdateCancelled extends Error {
  constructor() { super('Update download cancelled'); }
}

/** A cancellation gate prevents a finishing source from starting a fallback or publishing success. */
export class AndroidUpdateAttempt {
  private cancellation: Promise<void> | null = null;
  private cancelled = false;

  get acceptsProgress() { return !this.cancellation && !this.cancelled; }

  async checkActive() {
    // A failed cancellation leaves the existing download usable.
    await this.cancellation?.catch(() => undefined);
    if (this.cancelled) throw new AndroidUpdateCancelled();
  }

  cancel(stop: () => Promise<void>) {
    if (this.cancellation) return this.cancellation;
    this.cancellation = Promise.resolve().then(stop).then(() => { this.cancelled = true; })
      .finally(() => { this.cancellation = null; });
    return this.cancellation;
  }
}
