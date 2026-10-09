import { dtoIsRunEvent, RUN_EVENT_DTOS } from './run-event.dto.js';

describe('run event DTOs', () => {
  it('describe every event type once', () => {
    expect(RUN_EVENT_DTOS).toHaveLength(10);
    expect(dtoIsRunEvent({ type: 'run_started' })).toEqual({ type: 'run_started' });
  });
});
