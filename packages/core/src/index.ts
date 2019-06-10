/* eslint-disable @typescript-eslint/no-namespace, @typescript-eslint/no-empty-interface */
import * as Openapize from "@sigodenjs/openapize";
import * as express from "express";
import { Server } from "http";

declare module "express" {
  interface Request {
    openapi: Openapize.API;
    srvs: ServiceGroup;
  }
}
import { Request, Response, NextFunction, RequestHandler, Express, ErrorRequestHandler } from "express";

export { Request, Response, NextFunction, RequestHandler, Express, ErrorRequestHandler };

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 3000;

declare global {
  namespace DeeShare {
    interface ServiceGroup {}
  }
}

export { SecurityError, ValidationError } from "@sigodenjs/openapize";

export interface HandlerFuncMap extends Openapize.HandlerFuncMap {}

export type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<any>;

// options to init dee app
export interface Options {
  // general config
  config: Config;
  // options to init openapize service
  openapize?: Openapize.Options | Openapize.Options[];
  // hook to run before bind route handlers
  beforeRoute?: RouteHooks;
  // hook to run after bind route handlers
  afterRoute?: RouteHooks;
  // error handler
  errorHandler?: ErrorRequestHandler;
  // run when app is ready
  ready?: (app: App) => void;
  // options to init external services
  services?: ServicesOptionsMap;
}

export interface ServiceInitializeContext {
  srvs: ServiceGroup;
}

export interface App {
  srvs: ServiceGroup;
  express: Express;
  start: () => Promise<Server>;
}

export interface ServiceGroup extends DeeShare.ServiceGroup {
  $config: Config;
  $services?: ServicesOptionsMap;
  [k: string]: Service;
}

export interface Service {}

export type ServiceInitializeFunc = (
  ctx: ServiceInitializeContext,
  args?: any,
  callback?: (err: Error, srv?: Service) => void
) => Promise<Service> | void;

export interface Config {
  // namespace of service
  ns: string;
  // name of app
  name: string;
  // listenning host
  host?: string;
  // listenning port
  port?: number;
  // whether production mode
  prod?: boolean;
  $services?: ServicesOptionsMap;
  [k: string]: any;
}

export type RouteHooks = (srvs: ServiceGroup, app: Express) => void | RequestHandler[];

export interface ServicesOptionsMap {
  [k: string]: ServiceOptions;
}

export interface ServiceOptions {
  initialize: ServiceInitializeFunc | ServiceInitializeModule;
  args?: any;
}

export interface ServiceOptionsT<T> extends ServiceOptions {
  args: T;
}

export type ServiceInitializeModule = string;

async function createSrvs(options: Options): Promise<ServiceGroup> {
  const { services: servicesOpts =  {}, config } = options;
  const srvs: ServiceGroup = { $config: config, $services: servicesOpts };
  const promises = Object.keys(servicesOpts).map(srvName => {
    const srvOptions = servicesOpts[srvName];
    const ctx = { srvs } as ServiceInitializeContext;
    return createSrv(ctx, srvName, srvOptions);
  });
  await Promise.all(promises);
  return srvs;
}

async function createSrv(ctx: ServiceInitializeContext, srvName: string, options: ServiceOptions): Promise<void> {
  let srvInitialize: ServiceInitializeFunc;
  if (typeof options.initialize === "string") {
    try {
      srvInitialize = require(options.initialize).init;
    } catch (err) {
      throw new Error(`servcie.${srvName}.initialize is a invalid module`);
    }
  } else {
    srvInitialize = options.initialize;
  }
  return new Promise<void>((resolve, reject) => {
    const promise = srvInitialize(ctx, options.args, (err, srv) => {
      if (err) {
        reject(new Error(`service.${srvName} has error, ${err.message}`));
        return;
      }
      ctx.srvs[srvName] = srv;
      resolve();
    });
    if (promise && promise.then) {
      promise
        .then(srv => {
          ctx.srvs[srvName] = srv;
          resolve();
        })
        .catch(err => {
          reject(new Error(`service.${srvName} has error, ${err.message}`));
        });
    }
  });
}

function useMiddlewares(srvs: ServiceGroup, app: Express, hooks: RouteHooks) {
  if (typeof hooks === "function") {
    hooks(srvs, app);
    return;
  }
  for (const mid of Array<RequestHandler>(hooks)) {
    app.use(mid);
  }
}

export async function init(options: Options): Promise<App> {
  const app = express();
  const srvs = await createSrvs(options);
  app.use((req: Request, res, next) => {
    req.srvs = srvs;
    next();
  });
  if (options.beforeRoute) {
    useMiddlewares(srvs, app, options.beforeRoute);
  }
  if (Array.isArray(options.openapize)) {
    for (const openapizeOptions of options.openapize) {
      await Openapize.openapize(app, openapizeOptions);
    }
  } else if (options.openapize) {
    await Openapize.openapize(app, options.openapize);
  }
  if (options.afterRoute) {
    useMiddlewares(srvs, app, options.afterRoute);
  }

  const start = () => {
    const port = options.config.port || DEFAULT_PORT;
    const host = options.config.host || DEFAULT_HOST;
    return new Promise<Server>(resolve => {
      if (options.errorHandler) {
        app.use(options.errorHandler);
      }
      const server = app.listen(port, host, () => {
        resolve(server);
      });
    });
  };
  const deeApp = { srvs, express: app, start };
  if (options.ready) {
    options.ready(deeApp);
  }
  return deeApp;
}

export function resolveAsynRequestHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const fnReturn = fn(req, res, next);
    Promise.resolve(fnReturn).catch(next);
  };
}
