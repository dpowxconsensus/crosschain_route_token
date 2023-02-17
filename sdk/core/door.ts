export class Door {
  pool = {};

  constructor() {}

  close = (eventId, receipt) => {
    this.pool[eventId] = receipt;
  };

  isClosed = (eventId): boolean => {
    return eventId in this.pool;
  };

  isOpened = (eventId): boolean => {
    return !(eventId in this.pool);
  };
}
