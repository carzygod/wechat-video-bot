declare namespace Express {
  interface Request {
    auth?: {
      userId: string;
    };
    admin?: {
      username: string;
    };
  }
}
