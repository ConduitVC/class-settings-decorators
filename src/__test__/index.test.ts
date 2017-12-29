import 'reflect-metadata';

import {
  env,
  SettingFactory,
  Settings,
} from '../';

describe('lifecycle', () => {
  class OnConfig {}
  // ts
  class TestClass extends Settings {
    @env('_TEST_FOO')
    public foo: number;
    @env('_TEST_BAR')
    public bar: string = 'sup';
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
});