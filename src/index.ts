export interface HandlerType {
  type: string;
  propertyKey: string;
}

export interface EnvDecoratorConfig extends HandlerType {
  type: 'env';
  env: string;
}

export interface ParseDecoratorConfig<T> extends HandlerType {
  type: 'parse';
  fn(value: object): T;
}

export interface NestedDecoratorConfig extends HandlerType {
  type: 'nested';
}

export type SuppliedDefaults = {
  [key: string]: object;
};

export type AnySettings = {
  [key: string]: any;
};

// tslint:disable-next-line ban-types
export type DesignType = Function | null | undefined;

export type DesignTypes = {
  [key: string]: DesignType;
};

export type ValidateResult = {
  errors: ValidationError[] | null;
  success: boolean;
};

export interface ClassObject<T extends Settings> {
  new(settings: AnySettings): T;
  $validateType(type: object, value: object): boolean;
  $validate(values: AnySettings, types: AnySettings): ValidateResult;
}

const metaMetaKey = 'class-setting-keys:list';

function getOrCreateKeyList(target: object, propertyKey) {
  const result = Reflect.getMetadata(metaMetaKey, target);
  if (result) {
    return result;
  }

  const list = [];
  Reflect.defineMetadata(metaMetaKey, list, target);
  return list;
}

function defineKeyConfig(metaKey: symbol, config: object, target: object, propertyKey: string) {
  const list = getOrCreateKeyList(target, propertyKey);
  list.push(metaKey);
  Reflect.defineMetadata(metaKey, config, target, propertyKey);
}

export function nested() {
  return (target: object, propertyKey: string) => {
    const metaKey = Symbol(`nested ${propertyKey}`);
    const config: NestedDecoratorConfig = {
      type: 'nested',
      propertyKey,
    };
    defineKeyConfig(metaKey, config, target, 'property');
  };
}

export function env(name) {
  const metaKey = Symbol(`env: ${name}`);
  return (target: object, propertyKey: string) => {
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
  return (target: object, propertyKey: string) => {
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
  designType: object,
  config: EnvDecoratorConfig,
  factory: SettingFactory,
): string | undefined {
  const { env: name } = config;
  return process.env[name];
}

export function parseHandler<T>(
  value: object,
  designType: object,
  config: ParseDecoratorConfig<T>,
  factory: SettingFactory,
): T {
  return config.fn(value);
}

export function nestedHandler<T>(
  value: object,
  designType: ClassObject<T>,
  config: EnvDecoratorConfig,
  factory: SettingFactory,
): Settings {
  // use prototype since this is a class object not an instance.
  if (!(designType.prototype instanceof Settings)) {
    throw new Error(`${config.propertyKey} is not a subclass of settings`);
  }
  const { result, errors } = factory.create(designType);
  if (errors) {
    throw ValidationError.join(errors);
  }
  return result;
}

const ClassValues = Symbol(`class setting values`);

export type CreateResult<T> = {
  errors: ValidationError[] | null;
  result: T | null;
};

export type Handler = (
  value: object,
  designType: object,
  config: HandlerType,
  factory: SettingFactory,
) => any;

export class SettingFactory {
  public handlers: { [key: string]: Handler } = {
    env: environmentHandler,
    parse: parseHandler,
    nested: nestedHandler,
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
      const value = handler(sum.values[propertyKey], designType, meta, this);
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
  public static join(errors: ValidationError[]): Error {
    const fields = errors.map((value) => value.propertyKey);
    const messages = errors.map((value) => value.message);

    let message = `Error in ${fields.join(', ')} fields\n`;
    message += messages.join('\n');
    return new Error(message);
  }

  public propertyKey: string;
  public type: object;

  constructor(propertyKey: string, type: object, value: object) {
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
  public static readonly $validators: Map<object, (value: object) => boolean> = validators;

  // tslint:disable-next-line ban-types
  public static $validateType(expectedType: DesignType, value: object): boolean {
    const validator = this.$validators.get(expectedType);
    if (validator) {
      return validator(value);
    }
    return (value instanceof expectedType);
  }

  public static $validate(
    values: AnySettings,
    designTypes: DesignTypes,
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