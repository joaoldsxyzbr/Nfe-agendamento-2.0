type WorkerEnv = Readonly<{
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
}>;

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return env.ASSETS.fetch(request);
  },
};
