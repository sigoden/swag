import * as winston from "winston";
import { MESSAGE } from "triple-beam";
import { dump } from "js-yaml";
import { isPlainObject } from "lodash";
import { SrvContext, ServiceBase, Ctor, SrvConfig, STOP_KEY } from "@sigodenjs/dee-srv";

export type Service<T extends Logger> = T;

export interface Args {
  console?: winston.transports.ConsoleTransportOptions & { yamlOrJson: "yaml" | "json" } | false;
  file?: winston.transports.FileTransportOptions;
  http?: winston.transports.HttpTransportOptions;
}

export async function init<T extends Logger>(ctx: SrvContext, args: Args, ctor?: Ctor<T>): Promise<Service<T>> {
  const srv = new (ctor || Logger)(ctx.config, args);
  return srv as Service<T>;
}

const myFormat = winston.format((info, opts = {}) => {
  const { level, message } = info;
  let messgaeObj: any = {};
  if (typeof message === "string") {
    messgaeObj.message = message;
  } else {
    messgaeObj = message;
  }
  Object.assign(info, { level, timestamp: new Date().toISOString(), ...messgaeObj });
  return info;
});

const myConsoleFormat = winston.format((info, opts) => {
  const data = { ...info, timestamp: new Date().toISOString() };
  info[MESSAGE] = opts.yamlOrJson === "yaml" ? dump({[info.level]: data}, { skipInvalid: true }) : JSON.stringify(data);
  return info;
});

export class Logger implements ServiceBase {
  public readonly loggers?: winston.Logger[];
  constructor(config: SrvConfig, args: Args) {
    const { json, combine } = winston.format;
    const defaultMeta = { service: [config.ns, config.name].join(".") };
    this.loggers = [];
    const { console = { yamlOrJson: "yaml" } } = args;
    if (console) {
      const { yamlOrJson = "yaml", ...otherConsoleArgs } = console;
      this.loggers.push(winston.createLogger({
        defaultMeta,
        format: myConsoleFormat({ yamlOrJson }),
        transports: [new winston.transports.Console(otherConsoleArgs)],
      }));
    }
    if (args.http || args.file) {
      const transports = [];
      if (args.http) {
        transports.push(new winston.transports.Http(args.http));
      }
      if (args.file) {
        transports.push(new winston.transports.File(args.file));
      }
      this.loggers.push(winston.createLogger({
        defaultMeta,
        format: combine(myFormat(), json()),
        transports,
      }));
    }
  }
  public info(message: string, extra: any = {}): void {
    const data = { message, ...extraToObj(extra) };
    this.loggers.forEach(logger => logger.info(data));
  }
  public debug(message: string, extra: any = {}): void {
    const data = { message, ...extraToObj(extra) };
    this.loggers.forEach(logger => logger.debug(data));
  }
  public warn(message: string, extra: any = {}): void {
    const data = { message, ...extraToObj(extra) };
    this.loggers.forEach(logger => logger.warn(data));
  }
  public error(message: Error | string, extra: any = {}): void {
    const data = { ...messageToObj(message), ...extraToObj(extra) };
    this.loggers.forEach(logger => logger.error(data));
  }
  public [STOP_KEY]() {
    return;
  }
}

function messageToObj(message: Error | string) {
  if (message instanceof Error) {
    return { message: message.message, stack: message.stack, class: message.name };
  }
  return { message };
}
function extraToObj(extra: any) {
  return isPlainObject(extra) ? extra : { extra };
}
