export interface HandlerType {
  type: string;
  propertyKey: string;
}

export interface EnvDecoratorConfig extends HandlerType {
  env: string;
}

export interface ParseDecoratorConfig<T> extends HandlerType {
  fn(value: object): T;
}

export type SuppliedDefaults = {
  [key: string]: object;
};

export type AnySettings = {
  [key: string]: any;
};

export interface ClassObject<T extends Settings> {
  new(settings: AnySettings): T;
}

const metaMetaKey = 'class-setting-keys:list';

function getOrCreateKeyList(target: any, propertyKey) {
  const result = Reflect.getMetadata(metaMetaKey, target);
  if (result) {
    return result;
  }

  const list = [];
  Reflect.defineMetadata(metaMetaKey, list, target);
  return list;
}

function defineKeyConfig(metaKey: any, config: any, target: any, propertyKey: string) {
  const list = getOrCreateKeyList(target, propertyKey);
  list.push(metaKey);
  Reflect.defineMetadata(metaKey, config, target, propertyKey);
}

export function env(name) {
  const metaKey = Symbol(`env: ${name}`);
  return (target: any, propertyKey: string) => {
    const config: EnvDecoratorConfig = {
      type: 'env',
      propertyKey,
      env: name,
    };
    defineKeyConfig(metaKey, config, target, 'property');
  };
}

export function parse<T>(fn: (value: object) => T) {
  const metaKey = Symbol(`parse`);
  return (target: any, propertyKey: string) => {
    const config: ParseDecoratorConfig<T> = {
      type: 'parse',
      propertyKey,
      fn,
    };
    defineKeyConfig(metaKey, config, target, 'property');
  };
}

export function environmentHandler(
  value: object,
  designType: any,
  config: EnvDecoratorConfig,
): string | undefined {
  const { env: name } = config;
  return process.env[name];
}

export function parseHandler<T>(
  value: object,
  designType: any,
  config: ParseDecoratorConfig<T>,
): T {
  return config.fn(value);
}

const ClassValues = Symbol(`class setting values`);

export class SettingFactory {
  public handlers = {
    env: environmentHandler,
    parse: parseHandler,
  };

  public create<T>(klass: ClassObject<T>, defaults: SuppliedDefaults = {}): T {
    const keys = Reflect.getMetadata(metaMetaKey, klass.prototype);
    const classMeta = keys.reduce((result, key) => {
      const meta = Reflect.getMetadata(key, klass.prototype, 'property');
      const { propertyKey } = meta;
      const designType = Reflect.getMetadata('design:type', klass.prototype, propertyKey);
      result.designTypes[propertyKey] = designType;

      const handler = this.handlers[meta.type];
      if (!handler) {
        const err =  new Error(`unexpected handler type : ${meta.type}`);
        throw err;
      }
      const value = handler(result.values[propertyKey], designType, meta);
      if (value === undefined) {
        return result;
      }
      result.values[propertyKey] = value;
      return result;
    }, {
      values: { ...defaults },
      designTypes: {},
    });

    return new klass(classMeta.values);
  }
}

export class Settings {
  constructor(values: AnySettings = {}) {
    for (const key in values) {
      if (values[key] === undefined) {
        continue;
      }
      this[key] = values[key];
    }
  }
}