/**
 * The only Pages Function: forwards /api/* (account API, OAuth callbacks, and relay WebSockets) to
 * the account worker through a service binding, so the site and API share one origin. Static pages
 * never invoke it.
 */
interface Env {
  readonly CONTROL: { fetch(request: Request): Promise<Response> }
}

/** @public Pages routes /api/* here by this file's path. */
export const onRequest = ({ request, env }: { request: Request; env: Env }) =>
  env.CONTROL.fetch(request)
