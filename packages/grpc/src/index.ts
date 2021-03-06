import * as grpcLoader from "@grpc/proto-loader";
import * as grpc from "grpc";
import { SrvContext, ServiceGroup, ServiceBase, STOP_KEY } from "@sigodenjs/dee-srv";

export type Service<T extends Grpc<U>, U> = T;

export interface Args {
  // path to server proto file
  serverProtoFile?: string;
  // handler func for service
  serverHandlers?: HandlerFuncMap;
  // path to client Proto file
  clientProtoFile?: string;
  // check whether the client have permision to call the rpc
  havePermision?: CheckPermisionFunc;
  getServerBindOptions?: (ctx: SrvContext) => ServerBindOptions;
  getClientConstructOptions?: (serviceName: string, ctx: SrvContext) => ClientConstructOptions;
}

export async function init<T extends Grpc<U>, U>(ctx: SrvContext, args: Args): Promise<Service<T, U>> {
  const srv = new Grpc();
  const { serverProtoFile, clientProtoFile } = args;
  if (serverProtoFile) {
    srv.server = await createServer(ctx, args);
  }
  if (clientProtoFile) {
    srv.clients = await createClients(ctx, args);
  }
  return srv as Service<T, U>;
}

export { grpc };

export interface ServerBindOptions {
  address: string;
  credentials: grpc.ServerCredentials;
}

export interface ClientConstructOptions {
  address: string;
  credentials: grpc.ChannelCredentials;
  options?: object;
}

export type ClientMap<T> = { [k in keyof T]: Client };

export interface Client {
  call: (name: string, args: any, metdata?: grpc.Metadata) => Promise<any>;
  grpcClient: grpc.Client;
}

export type CheckPermisionFunc = (serviceName: string, id: string) => boolean;

export interface HandlerFuncMap {
  [k: string]: HandlerFunc;
}

export type HandlerFunc = (ctx: Context) => Promise<any>;

export interface Context {
  request: any;
  metadata: grpc.Metadata;
  srvs: ServiceGroup;
}

export class Grpc<U> implements ServiceBase {
  public server?: grpc.Server;
  public clients: ClientMap<U>;
  public [STOP_KEY]() {
    this.server.tryShutdown(() => { });
    Object.keys(this.clients).forEach(k => this.clients[k].grpcClient.close());
  }
}

async function createServer(ctx: SrvContext, args: Args): Promise<grpc.Server> {
  const { serverProtoFile, serverHandlers, havePermision = () => true, getServerBindOptions } = args;
  const { ns, name } = ctx.config;
  const protoRoot = loadProtoFile(serverProtoFile);
  let proto: grpc.GrpcObject;
  try {
    proto = protoRoot[ns][name];
    proto.service;
  } catch (err) {
    throw new Error(`no grpc service at ${ns}.${name}`);
  }
  const server = new grpc.Server();
  server.addService(proto.service, shimHandlers(serverHandlers, havePermision, ctx.srvs));
  if (typeof getServerBindOptions !== "function") {
    throw new Error("getServerBindOptions is required");
  }
  const bindOptions = getServerBindOptions(ctx);
  server.bind(bindOptions.address, bindOptions.credentials);
  server.start();
  return server;
}

function shimHandlers(handlers: HandlerFuncMap, havePermision: CheckPermisionFunc, srvs: ServiceGroup) {
  const result = {};
  Object.keys(handlers).forEach(id => {
    const fn = handlers[id];
    result[id] = (ctx: Context, cb) => {
      const origin = ctx.metadata.get("origin");
      if (!havePermision(String(origin[0]), id)) {
        cb(new GrpcError(grpc.status.PERMISSION_DENIED, "Permission denied"));
        return;
      }
      ctx.srvs = srvs;
      fn(ctx)
        .then(res => cb(null, res))
        .catch(cb);
    };
  });
  return result;
}

async function createClients<T>(ctx: SrvContext, args: Args): Promise<T> {
  const clients = {} as T;
  const { clientProtoFile, getClientConstructOptions } = args;
  const { ns, name } = ctx.config;
  const protoRoot = loadProtoFile(clientProtoFile);
  const proto = protoRoot[ns];
  Object.keys(proto).forEach(serviceName => {
    const GrpcClientObj = proto[serviceName];
    if (GrpcClientObj.name !== "ServiceClient") {
      return;
    }
    const GrpcClient: typeof grpc.Client = GrpcClientObj;
    if (typeof getClientConstructOptions !== "function") {
      throw new Error("getClientConstructOptions is required");
    }
    const constructOptions = getClientConstructOptions(serviceName, ctx);
    const grpcClient = new GrpcClient(constructOptions.address, constructOptions.credentials, constructOptions.options);
    const client: Client = {
      grpcClient,
      call: (funcName: string, data: any, metadata?: grpc.Metadata) => {
        if (!metadata) {
          metadata = new grpc.Metadata();
        }
        metadata.add("origin", name);
        const fn = grpcClient[funcName];
        return new Promise((resolve, reject) => {
          if (!fn) {
            return reject(new GrpcError(grpc.status.UNIMPLEMENTED, serviceName + "." + funcName + " is not supported"));
          }
          grpcClient[funcName](data, metadata, (err, res) => {
            if (err) {
              return reject(err);
            }
            resolve(res);
          });
        });
      },
    };
    clients[serviceName] = client;
  });
  return clients;
}

function loadProtoFile(filename: string): grpc.GrpcObject {
  return grpc.loadPackageDefinition(grpcLoader.loadSync(filename));
}

export class GrpcError extends Error {
  public readonly code: grpc.status;
  constructor(code: grpc.status, message: string) {
    super(message);
    this.code = code;
    this.name = "GrpcError";
  }
}