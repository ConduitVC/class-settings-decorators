import 'reflect-metadata';

import {
  env,
  parse,
  SettingFactory,
  Settings,
} from '../';

describe('lifecycle', () => {
  class OnConfig {
    public value: any;
    constructor(value: any) {
      this.value = value;
    }
  }
  // ts
  class TestClass extends Settings {
    @env('_TEST_FOO')
    public foo: number;
    @env('_TEST_BAR')
    public bar: string = 'sup';
    @parse((value) => new OnConfig(value))
    @env('_TEST_ON_CONFIG')
    public config?: OnConfig;
  }

  it('should allow defaults when environment variable is missing', () => {
    Object.assign(process.env, {
      _TEST_FOO: 'foo',
    });

    const factory = new SettingFactory();
    const result = factory.create(TestClass);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      foo: 'foo',
      bar: 'sup',
    });
  });

  it('it should allow parsing of values', () => {
    Object.assign(process.env, {
      _TEST_ON_CONFIG: 'foo',
    });

    const factory = new SettingFactory();
    const result = factory.create(TestClass);
    expect(result).toBeInstanceOf(TestClass);
    expect(result).toMatchObject({
      bar: 'sup',
    });
    expect(result.config).toBeInstanceOf(OnConfig);
    expect(result.config.value).toBe('foo');
  });
});