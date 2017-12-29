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

export type ValidateResult = {
  errors: ValidationError[] | null;
  success: boolean;
};

export interface ClassObject<T extends Settings> {
  new(settings: AnySettings): T;
  $validateType(type: any, value: any): boolean;
  $validate(values: AnySettings, types: AnySettings): ValidateResult;
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

export type CreateResult<T> = {
  errors: ValidationError[] | null;
  result: T | null;
};

export type Handler = (
  value: object,
  designType: any,
  config: HandlerType,
) => any;

export class SettingFactory {
  public handlers: { [key: string]: Handler } = {
    env: environmentHandler,
    parse: parseHandler,
  };

  public create<T extends Settings>(
    klass: ClassObject<T>,
    defaults: SuppliedDefaults = {},
  ): CreateResult<T> {
    const keys = Reflect.getMetadata(metaMetaKey, klass.prototype);
    const classMeta = keys.reduce((sum, key) => {
      const meta = Reflect.getMetadata(key, klass.prototype, 'property');
      const { propertyKey } = meta;
      const designType = Reflect.getMetadata('design:type', klass.prototype, propertyKey);
      sum.designTypes[propertyKey] = designType;

      const handler = this.handlers[meta.type];
      if (!handler) {
        const err =  new Error(`unexpected handler type : ${meta.type}`);
        throw err;
      }
      const value = handler(sum.values[propertyKey], designType, meta);
      if (value === undefined) {
        return sum;
      }
      sum.values[propertyKey] = value;
      return sum;
    }, {
      values: { ...defaults },
      designTypes: {},
    });

    const validate = klass.$validate(classMeta.values, classMeta.designTypes);
    if (validate.success) {
      return {
        errors: null,
        result: new klass(classMeta.values),
      };
    }

    return {
      errors: validate.errors,
      result: null,
    };
  }
}

export class ValidationError extends Error {
  public propertyKey: string;
  public type: any;

  constructor(propertyKey: string, type: any, value: any) {
    const msg = `${propertyKey} (${value}) failed to parse as type ${type}`;
    super(msg);
    this.propertyKey = propertyKey;
    this.type = type;
  }
}

const validators = new Map();
validators.set(Boolean, (value) => typeof value === 'boolean');
validators.set(Number, (value) => typeof value === 'number');
validators.set(String, (value) => typeof value === 'string');
validators.set(null, (value) => value === null);

export class Settings {
  public static readonly $validators: Map<any, (value: any) => boolean> = validators;

  public static $validateType(expectedType: any, value: any): boolean {
    const validator = this.$validators.get(expectedType);
    if (validator) {
      return validator(value);
    }
    return (value instanceof expectedType);
  }

  public static $validate(
    values: AnySettings,
    designTypes: AnySettings,
  ): ValidateResult {
    const errors = Object.keys(values).reduce((sum, key: string) => {
      const value = values[key];
      const type = designTypes[key];
      if (!type) {
        throw new Error(`Could not resolve type for ${key}`);
      }
      const validates = this.$validateType(type, value);
      if (!validates) {
        sum.push(new ValidationError(key, type, value));
      }
      return sum;
    }, []);

    if (!errors.length) {
      return {
        success: true,
        errors: null,
      };
    }

    return {
      success: false,
      errors,
    };
  }

  constructor(values: AnySettings = {}) {
    Object.assign(this, values);
  }
}