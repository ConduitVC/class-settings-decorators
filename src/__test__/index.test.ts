import 'reflect-metadata';

import {
  env,
  parse,
  nested,
  overwrite,
  SettingFactory,
  Settings,
} from '../';

describe('class-settings-decorators', () => {

  let originalProcessEnv: any;

  beforeEach(() => {
    originalProcessEnv = process.env;
    process.env = { ...originalProcessEnv };
  });

  afterEach(() => {
    process.env = originalProcessEnv;
  });

  class OnConfig {
    public value: any;
    constructor(value: any) {
      this.value = value;
    }
  }

  class Nested extends Settings {
    @env('_NESTED')
    public config: string;
  }

  // ts
  class TestClass extends Settings {
    @env('_TEST_FOO_PLUS')
    @env('_TEST_FOO')
    public foo: number;
    @env('_TEST_BAR')
    public bar: string = 'sup';
    @parse((value) => new OnConfig(value))
    @env('_TEST_ON_CONFIG')
    public config?: OnConfig;
    @nested()
    public nested: Nested;
  }

  describe('.$validateType', () => {
    const typesValid = [
      [Object, {}],
      [Object, { 1: true }],
      [String, ''],
      [Number, 1],
      [Boolean, true],
      [Boolean, false],
      [null, null],
      [OnConfig, new OnConfig(1)],
    ];

    const typesInvalid = [
      [Object, null],
      [Object, 1],
      [Object, ''],
      [Object, true],
      [Number, true],
      [Number, ''],
      [Number, {}],
      [Number, null],
      [Boolean, null],
      [Boolean, 1],
      [Boolean, ''],
      [Boolean, 'true'],
      [null, 'true'],
      [null, 1],
      [null, 0],
      [OnConfig, {}],
    ];

    for (const [type, value] of typesValid) {
      it(`it should validate ${value} as ${type}`, () => {
        expect(TestClass.$validateType((type as any), (value as any))).toBe(true);
      });
    }

    for (const [type, value] of typesInvalid) {
      it(`it should fail to validate ${value} as ${type}`, () => {
        expect(TestClass.$validateType((type as any), (value as any))).toBe(false);
      });
    }
  });

  it('should throw when using invalid handler', () => {
    class NewFactory extends SettingFactory {
      public readonly handlers = {};
    }

    expect(() => {
      const factory = new NewFactory();
      factory.query(TestClass);
    }).toThrowError(/env/);
  });

  it('should allow defaults when environment variable is missing', () => {
    Object.assign(process.env, {
      _TEST_FOO: 1,
    });

    const factory = new SettingFactory();
    const { result, errors } = factory.query(TestClass);
    expect(errors).toBe(null);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      foo: 1,
      bar: 'sup',
    });
    expect(result && result.config).toBeInstanceOf(OnConfig);
  });

  it('it should allow parsing of values', () => {
    Object.assign(process.env, {
      _TEST_ON_CONFIG: 'foo',
    });

    const factory = new SettingFactory();
    const { result } = factory.query(TestClass);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      bar: 'sup',
    });
    expect(result && result.config).toBeInstanceOf(OnConfig);
    expect(result && result.config && result.config.value).toBe('foo');
  });

  it('it should return errors', () => {
    Object.assign(process.env, {
      _TEST_FOO: false,
      _TEST_ON_CONFIG: 'foo',
    });

    const factory = new SettingFactory();
    const { result, errors } = factory.query(TestClass);
    expect(result).toBeFalsy();
    expect(errors).toHaveLength(1);
    const [error] = errors as any;
    expect(error.propertyKey).toBe('foo');
  });

  it('should have the top most decorator win', () => {
    Object.assign(process.env, {
      _TEST_FOO: 1,
      _TEST_FOO_PLUS: 100,
    });

    const factory = new SettingFactory();
    const { result, errors } = factory.query(TestClass);
    expect(errors).toBe(null);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      foo: 100,
      bar: 'sup',
    });
  });

  it('should allow nested settings objects', () => {
    Object.assign(process.env, {
      _TEST_FOO: 1,
      _TEST_FOO_PLUS: 100,
      _NESTED: 'supfoo',
    });

    const factory = new SettingFactory();
    const { result, errors } = factory.query(TestClass);
    expect(errors).toBe(null);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      foo: 100,
      bar: 'sup',
      nested: {
        config: 'supfoo',
      },
    });
  });

  it('should throw an error when invalid props are given in nested object', () => {
    Object.assign(process.env, {
      _TEST_FOO: 1,
      _TEST_FOO_PLUS: 100,
      _NESTED: 1,
    });

    const factory = new SettingFactory();

    expect(() => {
      factory.query(TestClass);
    }).toThrowError(/config/);
  });

  it('should not throw on class with no decorators', () => {
    class NoSettings extends Settings {
      public foo = '100';
    }

    const factory = new SettingFactory();
    const result = factory.create(NoSettings);
    expect(result.foo).toBe('100');
  });

  it('should allow overriding settings in subclasses', () => {
    Object.assign(process.env, {
      _TEST_FOO_PLUS: 1,
      _TEST_BAR: 'bar',
    });

    let calledOnBuild = false;
    class Sub extends TestClass {
      @overwrite()
      public foo: number = 100;

      public onBuild() {
        calledOnBuild = true;
        expect(this.foo).toBe(100);
        expect(this.bar).toBe('bar');
      }
    }
    const factory = new SettingFactory();
    const sub = factory.create(Sub);
    const parent = factory.create(TestClass);
    expect(calledOnBuild).toBe(true);
    expect(sub).toBeInstanceOf(Sub);
    expect(sub).toMatchObject({
      foo: 100,
      bar: 'bar',
    });

    expect(parent).toMatchObject({
      foo: 1,
      bar: 'bar',
    });
  });
});