import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Marks a route as reachable without login. Everything else needs one (global guard). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
