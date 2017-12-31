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

export interface OverwriteDecoratorConfig extends HandlerType {
  type: 'overwrite';
}

export type DecoratorTypes =
  EnvDecoratorConfig |
  ParseDecoratorConfig<any> |
  NestedDecoratorConfig |
  OverwriteDecoratorConfig;

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
  new(): T;
  $validateType(type: DesignType, value: object): boolean;
  $validate(values: AnySettings, types: AnySettings): ValidateResult;
}

const metaClassDecorators = Symbol('class setting decorator list');
const metaDecorators = Symbol('setting decorators');

function getOrCreateKeyList<T>(
  key: symbol,
  target: object,
  defaultValue: T,
  propertyKey?: string,
): T {
  if (propertyKey) {
    const result = Reflect.getMetadata(key, target, propertyKey);
    if (result) { return result; }
  } else {
    const result = Reflect.getMetadata(key, target);
    if (result) { return result; }
  }

  if (propertyKey) {
    Reflect.defineMetadata(key, defaultValue, target, propertyKey);
  } else {
    Reflect.defineMetadata(key, defaultValue, target);
  }
  return defaultValue;
}

function defineKeyConfig(
  config: DecoratorTypes,
  target: object,
  propertyKey: string,
) {
  const defaultPropList: DecoratorTypes[] = [];
  const classList = getOrCreateKeyList(metaClassDecorators, target, new Set());
  const propertyList = getOrCreateKeyList(metaDecorators, target, defaultPropList, propertyKey);

  classList.add(propertyKey);
  propertyList.push(config);
}

export function nested() {
  return (target: object, propertyKey: string) => {
    const config: NestedDecoratorConfig = {
      type: 'nested',
      propertyKey,
    };
    defineKeyConfig(config, target, propertyKey);
  };
}

export function env(name: string) {
  return (target: object, propertyKey: string) => {
    const config: EnvDecoratorConfig = {
      type: 'env',
      propertyKey,
      env: name,
    };
    defineKeyConfig(config, target, propertyKey);
  };
}

export function parse<T>(fn: (value: object) => T) {
  return (target: object, propertyKey: string) => {
    const config: ParseDecoratorConfig<T> = {
      type: 'parse',
      propertyKey,
      fn,
    };
    defineKeyConfig(config, target, propertyKey);
  };
}

export function overwrite() {
  return (target: object, propertyKey: string) => {
    // clear existing decorators.
    Reflect.defineMetadata(metaDecorators, [], target, propertyKey);
  };
}

export function environmentHandler(
  value: object,
  designType: DesignType,
  config: EnvDecoratorConfig,
  factory: SettingFactory,
): string | undefined {
  const { env: name } = config;
  return process.env[name];
}

export function parseHandler<T>(
  value: object,
  designType: DesignType,
  config: ParseDecoratorConfig<T>,
  factory: SettingFactory,
): T {
  return config.fn(value);
}

export function nestedHandler(
  value: object,
  designType: DesignType,
  config: EnvDecoratorConfig,
  factory: SettingFactory,
): Settings {
  if (!designType) {
    throw new Error(`design type for ${config.propertyKey} is null or undefined`);
  }
  // use prototype since this is a class object not an instance.
  if (!(designType.prototype instanceof Settings)) {
    throw new Error(`${config.propertyKey} is not a subclass of settings`);
  }
  return factory.create((designType as ClassObject<Settings>));
}

function overwriteHandler(
  value: object,
  designType: DesignType,
  config: EnvDecoratorConfig,
  factory: SettingFactory,
) {
  // Indicate that the handler value should not be used. The default value will
  // be used instead or one from another handler.
  return undefined;
}

export type CreateResult<T> = {
  errors: ValidationError[] | null;
  result: T | null;
};

export type Handler = (
  value: object,
  designType: DesignType,
  config: EnvDecoratorConfig | ParseDecoratorConfig<any> | NestedDecoratorConfig,
  factory: SettingFactory,
) => any;

export class SettingFactory {
  public handlers: {
    // tslint:disable-next-line ban-types
    [key: string]: Function,
  } = {
    env: environmentHandler,
    parse: parseHandler,
    nested: nestedHandler,
    overwrite: overwriteHandler,
  };

  public create<T extends Settings>(
    classObject: ClassObject<T>,
  ): T {
    const { errors, result } = this.query(classObject);
    if (errors) {
      throw ValidationError.join(errors);
    }
    return (result as T);
  }

  public query<T extends Settings>(
    classObject: ClassObject<T>,
  ): CreateResult<T> {
    const keysUncast = Reflect.getMetadata(metaClassDecorators, classObject.prototype) || [];
    const keys = (keysUncast as Set<string>);
    const classMeta = Array.from(keys).reduce((
      sum: {
        values: AnySettings,
        designTypes: DesignTypes,
      },
      propertyKey: string,
    ) => {
      const ownHandlers = Reflect.getOwnMetadata(metaClassDecorators, classObject.prototype, propertyKey);
      const protoHandlers = Reflect.getMetadata(metaDecorators, classObject.prototype, propertyKey);
      const usedHandlers = ownHandlers || protoHandlers;

      if (!usedHandlers) {
        return sum;
      }

      const designType = Reflect.getMetadata('design:type', classObject.prototype, propertyKey);
      sum.designTypes[propertyKey] = designType;
      const value = this.resolveValue(designType, usedHandlers);
      if (value === undefined) {
        return sum;
      }
      sum.values[propertyKey] = value;
      return sum;
    }, {
      values: {},
      designTypes: {},
    });

    const validate = classObject.$validate(classMeta.values, classMeta.designTypes);
    if (validate.success) {
      const instance = this.buildInstance(classObject, classMeta.values);
      return {
        errors: null,
        result: instance,
      };
    }

    return {
      errors: validate.errors,
      result: null,
    };
  }

  protected buildInstance(
    classObject: ClassObject<any>,
    values: AnySettings,
  ): any {
    class Subclass extends classObject {
      constructor() {
        super();
        for (const key in values) {
          const value = values[key];
          Object.defineProperty(this, key, {
            enumerable: true,
            configurable: true,
            value,
          });
        }
      }
    }

    // Ensure we include the original name but we are subclassed
    Object.defineProperty(Subclass, 'name', {
      value: `(subclass) ${classObject.name}`,
    });
    const instance = new Subclass();
    instance.onBuild();
    return instance;
  }

  protected resolveValue(
    designType: DesignType,
    decorators: DecoratorTypes[],
  ): object | undefined {
    return decorators.reduce((
      sum: object | undefined,
      config: DecoratorTypes,
    ): object | undefined => {
      const handler = this.handlers[config.type];
      if (!handler) {
        const err =  new Error(`unexpected handler type : ${config.type}`);
        throw err;
      }
      const value = handler(sum, designType, config, this);
      if (value === undefined) {
        return sum;
      }
      return value;
    }, undefined);
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
validators.set(Boolean, (value: object) => typeof value === 'boolean');
validators.set(Number, (value: object) => typeof value === 'number');
validators.set(String, (value: object) => typeof value === 'string');
validators.set(null, (value: object) => value === null);

export class Settings {
  public static readonly $validators: Map<DesignType, (value: object) => boolean> = validators;

  // tslint:disable-next-line ban-types
  public static $validateType(expectedType: DesignType, value: object): boolean {
    const validator = this.$validators.get(expectedType);
    if (validator) {
      return validator(value);
    }
    return (value instanceof (expectedType as any));
  }

  public static $validate(
    values: AnySettings,
    designTypes: DesignTypes,
  ): ValidateResult {
    const errors = Object.keys(values).reduce((sum: ValidationError[], key: string) => {
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

  protected onBuild() {
    // here for subclasses.
  }
}