// Type augmentation for what passport and express-session keep on the request. Imported for its side effect on types only.
declare module 'express-session' {
  interface SessionData {
    /** Epoch milliseconds of the login; the fixed maximum lifetime counts from here. */
    createdAt?: number;
  }
}

declare global {
  namespace Express {
    interface User {
      id: string;
      email: string;
      emailConfirmed: boolean;
    }
  }
}

export {};
