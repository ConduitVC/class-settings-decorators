export interface HandlerType {
  type: string;
  propertyKey: string;
}

export interface EnvDecoratorConfig extends HandlerType {
  env: string;
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

export function env(name) {
  const metaKey = Symbol(`env: ${name}`);
  return (target: any, propertyKey: string) => {
    const config: EnvDecoratorConfig = {
      type: 'env',
      propertyKey,
      env: name,
    };
    Reflect.defineMetadata(metaKey, config, target, 'property');
  };
}

export function environmentHandler(
  value: object,
  config: EnvDecoratorConfig,
): string | undefined {
  const { env: name } = config;
  return process.env[name];
}

const ClassValues = Symbol(`class setting values`);

export class SettingFactory {
  public handlers = {
    env: environmentHandler,
  };

  public create<T>(klass: ClassObject<T>, defaults: SuppliedDefaults = {}): T {
    const keys = Reflect.getMetadataKeys(klass.prototype, 'property');
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
      const value = handler(result.values[propertyKey], meta);
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