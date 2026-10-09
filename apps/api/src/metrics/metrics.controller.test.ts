import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { MetricsController } from './metrics.controller.js';
import { Metrics } from './metrics.js';

const controllerWith = (token: string | undefined) =>
  new MetricsController(new Metrics(), { get: () => token } as never);

describe('MetricsController', () => {
  it('does not exist while no token is configured', async () => {
    await expect(controllerWith(undefined).scrape('Bearer anything')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects a missing or wrong token', async () => {
    const controller = controllerWith('a-long-enough-secret-token');
    await expect(controller.scrape(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.scrape('Bearer wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.scrape('a-long-enough-secret-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('serves the metrics for the right token', async () => {
    const text = await controllerWith('a-long-enough-secret-token').scrape('Bearer a-long-enough-secret-token');
    expect(text).toContain('agent_active_runs');
  });
});
