import 'reflect-metadata';

import {
  env,
  parse,
  SettingFactory,
  Settings,
} from '../';

describe('class-settings-decorators', () => {

  let originalProcessEnv;

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
        expect(TestClass.$validateType(type, value)).toBe(true);
      });
    }

    for (const [type, value] of typesInvalid) {
      it(`it should fail to validate ${value} as ${type}`, () => {
        const subject = new TestClass({
          foo: 1,
        });
        expect(TestClass.$validateType(type, value)).toBe(false);
      });
    }
  });

  it('should throw when using invalid handler', () => {
    class NewFactory extends SettingFactory {
      public readonly handlers = {};
    }

    expect(() => {
      const factory = new NewFactory();
      const out = factory.create(TestClass);
    }).toThrowError(/env/);
  });

  it('should allow defaults when environment variable is missing', () => {
    Object.assign(process.env, {
      _TEST_FOO: 1,
    });

    const factory = new SettingFactory();
    const { result, errors } = factory.create(TestClass);
    expect(errors).toBe(null);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      foo: 1,
      bar: 'sup',
    });
  });

  it('it should allow parsing of values', () => {
    Object.assign(process.env, {
      _TEST_ON_CONFIG: 'foo',
    });

    const factory = new SettingFactory();
    const { result } = factory.create(TestClass);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      bar: 'sup',
    });
    expect(result.config).toBeInstanceOf(OnConfig);
    expect(result.config.value).toBe('foo');
  });

  it('it should return errors', () => {
    Object.assign(process.env, {
      _TEST_FOO: false,
      _TEST_ON_CONFIG: 'foo',
    });

    const factory = new SettingFactory();
    const { result, errors } = factory.create(TestClass);
    expect(result).toBeFalsy();
    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(error.propertyKey).toBe('foo');
  });

  it('should have the top most decorator win', () => {
    Object.assign(process.env, {
      _TEST_FOO: 1,
      _TEST_FOO_PLUS: 100,
    });

    const factory = new SettingFactory();
    const { result, errors } = factory.create(TestClass);
    expect(errors).toBe(null);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      foo: 100,
      bar: 'sup',
    });
  });
});